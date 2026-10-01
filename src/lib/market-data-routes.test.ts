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
vi.mock("@/lib/alpha-vantage-provider", () => ({ createAlphaVantageClient: mocks.client, getAlphaVantageQuota: mocks.quota, MarketDataError: class extends Error {} }));
import refresh from "@/pages/api/prices/fetch";
import counter from "@/pages/api/counter";
import reset from "@/pages/api/counter/reset";
import search from "@/pages/api/assets/search";
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
  it("search uses the shared provider and reports aggregate call metadata", async () => {
    mocks.request.mockResolvedValue({ bestMatches: [] });
    const res = response();
    await search({ method: "GET", query: { query: "AAPL" } } as unknown as NextApiRequest, res as unknown as NextApiResponse);
    expect(mocks.request).toHaveBeenCalledWith({ function: "SYMBOL_SEARCH", keywords: "AAPL" });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ apiCalls: 2, remainingCalls: 24 }));
  });
});
