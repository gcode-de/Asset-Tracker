import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ state: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() }, counter: { findOneAndUpdate: vi.fn(), findOne: vi.fn(), updateOne: vi.fn() }, fx: { findOne: vi.fn(), findOneAndUpdate: vi.fn() }, keys: vi.fn() }));
vi.mock("@/db/models/AlphaVantageState", () => ({ default: mocks.state }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.counter.findOne.mockResolvedValue(null);
  mocks.counter.updateOne.mockResolvedValue({});
  mocks.state.findOne.mockResolvedValue(null);
  mocks.state.findOneAndUpdate.mockResolvedValue({});
  mocks.state.updateOne.mockResolvedValue({ matchedCount: 1 });
});
vi.mock("@/db/models/ApiCounter", () => ({ default: mocks.counter }));
vi.mock("@/db/models/FxRate", () => ({ default: mocks.fx }));
vi.mock("@/lib/alpha-vantage-key-resolver", () => ({ resolveAlphaVantageKeys: mocks.keys }));
import { createAlphaVantageClient, getAlphaVantageQuota, PROVIDER_TIMEOUT_MS, PROVIDER_LEASE_MS } from "./alpha-vantage-provider";

it("paces a new client from persistent state while holding a lease", async () => {
  mocks.keys.mockResolvedValue([{ key: "test-1" }]);
  mocks.counter.findOne.mockResolvedValue(null);
  mocks.counter.findOneAndUpdate.mockResolvedValue({ count: 1, limit: 25 });
  mocks.state.findOneAndUpdate.mockResolvedValue({ lastProviderRequestAt: new Date(10_000) });
  let now = 10_100;
  const wait = vi.fn(async (ms: number) => { now += ms; });
  const fetcher = vi.fn().mockImplementation(async () => { expect(now).toBe(11_500); return Response.json({}); });
  const client = await createAlphaVantageClient("user@example.com", fetcher, { now: () => now, wait });
  await client.request({ function: "SYMBOL_SEARCH" });
  expect(wait).toHaveBeenCalledWith(1400);
  expect(mocks.state.findOneAndUpdate).toHaveBeenCalled();
});

it("makes zero calls during a persisted throttle, even when rotation puts a clean key first", async () => {
  mocks.keys.mockResolvedValue([{ key: "test-2" }, { key: "test-1" }]);
  mocks.counter.findOne.mockResolvedValue(null);
  mocks.counter.findOneAndUpdate.mockResolvedValue({ count: 1, limit: 25 });
  mocks.state.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ cooldownUntil: new Date(30_000), cooldownCode: "ALPHA_RATE_LIMIT_BURST" });
  const fetcher = vi.fn().mockResolvedValue(Response.json({}));
  const client = await createAlphaVantageClient("user@example.com", fetcher, { now: () => 20_000, wait: vi.fn() });
  await expect(client.request({ function: "SYMBOL_SEARCH" })).rejects.toMatchObject({ code: "ALPHA_RATE_LIMIT_BURST", retryAfter: 10 });
  expect(fetcher).not.toHaveBeenCalled();
  expect(client.apiCalls).toBe(0);
  expect(mocks.keys).not.toHaveBeenCalledWith("user@example.com", { advance: true });
  expect(mocks.counter.findOneAndUpdate).not.toHaveBeenCalled();
});

it("honors a bounded HTTP429 Retry-After without exposing the response body or retrying", async () => {
  mocks.keys.mockResolvedValue([{ key: "test-1" }, { key: "test-2" }]);
  mocks.counter.findOneAndUpdate.mockResolvedValue({ count: 1, limit: 25 });
  const fetcher = vi.fn().mockResolvedValue(new Response("private-key", { status: 429, headers: { "Retry-After": "120" } }));
  const client = await createAlphaVantageClient("user@example.com", fetcher, { now: () => 20_000, wait: vi.fn() });
  await expect(client.request({ function: "GLOBAL_QUOTE" })).rejects.toMatchObject({ code: "ALPHA_RATE_LIMIT_UNKNOWN", retryAfter: 120, message: expect.not.stringContaining("private-key") });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(client.apiCalls).toBe(1);
  expect(mocks.state.updateOne).toHaveBeenCalledWith(expect.anything(), { $set: { cooldownUntil: new Date(140_000), cooldownCode: "ALPHA_RATE_LIMIT_UNKNOWN" } });
});

