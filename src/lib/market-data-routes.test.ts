import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";
const mocks = vi.hoisted(() => ({ session: vi.fn(), user: vi.fn(), price: vi.fn(), client: vi.fn(), quota: vi.fn(), request: vi.fn(), fx: vi.fn() }));
vi.mock("@/db/connect", () => ({ default: vi.fn() }));
vi.mock("@/db/models/ApiCounter", () => ({ default: { collection: { dropIndex: vi.fn() }, findOneAndUpdate: vi.fn().mockResolvedValue({ count: 0, limit: 25 }), findOne: vi.fn(), updateOne: vi.fn().mockResolvedValue({}) } }));
vi.mock("@/lib/alpha-vantage-key-resolver", () => ({ resolveAlphaVantageKey: vi.fn().mockResolvedValue({ key: "test-key" }) }));
vi.mock("next-auth/next", () => ({ getServerSession: mocks.session }));
vi.mock("@/pages/api/auth/[...nextauth]", () => ({ authOptions: {} }));
vi.mock("@/db/models/User", () => ({ default: { findOne: mocks.user } }));
vi.mock("@/db/models/Price", () => ({ default: { findOneAndUpdate: mocks.price } }));
vi.mock("@/lib/alpha-vantage-provider", () => ({ createAlphaVantageClient: mocks.client, getAlphaVantageQuota: mocks.quota, MarketDataError: class extends Error { constructor(public code: string, message: string, public retryAfter?: number) { super(`${code}: ${message}`); } } }));
import refresh from "@/pages/api/prices/fetch";
import counter from "@/pages/api/counter";
import reset from "@/pages/api/counter/reset";
import search from "@/pages/api/assets/search";
import { MarketDataError } from "@/lib/alpha-vantage-provider";
function response() {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res); return res;
}
describe("market data route seams", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({})));
    mocks.session.mockResolvedValue({ user: { email: "user@example.com" } });
    mocks.user.mockResolvedValue({ assets: [{ abb: "AAPL", type: "stocks" }, { abb: "BTC", type: "crypto" }, { abb: "ABC.DEX", type: "etf" }] });
    mocks.quota.mockResolvedValue({ date: "2026-10-01", count: 26, limit: 50, remaining: 24 });
    mocks.client.mockResolvedValue({ request: mocks.request, fxToEUR: mocks.fx, apiCalls: 2, quota: mocks.quota });
    mocks.request.mockResolvedValue({ "Global Quote": { "05. price": "100" } });
    mocks.fx.mockResolvedValue(0.9); mocks.price.mockResolvedValue({ value: 90, currency: "EUR" });
  });
  it("refreshes XAUUSD via the documented spot endpoint and preserves the EUR per-troy-ounce cache identity", async () => {
    mocks.user.mockResolvedValue({ assets: [{ abb: "XAUUSD", type: "metals", quantity: 2 }] });
    // Synthetic gold fixture using the official silver demo's flat response schema.
    mocks.request.mockResolvedValue({ nominal: "XAUUSD", timestamp: "2026-10-04 19:56:11", price: "3000" });
    const res = response();
    await refresh({ method: "POST", body: { symbol: "XAUUSD" } } as NextApiRequest, res as unknown as NextApiResponse);
    expect(mocks.request).toHaveBeenCalledWith({ function: "GOLD_SILVER_SPOT", symbol: "XAU" });
    expect(mocks.fx).toHaveBeenCalledWith("USD");
    expect(mocks.price).toHaveBeenCalledWith({ symbol: "XAUUSD" }, expect.objectContaining({ symbol: "XAUUSD", value: 2700, currency: "EUR", unit: "troy_ounce", source: "alphavantage" }), expect.any(Object));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ fetched: 1, apiCalls: 2, remainingCalls: 24, results: [expect.objectContaining({ symbol: "XAUUSD", ok: true })] }));
  });
  it.each([
    { price: "100" },
    { nominal: "XAGUSD", timestamp: "2026-10-04 19:56:11", price: "100" },
    { nominal: "XAUEUR", timestamp: "2026-10-04 19:56:11", price: "100" },
    { nominal: "XAUUSD", price: "100" },
    { nominal: "XAUUSD", timestamp: "2026-10-04 19:56:11", price: true },
    { nominal: "XAUUSD", timestamp: "2026-10-04 19:56:11", price: [100] },
  ])("rejects malformed or wrong-denomination metal data without FX or a cache write: %j", async (data) => {
    mocks.user.mockResolvedValue({ assets: [{ abb: "XAUUSD", type: "metals" }] });
    mocks.request.mockResolvedValue(data);
    const res = response();
    await refresh({ method: "POST", body: { symbol: "XAUUSD" } } as NextApiRequest, res as unknown as NextApiResponse);
    expect(mocks.price).not.toHaveBeenCalled();
    expect(mocks.fx).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toMatchObject({ fetched: 0, results: [{ symbol: "XAUUSD", ok: false }] });
  });
  it.each([
    ["XAGUSD", "metals", "XAG", "XAGUSD"],
    ["XAU", "metal", "XAU", "XAUUSD"],
    ["XAG", "metals", "XAG", "XAGUSD"],
  ])("maps %s only for provider lookup while keeping the user's cache symbol", async (symbol, type, providerSymbol, nominal) => {
    mocks.user.mockResolvedValue({ assets: [{ abb: symbol, type }] });
    // Synthetic price; flat nominal/timestamp/price schema observed in the official public silver demo.
    mocks.request.mockResolvedValue({ nominal, timestamp: "2026-10-04 19:56:11", price: "60.3876771722" });
    const res = response();
    await refresh({ method: "POST", body: { symbol } } as NextApiRequest, res as unknown as NextApiResponse);
    expect(mocks.request).toHaveBeenCalledExactlyOnceWith({ function: "GOLD_SILVER_SPOT", symbol: providerSymbol });
    expect(mocks.fx).toHaveBeenCalledWith("USD");
    expect(mocks.price).toHaveBeenCalledWith({ symbol }, expect.objectContaining({ symbol, value: expect.closeTo(54.34890945498), currency: "EUR", unit: "troy_ounce", source: "alphavantage" }), expect.any(Object));
    expect(res.json.mock.calls[0][0]).toMatchObject({ fetched: 1, results: [{ symbol, ok: true }] });
  });
  it.each(["NaN", "Infinity", "0", "-1", "", null, undefined])("does not convert or cache invalid spot price %s", async (price) => {
    mocks.user.mockResolvedValue({ assets: [{ abb: "XAGUSD", type: "metals" }] });
    mocks.request.mockResolvedValue({ nominal: "XAGUSD", timestamp: "2026-10-04 19:56:11", price });
    const res = response();
    await refresh({ method: "POST", body: { symbol: "XAGUSD" } } as NextApiRequest, res as unknown as NextApiResponse);
    expect(mocks.fx).not.toHaveBeenCalled();
    expect(mocks.price).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toMatchObject({ fetched: 0, results: [{ symbol: "XAGUSD", ok: false }] });
  });
  it.each([
    ["XPTUSD", "metals"], ["PLATINUM", "metal"], ["UNKNOWN", "precious_metal"],
    ["GOLD", "metals"], ["SILVER", "metals"], ["XAU", "stocks"], ["XAG", "crypto"],
    ["XAUUSD", "cash"], ["XAGUSD", "real_estate"], ["XAUUSD", "stocks"], ["XAGUSD", "crypto"],
    ["XAU/USD", "metals"], ["XAUUSD ", "metals"],
  ])("rejects unsupported symbol/type %s/%s before creating a quota-governed provider client", async (symbol, type) => {
    mocks.user.mockResolvedValue({ assets: [{ abb: symbol, type }] });
    const res = response();
    await refresh({ method: "POST", body: { symbol } } as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.price).not.toHaveBeenCalled();
  });
  it("requires the exact user-owned metal symbol rather than silently substituting a provider alias", async () => {
    mocks.user.mockResolvedValue({ assets: [{ abb: "XAUUSD", type: "metals" }] });
    const res = response();
    await refresh({ method: "POST", body: { symbol: "XAU" } } as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("keeps GOLD equities separate by refusing ambiguous GOLD metal aliases, even when a metal holding comes first", async () => {
    mocks.user.mockResolvedValue({ assets: [{ abb: "GOLD", type: "metals" }, { abb: "GOLD", type: "stocks" }] });
    const res = response();
    await refresh({ method: "POST", body: { symbol: "GOLD" } } as NextApiRequest, res as unknown as NextApiResponse);
    expect(mocks.request).toHaveBeenCalledExactlyOnceWith({ function: "GLOBAL_QUOTE", symbol: "GOLD" });
    expect(mocks.price.mock.calls[0][1]).not.toHaveProperty("unit");
    // Another user's metal alias cannot overwrite the shared equity price.
    mocks.user.mockResolvedValue({ assets: [{ abb: "GOLD", type: "metals" }] });
    const metalRes = response();
    await refresh({ method: "POST", body: { symbol: "GOLD" } } as NextApiRequest, metalRes as unknown as NextApiResponse);
    expect(metalRes.status).toHaveBeenCalledWith(404);
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.price).toHaveBeenCalledTimes(1);
  });
  it("keeps the crypto EUR exchange-rate path unchanged", async () => {
    mocks.request.mockResolvedValue({ "Realtime Currency Exchange Rate": { "5. Exchange Rate": "100" } });
    const res = response();
    await refresh({ method: "POST", body: { symbol: "BTC" } } as NextApiRequest, res as unknown as NextApiResponse);
    expect(mocks.request).toHaveBeenCalledWith({ function: "CURRENCY_EXCHANGE_RATE", from_currency: "BTC", to_currency: "EUR" });
    expect(mocks.fx).not.toHaveBeenCalled();
    expect(mocks.price).toHaveBeenCalledWith({ symbol: "BTC" }, expect.objectContaining({ value: 100, currency: "EUR" }), expect.any(Object));
    expect(mocks.price.mock.calls[0][1]).not.toHaveProperty("unit");
  });
  it("refresh returns aggregate quota and persists the converted quote", async () => {
    const res = response();
    await refresh({ method: "POST", body: { symbol: "AAPL" } } as NextApiRequest, res as unknown as NextApiResponse);
    expect(mocks.request).toHaveBeenCalledWith({ function: "GLOBAL_QUOTE", symbol: "AAPL" });
    expect(mocks.fx).toHaveBeenCalledWith("USD");
    expect(mocks.price).toHaveBeenCalledWith({ symbol: "AAPL" }, expect.objectContaining({ value: 90, currency: "EUR" }), expect.any(Object));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ apiCalls: 2, remainingCalls: 24 }));
  });
  it.each(["refresh", "search", "failed search"])("retains request accounting when final quota lookup fails: %s", async (route) => {
    mocks.quota.mockRejectedValue(new Error("private database failure"));
    if (route === "failed search") mocks.request.mockRejectedValue(new Error("private provider failure"));
    else if (route === "search") mocks.request.mockResolvedValue({ bestMatches: [] });
    const res = response();
    if (route === "refresh") await refresh({ method: "POST", body: { symbol: "AAPL" } } as NextApiRequest, res as unknown as NextApiResponse);
    else await search({ method: "GET", query: { query: "AAPL" } } as unknown as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.json.mock.calls[0][0]).toMatchObject({ apiCalls: 2 });
    expect(res.json.mock.calls[0][0]).not.toHaveProperty("remainingCalls");
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toMatch(/private/);
  });
  it("counter requires authentication and exposes aggregate totals only", async () => {
    const res = response();
    await counter({ method: "GET" } as NextApiRequest, res as unknown as NextApiResponse);
    expect(mocks.quota).toHaveBeenCalledWith("user@example.com");
    expect(res.json).toHaveBeenCalledWith({ date: "2026-10-01", count: 26, limit: 50, remaining: 24 });
    mocks.session.mockResolvedValue(null);
    await counter({ method: "GET" } as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenLastCalledWith(401);
  });
  it("cannot reset tracked allowances", async () => {
    const res = response();
    await reset({ method: "POST" } as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(403);
  });
  it.each(["ALPHA_RATE_LIMIT_BURST", "ALPHA_RATE_LIMIT_DAILY", "ALPHA_RATE_LIMIT_UNKNOWN"])("preserves safe diagnosis and bounded Retry-After for quote and search: %s", async (code) => {
    mocks.request.mockRejectedValue(new MarketDataError(code, "Provider requests are paused safely.", 60));
    const quoteRes = response();
    await refresh({ method: "POST", body: { symbol: "AAPL" } } as NextApiRequest, quoteRes as unknown as NextApiResponse);
    expect(quoteRes.setHeader).toHaveBeenCalledWith("Retry-After", "60");
    expect(quoteRes.json.mock.calls[0][0]).toMatchObject({ apiCalls: 2, remainingCalls: 24, results: [{ symbol: "AAPL", ok: false, reason: `${code}: Provider requests are paused safely.`, retryAfter: 60 }] });
    const searchRes = response();
    await search({ method: "GET", query: { query: "AAPL" } } as unknown as NextApiRequest, searchRes as unknown as NextApiResponse);
    expect(searchRes.status).toHaveBeenCalledWith(429);
    expect(searchRes.setHeader).toHaveBeenCalledWith("Retry-After", "60");
    expect(searchRes.json.mock.calls[0][0]).toMatchObject({ error: `${code}: Provider requests are paused safely.`, retryAfter: 60, apiCalls: 2, remainingCalls: 24 });
  });
  it("search uses the shared provider and reports aggregate call metadata", async () => {
    mocks.request.mockResolvedValue({ bestMatches: [] });
    const res = response();
    await search({ method: "GET", query: { query: "AAPL" } } as unknown as NextApiRequest, res as unknown as NextApiResponse);
    expect(mocks.request).toHaveBeenCalledWith({ function: "SYMBOL_SEARCH", keywords: "AAPL" });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ apiCalls: 2, remainingCalls: 24 }));
  });
});
