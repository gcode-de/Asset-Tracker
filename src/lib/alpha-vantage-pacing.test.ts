import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ state: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() }, counter: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() }, keys: vi.fn(), fx: { findOne: vi.fn(), findOneAndUpdate: vi.fn() } }));
vi.mock("@/db/models/AlphaVantageState", () => ({ default: mocks.state }));
vi.mock("@/db/models/ApiCounter", () => ({ default: mocks.counter }));
vi.mock("@/db/models/FxRate", () => ({ default: mocks.fx }));
vi.mock("@/lib/alpha-vantage-key-resolver", () => ({ resolveAlphaVantageKeys: mocks.keys }));
import { createAlphaVantageClient, PROVIDER_LEASE_MS, PROVIDER_MIN_INTERVAL_MS, PROVIDER_TIMEOUT_MS } from "./alpha-vantage-provider";

let now: number;
let row: Record<string, any>;
let count: number;
const wait = vi.fn(async (ms: number) => { now += ms; });
const timing = { now: () => now, wait };
beforeEach(() => {
  vi.resetAllMocks();
  now = Date.UTC(2026, 9, 2, 12);
  row = {}; count = 0;
  mocks.keys.mockResolvedValue([{ key: "private-test-key" }]);
  mocks.fx.findOne.mockResolvedValue(null);
  mocks.fx.findOneAndUpdate.mockResolvedValue({});
  mocks.state.findOne.mockImplementation(async () => ({ ...row }));
  mocks.state.findOneAndUpdate.mockImplementation(async (_filter, update) => {
    if (update.$setOnInsert) return { ...row };
    if (row.pendingRequestId || (row.refreshLockExpiresAt?.getTime() ?? 0) > now || (row.cooldownUntil?.getTime() ?? 0) > now) return null;
    Object.assign(row, update.$set); return { ...row };
  });
  mocks.state.updateOne.mockImplementation(async (filter, update) => {
    if (filter.refreshLockId !== row.refreshLockId || (filter.refreshLockExpiresAt && row.refreshLockExpiresAt?.getTime() <= now)) return { matchedCount: 0 };
    Object.assign(row, update.$set ?? {});
    for (const key of Object.keys(update.$unset ?? {})) delete row[key];
    return { matchedCount: 1 };
  });
  mocks.counter.findOne.mockImplementation(async () => ({ count, limit: 25 }));
  mocks.counter.findOneAndUpdate.mockImplementation(async (_filter, update) => {
    if (update.$inc) count++;
    return { count, limit: 25 };
  });
  mocks.counter.updateOne.mockImplementation(async (_filter, update) => { count += update.$inc?.count ?? 0; return { matchedCount: 1 }; });
});
afterEach(() => vi.useRealTimers());

it("paces quote, uncached FX, and search across separate clients without real timers", async () => {
  const starts: number[] = [];
  const fetcher = vi.fn(async () => { starts.push(now); return Response.json({ "Realtime Currency Exchange Rate": { "5. Exchange Rate": "0.9" } }); });
  const first = await createAlphaVantageClient("user@example.com", fetcher, timing);
  await first.request({ function: "GLOBAL_QUOTE" });
  await first.fxToEUR("USD");
  const second = await createAlphaVantageClient("user@example.com", fetcher, timing);
  await second.request({ function: "SYMBOL_SEARCH" });
  expect(starts).toEqual([starts[0], starts[0] + 1500, starts[0] + 3000]);
  expect(wait.mock.calls).toEqual([[1500], [1500]]);
  expect(count).toBe(3);
  expect(first.apiCalls).toBe(2); expect(second.apiCalls).toBe(1);
  expect(row.refreshLockId).toBeUndefined();
  expect(PROVIDER_MIN_INTERVAL_MS + PROVIDER_TIMEOUT_MS).toBeLessThan(PROVIDER_LEASE_MS);
});