it.each([
  ["Our standard API rate limit is 25 requests per day. Please consider spreading out your free API requests more sparingly (1 request per second).", "ALPHA_RATE_LIMIT_BURST"],
  ["You have exceeded your daily request limit.", "ALPHA_RATE_LIMIT_DAILY"],
  ["Our standard API rate limit is 25 requests per day.", "ALPHA_RATE_LIMIT_UNKNOWN"],
  ["This is a premium endpoint. Subscribe to a premium plan.", "ALPHA_PLAN"],
  ["This exchange rate endpoint is premium-only.", "ALPHA_PLAN"],
  ["Premium subscription required to access real-time exchange rates.", "ALPHA_PLAN"],
  ["Daily request limit exhausted. Please consider spreading out requests.", "ALPHA_RATE_LIMIT_DAILY"],
])("diagnoses provider Information safely: %s", async (message, code) => {
  mocks.keys.mockResolvedValue([{ key: "test-1" }]);
  mocks.counter.findOne.mockResolvedValue(null);
  mocks.counter.findOneAndUpdate.mockResolvedValue({ count: 1, limit: 25 });
  mocks.counter.updateOne.mockResolvedValue({ matchedCount: 1 });
  const client = await createAlphaVantageClient("user@example.com", vi.fn().mockResolvedValue(Response.json({ Information: `${message} private-key` })));
  await expect(client.request({ function: "GLOBAL_QUOTE" })).rejects.toMatchObject({ code, message: expect.not.stringContaining("private-key") });
  expect(client.apiCalls).toBe(1);
});

