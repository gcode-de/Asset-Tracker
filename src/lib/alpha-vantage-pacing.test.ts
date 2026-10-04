import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";
const mocks = vi.hoisted(() => ({ state: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() }, counter: { findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn() }, keys: vi.fn(), fx: { findOne: vi.fn(), findOneAndUpdate: vi.fn() } }));
vi.mock("@/db/models/AlphaVantageState", () => ({ default: mocks.state }));
vi.mock("@/db/models/ApiCounter", () => ({ default: mocks.counter }));
vi.mock("@/db/models/FxRate", () => ({ default: mocks.fx }));
vi.mock("@/lib/alpha-vantage-key-resolver", () => ({ resolveAlphaVantageKeys: mocks.keys }));
import { createAlphaVantageClient, PROVIDER_LEASE_MS, PROVIDER_MIN_INTERVAL_MS, PROVIDER_TIMEOUT_MS } from "./alpha-vantage-provider";
import * as providerModule from "./alpha-vantage-provider";
const routeMocks = vi.hoisted(() => ({ user: vi.fn(), price: vi.fn() }));
vi.mock("@/db/connect", () => ({ default: vi.fn() }));
vi.mock("@/db/models/User", () => ({ default: { findOne: routeMocks.user } }));
vi.mock("@/db/models/Price", () => ({ default: { findOneAndUpdate: routeMocks.price } }));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn(async () => ({ user: { email: "user@example.com" } })) }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));
import refreshMetal from "@/pages/api/prices/fetch";

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
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("paces quote, uncached FX, and search across separate clients without real timers", async () => {
  const starts: number[] = [];
  const fetcher = vi.fn(async () => { starts.push(now); return Response.json({ "Realtime Currency Exchange Rate": { "5. Exchange Rate": "0.9" } }); });
  const first = await createAlphaVantageClient("user@example.com", fetcher, timing);
  await first.request({ function: "GLOBAL_QUOTE" });
  await first.fxToEUR("USD");
  const second = await createAlphaVantageClient("user@example.com", fetcher, timing);
  await second.request({ function: "SYMBOL_SEARCH" });
  expect(starts).toEqual([starts[0], starts[0] + 2000, starts[0] + 4000]);
  expect(wait.mock.calls).toEqual([[2000], [2000]]);
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
  expect(wait).toHaveBeenCalledWith(1800); expect(count).toBe(2);
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

it.each([
  ["XAUUSD", false], ["XAUUSD", true], ["XAGUSD", false], ["XAGUSD", true],
])("metal route counts actual spot/FX reservations for %s with cached FX=%s", async (symbol, cached) => {
  routeMocks.user.mockResolvedValue({ assets: [{ abb: symbol, type: "metals" }] });
  routeMocks.price.mockImplementation(async (_filter, update) => update);
  if (cached) mocks.fx.findOne.mockResolvedValue({ rate: 0.9, timestamp: new Date() });
  const starts: number[] = [];
  // Synthetic price fixture; response schema comes from the public silver demo.
  const fetcher = vi.fn(async (url: string | URL | Request) => {
    starts.push(now);
    const params = new URL(String(url)).searchParams;
    return Response.json(params.get("function") === "GOLD_SILVER_SPOT"
      ? { nominal: symbol, timestamp: "2026-10-04 19:56:11", price: "100" }
      : { "Realtime Currency Exchange Rate": { "5. Exchange Rate": "0.9" } });
  });
  const realCreateClient = createAlphaVantageClient;
  vi.spyOn(providerModule, "createAlphaVantageClient").mockImplementation((email) => realCreateClient(email, fetcher, timing));
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  await refreshMetal({ method: "POST", body: { symbol } } as NextApiRequest, res as unknown as NextApiResponse);
  const calls = cached ? 1 : 2;
  expect(count).toBe(calls);
  expect(fetcher).toHaveBeenCalledTimes(calls);
  expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get("function")).toBe("GOLD_SILVER_SPOT");
  expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get("symbol")).toBe(symbol === "XAUUSD" ? "XAU" : "XAG");
  if (!cached) {
    expect(starts[1] - starts[0]).toBe(2000);
    expect(wait).toHaveBeenCalledWith(2000);
    const fx = new URL(String(fetcher.mock.calls[1][0])).searchParams;
    expect(fx.get("function")).toBe("CURRENCY_EXCHANGE_RATE");
    expect(fx.get("from_currency")).toBe("USD");
    expect(fx.get("to_currency")).toBe("EUR");
  }
  expect(res.json.mock.calls[0][0]).toMatchObject({ fetched: 1, apiCalls: calls, remainingCalls: 25 - calls, results: [{ symbol, ok: true, price: { symbol, value: 90, currency: "EUR", source: "alphavantage", unit: "troy_ounce" } }] });
  expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain("private-test-key");
});

it.each([
  [{ Information: "Daily request limit exhausted. private-test-key" }, "ALPHA_RATE_LIMIT_DAILY", 3600],
  [{ "Error Message": "invalid private-test-key" }, "ALPHA_INVALID", undefined],
  [{ nominal: "XAGUSD", timestamp: "2026-10-04 19:56:11", price: "Infinity" }, "No valid price", undefined],
])("retains actual attempt accounting but never writes a failed metal quote %j", async (body, reason, retryAfter) => {
  routeMocks.user.mockResolvedValue({ assets: [{ abb: "XAGUSD", type: "metals" }] });
  const fetcher = vi.fn(async () => Response.json(body));
  const realCreateClient = createAlphaVantageClient;
  vi.spyOn(providerModule, "createAlphaVantageClient").mockImplementation((email) => realCreateClient(email, fetcher, timing));
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  await refreshMetal({ method: "POST", body: { symbol: "XAGUSD" } } as NextApiRequest, res as unknown as NextApiResponse);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(count).toBe(1);
  expect(routeMocks.price).not.toHaveBeenCalled();
  expect(res.json.mock.calls[0][0]).toMatchObject({ fetched: 0, apiCalls: 1, remainingCalls: 24, results: [{ symbol: "XAGUSD", ok: false, reason: expect.stringContaining(String(reason)) }] });
  if (retryAfter) expect(res.setHeader).toHaveBeenCalledWith("Retry-After", String(retryAfter));
  expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain("private-test-key");
});

it.each(["Infinity", "NaN", "0", "-1"])("does not overwrite the metal price when uncached EUR FX returns %s", async (rate) => {
  routeMocks.user.mockResolvedValue({ assets: [{ abb: "XAUUSD", type: "metals" }] });
  const fetcher = vi.fn()
    .mockResolvedValueOnce(Response.json({ nominal: "XAUUSD", timestamp: "2026-10-04 19:56:11", price: "100" }))
    .mockResolvedValueOnce(Response.json({ "Realtime Currency Exchange Rate": { "5. Exchange Rate": rate } }));
  const realCreateClient = createAlphaVantageClient;
  vi.spyOn(providerModule, "createAlphaVantageClient").mockImplementation((email) => realCreateClient(email, fetcher, timing));
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  await refreshMetal({ method: "POST", body: { symbol: "XAUUSD" } } as NextApiRequest, res as unknown as NextApiResponse);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(count).toBe(2);
  expect(routeMocks.price).not.toHaveBeenCalled();
  expect(mocks.fx.findOneAndUpdate).not.toHaveBeenCalled();
  expect(res.json.mock.calls[0][0]).toMatchObject({ fetched: 0, apiCalls: 2, remainingCalls: 23, results: [{ symbol: "XAUUSD", ok: false, reason: expect.stringContaining("ALPHA_INVALID") }] });
});