it("holds the key lease during pacing so a concurrent caller cannot spend quota", async () => {
  row.lastProviderRequestAt = new Date(now);
  let release!: () => void;
  let waiting!: () => void;
  const started = new Promise<void>((resolve) => { waiting = resolve; });
  wait.mockImplementationOnce(async (ms: number) => { waiting(); await new Promise<void>((resolve) => { release = resolve; }); now += ms; });
  const fetcher = vi.fn().mockResolvedValue(Response.json({}));
  const first = await createAlphaVantageClient("a@example.com", fetcher, timing);
  const second = await createAlphaVantageClient("b@example.com", fetcher, timing);
  const pending = first.request({ function: "GLOBAL_QUOTE" });
  await started;
  await expect(second.request({ function: "SYMBOL_SEARCH" })).rejects.toMatchObject({ code: "API_UPDATE_IN_PROGRESS" });
  expect(count).toBe(0); expect(fetcher).not.toHaveBeenCalled();
  release(); await pending;
  expect(count).toBe(1); expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each([
  ["Please consider spreading out your free API requests (1 request per second).", "BURST", 15],
  ["Daily request limit exhausted.", "DAILY", 3600],
  ["Our standard API rate limit is 25 requests per day.", "UNKNOWN", 60],
])("persists %s cooldown without changing quota or retrying", async (notice, kind, seconds) => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ Information: `${notice} private-test-key` }));
  const first = await createAlphaVantageClient("user@example.com", fetcher, timing);
  await expect(first.request({ function: "GLOBAL_QUOTE" })).rejects.toMatchObject({ code: `ALPHA_RATE_LIMIT_${kind}`, retryAfter: seconds });
  const second = await createAlphaVantageClient("user@example.com", fetcher, timing);
  await expect(second.request({ function: "SYMBOL_SEARCH" })).rejects.toMatchObject({ code: `ALPHA_RATE_LIMIT_${kind}`, retryAfter: seconds });
  expect(fetcher).toHaveBeenCalledTimes(1); expect(count).toBe(1);
  expect(first.apiCalls).toBe(1); expect(second.apiCalls).toBe(0);
  expect(wait).not.toHaveBeenCalled();
  expect(JSON.stringify(row)).not.toContain("private-test-key");
  expect(mocks.counter.findOneAndUpdate.mock.calls.every(([, update]) => !update.$set?.count)).toBe(true);
  now += Number(seconds) * 1000;
  const freshFetcher = vi.fn().mockResolvedValue(Response.json({}));
  const third = await createAlphaVantageClient("user@example.com", freshFetcher, timing);
  await third.request({ function: "GLOBAL_QUOTE" });
  expect(freshFetcher).toHaveBeenCalledTimes(1); expect(count).toBe(2);
});

it("does not send a stale reservation after a slow quota database response outlives the lease", async () => {
  const reserve = mocks.counter.findOneAndUpdate.getMockImplementation()!;
  mocks.counter.findOneAndUpdate.mockImplementation(async (...args) => {
    const result = await reserve(...args);
    if (args[1].$inc) now += PROVIDER_LEASE_MS + 1;
    return result;
  });
  const fetcher = vi.fn().mockResolvedValue(Response.json({}));
  const client = await createAlphaVantageClient("user@example.com", fetcher, timing);
  await expect(client.request({ function: "GLOBAL_QUOTE" })).rejects.toMatchObject({ code: "API_UPDATE_IN_PROGRESS" });
  expect(fetcher).not.toHaveBeenCalled(); expect(client.apiCalls).toBe(0); expect(count).toBe(0);
});

it("does not advance the cursor after slow counter initialization expires its leases", async () => {
  const initialize = mocks.counter.findOneAndUpdate.getMockImplementation()!;
  mocks.counter.findOneAndUpdate.mockImplementation(async (...args) => {
    const result = await initialize(...args);
    if (args[1].$setOnInsert) now += PROVIDER_LEASE_MS + 1;
    return result;
  });
  const client = await createAlphaVantageClient("user@example.com", vi.fn(), timing);
  await expect(client.request({ function: "GLOBAL_QUOTE" })).rejects.toMatchObject({ code: "API_UPDATE_IN_PROGRESS" });
  expect(mocks.keys.mock.calls.some(([, options]) => options.advance)).toBe(false);
});