describe("shared provider quota", () => {
  it.each([0, 1, 2, 3])("aggregates %i own tokens, exposing only totals", async (number) => {
    mocks.keys.mockResolvedValue(Array.from({ length: number || 1 }, (_, i) => ({ key: `test-${i}`, identifier: number ? "user" : "server" })));
    const quota = await getAlphaVantageQuota("user@example.com");
    expect(quota).toEqual({ date: expect.any(String), count: 0, limit: (number || 1) * 25, remaining: (number || 1) * 25 });
    expect(mocks.keys).toHaveBeenCalledWith("user@example.com", { advance: false });
  });
  it("reuses a persistent EUR FX cache across independent per-asset clients", async () => {
    mocks.keys.mockResolvedValue([{ key: "test-1" }]);
    mocks.fx.findOne.mockResolvedValue({ rate: 0.9, timestamp: new Date() });
    const fetcher = vi.fn();
    const first = await createAlphaVantageClient("user@example.com", fetcher);
    const second = await createAlphaVantageClient("user@example.com", fetcher);
    expect(await first.fxToEUR("USD")).toBe(0.9);
    expect(await second.fxToEUR("USD")).toBe(0.9);
    expect(fetcher).not.toHaveBeenCalled();
    expect(first.apiCalls + second.apiCalls).toBe(0);
  });
  it.each(["expired", "invalid", "future"])("refreshes a %s FX cache entry and persists a finite positive rate", async (kind) => {
    mocks.keys.mockResolvedValue([{ key: "test-1" }]);
    mocks.fx.findOne.mockResolvedValue({ rate: kind === "invalid" ? Infinity : 0.8, timestamp: new Date(Date.now() + (kind === "future" ? 100000 : kind === "expired" ? -3600000 : 0)) });
    mocks.counter.findOneAndUpdate.mockResolvedValue({ count: 1, limit: 25 });
    const fetcher = vi.fn().mockResolvedValue(Response.json({ "Realtime Currency Exchange Rate": { "5. Exchange Rate": "0.9" } }));
    const client = await createAlphaVantageClient("user@example.com", fetcher);
    expect(await client.fxToEUR("USD")).toBe(0.9);
    expect(client.apiCalls).toBe(1);
    expect(mocks.fx.findOneAndUpdate).toHaveBeenCalledWith({ from: "USD", to: "EUR" }, { $set: { rate: 0.9, timestamp: expect.any(Date) } }, { upsert: true, new: true });
  });
  it.each([502, 504, 200])("reports safe provider HTTP/JSON failures for status %i and counts the attempt", async (status) => {
    mocks.keys.mockResolvedValue([{ key: "test-1" }]);
    mocks.counter.findOneAndUpdate.mockResolvedValue({ count: 1, limit: 25 });
    const fetcher = vi.fn().mockResolvedValue(new Response("<html>private-provider-key</html>", { status }));
    const client = await createAlphaVantageClient("user@example.com", fetcher);
    let failure: any;
    try { await client.request({ function: "GLOBAL_QUOTE" }); } catch (error) { failure = error; }
    expect(failure.code).toBe("ALPHA_RESPONSE");
    expect(failure.message).not.toMatch(/html|private-provider-key|JSON.parse/);
    expect(failure.message).toMatch(status === 200 ? /non-JSON/ : new RegExp(String(status)));
    expect(client.apiCalls).toBe(1);
    expect(mocks.counter.updateOne).toHaveBeenCalledTimes(1);
  });
  it("deduplicates token fingerprints and honors configured limits without exposing metadata", async () => {
    mocks.keys.mockResolvedValue([{ key: "test-1", identifier: "masked-one" }, { key: "test-1", identifier: "masked-two" }, { key: "test-2", identifier: "masked-three" }]);
    mocks.counter.findOne.mockResolvedValueOnce({ count: 25, limit: 25 }).mockResolvedValueOnce({ count: 2, limit: 40 });
    expect(await getAlphaVantageQuota("user@example.com")).toEqual({ date: expect.any(String), count: 27, limit: 65, remaining: 38 });
    expect(mocks.counter.findOne).toHaveBeenCalledTimes(2);
  });
  it("makes no outbound attempt when every own key is exhausted", async () => {
    mocks.keys.mockResolvedValue([{ key: "test-1" }, { key: "test-2" }]);
    mocks.counter.findOne.mockResolvedValue({ count: 25, limit: 25 });
    const fetcher = vi.fn();
    const client = await createAlphaVantageClient("user@example.com", fetcher);
    await expect(client.request({ function: "GLOBAL_QUOTE" })).rejects.toMatchObject({ code: "API_DAILY_LIMIT" });
    expect(client.apiCalls).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
    expect(mocks.counter.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it("lets FX use the next key after a quote spends the first key's final attempt", async () => {
    mocks.keys.mockResolvedValue([{ key: "test-1" }, { key: "test-2" }]);
    mocks.counter.findOne.mockResolvedValueOnce({ count: 24, limit: 25 }).mockResolvedValueOnce({ count: 25, limit: 25 }).mockResolvedValueOnce({ count: 0, limit: 25 });
    mocks.counter.findOneAndUpdate.mockResolvedValue({ count: 25, limit: 25 });
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ "Global Quote": { "05. price": "100" } })).mockResolvedValueOnce(Response.json({ "Realtime Currency Exchange Rate": { "5. Exchange Rate": "0.9" } }));
    const client = await createAlphaVantageClient("user@example.com", fetcher);
    await client.request({ function: "GLOBAL_QUOTE" });
    await client.fxToEUR("USD");
    expect(fetcher.mock.calls.map((call) => new URL(String(call[0])).searchParams.get("apikey"))).toEqual(["test-1", "test-2"]);
    expect(client.apiCalls).toBe(2);
  });
  it.each([{ Note: "secret-key frequency exceeded" }, { Information: "25 requests per day: secret-key" }])("counts a provider throttle once and does not retry a different key", async (body) => {
    mocks.keys.mockResolvedValue([{ key: "test-1" }, { key: "test-2" }]);
    mocks.counter.findOneAndUpdate.mockResolvedValue({ count: 1, limit: 25 });
    const fetcher = vi.fn().mockResolvedValue(Response.json(body));
    const client = await createAlphaVantageClient("user@example.com", fetcher);
    await expect(client.request({ function: "GLOBAL_QUOTE" })).rejects.toMatchObject({ code: "ALPHA_RATE_LIMIT_UNKNOWN", message: expect.not.stringContaining("secret-key") });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(client.apiCalls).toBe(1);
  });
  it("does not bypass a live persistent lease or consume quota when the atomic reservation loses", async () => {
    mocks.keys.mockResolvedValue([{ key: "test-1" }]);
    mocks.counter.findOne.mockResolvedValue({ count: 2, limit: 25 });
    mocks.counter.findOneAndUpdate.mockResolvedValueOnce({ count: 2, limit: 25 }).mockResolvedValueOnce(null);
    const fetcher = vi.fn();
    const client = await createAlphaVantageClient("user@example.com", fetcher);
    await expect(client.request({ function: "GLOBAL_QUOTE" })).rejects.toMatchObject({ code: "API_UPDATE_IN_PROGRESS" });
    const reservation = mocks.counter.findOneAndUpdate.mock.calls[1];
    expect(reservation[0]).toMatchObject({ count: { $lt: 25 }, $or: [{ refreshLockExpiresAt: { $exists: false } }, { refreshLockExpiresAt: { $lte: expect.any(Date) } }] });
    expect(reservation[1]).toMatchObject({ $inc: { count: 1 }, $set: { refreshLockId: expect.any(String) } });
    expect(client.apiCalls).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("serializes independent clients with the same persistent key lease", async () => {
    mocks.keys.mockResolvedValue([{ key: "test-1" }]);
    const row = { count: 0, limit: 25, refreshLockId: "" };
    mocks.counter.findOne.mockImplementation(async () => ({ ...row }));
    mocks.counter.findOneAndUpdate.mockImplementation(async (_filter, update) => {
      if (!update.$inc) return { ...row };
      if (row.refreshLockId || row.count >= row.limit) return null;
      row.count++; row.refreshLockId = update.$set.refreshLockId;
      return { ...row };
    });
    mocks.counter.updateOne.mockImplementation(async (filter) => { if (row.refreshLockId === filter.refreshLockId) row.refreshLockId = ""; });
    let release!: (response: Response) => void;
    let started!: () => void;
    const outboundStarted = new Promise<void>((resolve) => { started = resolve; });
    const fetcher = vi.fn().mockImplementationOnce(() => { started(); return new Promise<Response>((resolve) => { release = resolve; }); }).mockResolvedValue(Response.json({}));
    const first = await createAlphaVantageClient("user@example.com", fetcher);
    const second = await createAlphaVantageClient("user@example.com", fetcher);
    const firstRequest = first.request({ function: "GLOBAL_QUOTE" });
    await outboundStarted;
    await expect(second.request({ function: "SYMBOL_SEARCH" })).rejects.toMatchObject({ code: "API_UPDATE_IN_PROGRESS" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(row.count).toBe(1);
    release(Response.json({}));
    await firstRequest;
    await second.request({ function: "SYMBOL_SEARCH" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(row.count).toBe(2);
    expect(row.refreshLockId).toBe("");
    expect(PROVIDER_TIMEOUT_MS).toBeLessThan(PROVIDER_LEASE_MS);
  });
  it.each(["TimeoutError", "TypeError"])("redacts a %s fetch failure and retains the consumed attempt", async (name) => {
    mocks.keys.mockResolvedValue([{ key: "test-1" }]);
    mocks.counter.findOneAndUpdate.mockResolvedValue({ count: 1, limit: 25 });
    const error = new Error("https://provider?apikey=private-key"); error.name = name;
    const client = await createAlphaVantageClient("user@example.com", vi.fn().mockRejectedValue(error));
    await expect(client.request({ function: "GLOBAL_QUOTE" })).rejects.toMatchObject({ code: name === "TimeoutError" ? "ALPHA_TIMEOUT" : "ALPHA_NETWORK", message: expect.not.stringContaining("private-key") });
    expect(client.apiCalls).toBe(1);
    expect(mocks.counter.updateOne).toHaveBeenCalledTimes(1);
  });
  it.each(["NaN", "Infinity", "0", "-1"])("does not persist an invalid provider FX rate %s", async (rate) => {
    mocks.keys.mockResolvedValue([{ key: "test-1" }]);
    mocks.counter.findOneAndUpdate.mockResolvedValue({ count: 1, limit: 25 });
    const client = await createAlphaVantageClient("user@example.com", vi.fn().mockResolvedValue(Response.json({ "Realtime Currency Exchange Rate": { "5. Exchange Rate": rate } })));
    await expect(client.fxToEUR("USD")).rejects.toMatchObject({ code: "ALPHA_INVALID" });
    expect(mocks.fx.findOneAndUpdate).not.toHaveBeenCalled();
    expect(client.apiCalls).toBe(1);
  });
  it("skips exhausted keys and reserves once before an outbound attempt", async () => {
    mocks.keys.mockResolvedValue([{ key: "test-1" }, { key: "test-2" }]);
    mocks.counter.findOne.mockResolvedValueOnce({ count: 25, limit: 25 }).mockResolvedValueOnce({ count: 0, limit: 25 });
    mocks.counter.findOneAndUpdate.mockResolvedValueOnce({ count: 0, limit: 25 }).mockResolvedValueOnce({ count: 1, limit: 25 });
    const fetcher = vi.fn().mockResolvedValue(Response.json({ "Global Quote": {} }));
    const client = await createAlphaVantageClient("user@example.com", fetcher);
    await client.request({ function: "GLOBAL_QUOTE", symbol: "AAPL" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toContain("apikey=test-2");
    expect(client.apiCalls).toBe(1);
    expect(mocks.counter.updateOne).toHaveBeenCalledWith(expect.objectContaining({ refreshLockId: expect.any(String) }), { $unset: { refreshLockId: 1, refreshLockExpiresAt: 1 } });
  });
});