it("stores a provider block even if daily lease cleanup fails", async () => {
  mocks.counter.updateOne.mockRejectedValue(new Error("database unavailable"));
  const fetcher = vi.fn().mockResolvedValue(Response.json({ Information: "Our standard API rate limit is 25 requests per day." }));
  const client = await createAlphaVantageClient("user@example.com", fetcher, timing);
  await expect(client.request({ function: "GLOBAL_QUOTE" })).rejects.toThrow();
  expect(row.cooldownCode).toBe("ALPHA_RATE_LIMIT_UNKNOWN");
  expect(count).toBe(1);
  const second = await createAlphaVantageClient("user@example.com", fetcher, timing);
  await expect(second.request({ function: "GLOBAL_QUOTE" })).rejects.toMatchObject({ code: "ALPHA_RATE_LIMIT_UNKNOWN" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("does not automatically clear an orphaned pending outcome after lease expiry", async () => {
  row.pendingRequestId = "orphaned-request"; row.refreshLockExpiresAt = new Date(now - 1000);
  const fetcher = vi.fn();
  const client = await createAlphaVantageClient("user@example.com", fetcher, timing);
  await expect(client.request({ function: "GLOBAL_QUOTE" })).rejects.toMatchObject({ code: "API_UPDATE_IN_PROGRESS" });
  expect(fetcher).not.toHaveBeenCalled(); expect(count).toBe(0); expect(wait).not.toHaveBeenCalled();
  expect(mocks.keys.mock.calls.some(([, options]) => options.advance)).toBe(false);
});

it("retains the outcome guard if saving a provider block matches no row", async () => {
  const update = mocks.state.updateOne.getMockImplementation()!;
  mocks.state.updateOne.mockImplementation(async (...args) => args[1].$set?.cooldownUntil ? { matchedCount: 0 } : update(...args));
  const fetcher = vi.fn().mockResolvedValue(Response.json({ Information: "Daily request limit exhausted." }));
  const client = await createAlphaVantageClient("user@example.com", fetcher, timing);
  await expect(client.request({ function: "GLOBAL_QUOTE" })).rejects.toMatchObject({ code: "ALPHA_STORAGE" });
  expect(row.pendingRequestId).toBeTruthy();
  await expect(client.request({ function: "GLOBAL_QUOTE" })).rejects.toMatchObject({ code: "API_UPDATE_IN_PROGRESS" });
  expect(fetcher).toHaveBeenCalledTimes(1); expect(count).toBe(1);
});

it("translates a rejected cooldown write to safe ALPHA_STORAGE while retaining the guard", async () => {
  const update = mocks.state.updateOne.getMockImplementation()!;
  mocks.state.updateOne.mockImplementation(async (...args) => {
    if (args[1].$set?.cooldownUntil) throw new Error("private-database-error");
    return update(...args);
  });
  const client = await createAlphaVantageClient("user@example.com", vi.fn().mockResolvedValue(Response.json({ Information: "Daily request limit exhausted." })), timing);
  await expect(client.request({ function: "GLOBAL_QUOTE" })).rejects.toMatchObject({ code: "ALPHA_STORAGE", message: expect.not.stringContaining("private-database-error") });
  expect(row.pendingRequestId).toBeTruthy(); expect(count).toBe(1);
});

it("preserves pacing across a UTC date rollover", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-02T23:59:59.900Z"));
  now = Date.now();
  const fetcher = vi.fn().mockImplementation(async () => Response.json({}));
  await (await createAlphaVantageClient("user@example.com", fetcher, timing)).request({ function: "GLOBAL_QUOTE" });
  now += 200; vi.setSystemTime(now);
  await (await createAlphaVantageClient("user@example.com", fetcher, timing)).request({ function: "SYMBOL_SEARCH" });
  expect(wait).toHaveBeenCalledWith(1300); expect(count).toBe(2);
  const dates = mocks.counter.findOneAndUpdate.mock.calls.filter(([, update]) => update.$inc).map(([filter]) => filter.date);
  expect(dates).toEqual(["2026-10-02", "2026-10-03"]);
});

it("does not call or consume quota after losing a lease during the short wait", async () => {
  row.lastProviderRequestAt = new Date(now);
  wait.mockImplementationOnce(async () => { now += PROVIDER_LEASE_MS + 1; });
  const fetcher = vi.fn();
  const client = await createAlphaVantageClient("user@example.com", fetcher, timing);
  await expect(client.request({ function: "GLOBAL_QUOTE" })).rejects.toMatchObject({ code: "API_UPDATE_IN_PROGRESS" });
  expect(fetcher).not.toHaveBeenCalled(); expect(count).toBe(0); expect(client.apiCalls).toBe(0);
});

it.each(["nonsense", "-1", "999999999", "Fri, 02 Oct 2026 12:00:30 GMT"])("bounds Retry-After %s and never sleeps for the cooldown", async (header) => {
  const fetcher = vi.fn().mockResolvedValue(new Response("private-key", { status: 429, headers: { "Retry-After": header } }));
  const client = await createAlphaVantageClient("user@example.com", fetcher, timing);
  const expected = header === "999999999" ? 86400 : header.includes("GMT") ? 30 : 60;
  await expect(client.request({ function: "GLOBAL_QUOTE" })).rejects.toMatchObject({ code: "ALPHA_RATE_LIMIT_UNKNOWN", retryAfter: expected });
  expect(count).toBe(1); expect(wait).not.toHaveBeenCalled();
});
