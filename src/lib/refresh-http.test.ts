import { describe, expect, it, vi } from "vitest";
import { refreshOneSymbol, readJsonResponse } from "./refresh-http";

describe("safe refresh HTTP responses", () => {
  it("revalidates aggregate allowance after every refresh attempt", async () => {
    const listener = vi.fn();
    window.addEventListener("api-counter-changed", listener);
    await refreshOneSymbol("AAPL", vi.fn().mockResolvedValue(Response.json({ apiCalls: 1, remainingCalls: 49, results: [{ symbol: "AAPL", ok: true }] })));
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("api-counter-changed", listener);
  });
  it("reports a gateway timeout without parsing or displaying HTML", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("<html>secret-key</html>", { status: 504 }));
    const result = await refreshOneSymbol("AAPL", fetcher);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/504.*timed out/i);
    expect(result.reason).not.toMatch(/html|secret-key|JSON.parse/i);
  });
  it.each([400, 401, 429, 500, 502, 504])("preserves valid accounting on structured HTTP %s failures", async (status) => {
    const result = await refreshOneSymbol("AAPL", vi.fn().mockResolvedValue(Response.json({ error: "private-key", apiCalls: 2, remainingCalls: 23 }, { status })));
    expect(result).toMatchObject({ ok: false, apiCalls: 2, remainingCalls: 23 });
    expect(result.reason).not.toContain("private-key");
  });
  it.each(["network", "timeout", "opaque busy"])("marks request usage unknown for %s", async (failure) => {
    const fetcher = failure === "network" ? vi.fn().mockRejectedValue(new Error("private-key")) : vi.fn().mockResolvedValue(new Response("private-key", { status: failure === "timeout" ? 504 : 429 }));
    const result = await refreshOneSymbol("AAPL", fetcher);
    expect(result.apiCalls).toBeNull();
    expect(result.remainingCalls).toBeUndefined();
    expect(result.reason).not.toContain("private-key");
  });
  it.each(["apiCalls", "remainingCalls"])("rejects invalid %s counters safely", async (field) => {
    for (const value of [-1, 1.5, NaN, Infinity, "2", null]) {
      const result = await refreshOneSymbol("AAPL", vi.fn().mockResolvedValue(Response.json({ apiCalls: 2, remainingCalls: 23, results: [{ symbol: "AAPL", ok: true }], [field]: value })));
      expect(result.ok).toBe(false);
      if (field === "apiCalls") expect(result.apiCalls).toBeNull();
      else { expect(result.remainingCalls).toBeUndefined(); expect(result.apiCalls).toBe(2); }
      expect(result.reason).toMatch(/unexpected JSON/);
    }
  });
  it.each([[], [{ symbol: "MSFT", ok: true }], [{ symbol: "AAPL", ok: "true" }], [{ symbol: "AAPL", ok: true, reason: {} }], [{ ok: true }], [{ symbol: "AAPL", ok: true }, { symbol: "AAPL", ok: true }]].map((results) => ({ results })))("rejects malformed result shape $results", async ({ results }) => {
    const result = await refreshOneSymbol("AAPL", vi.fn().mockResolvedValue(Response.json({ apiCalls: 2, remainingCalls: 23, results })));
    expect(result).toMatchObject({ ok: false, apiCalls: 2, remainingCalls: 23 });
    expect(result.reason).toMatch(/unexpected JSON/);
  });
  it("does not accept success without request accounting", async () => {
    const result = await refreshOneSymbol("AAPL", vi.fn().mockResolvedValue(Response.json({ results: [{ symbol: "AAPL", ok: true }] })));
    expect(result).toMatchObject({ ok: false, apiCalls: null });
  });
  it("accepts valid zero usage and omitted unavailable allowance", async () => {
    const result = await refreshOneSymbol("AAPL", vi.fn().mockResolvedValue(Response.json({ apiCalls: 0, results: [{ symbol: "AAPL", ok: true }] })));
    expect(result).toMatchObject({ ok: true, apiCalls: 0 });
    expect(result.remainingCalls).toBeUndefined();
  });
  it("rejects malformed successful JSON safely", async () => {
    await expect(readJsonResponse(new Response("broken", { headers: { "content-type": "application/json" } }))).rejects.toThrow(/invalid JSON/i);
  });
  it.each(["ALPHA_RATE_LIMIT_BURST", "ALPHA_RATE_LIMIT_DAILY", "ALPHA_RATE_LIMIT_UNKNOWN", "ALPHA_STORAGE"])("stops a batch on safe server coordination diagnosis %s", async (code) => {
    const result = await refreshOneSymbol("AAPL", vi.fn().mockResolvedValue(Response.json({ apiCalls: 1, remainingCalls: 24, results: [{ symbol: "AAPL", ok: false, reason: `${code}: Requests paused for safety.` }] })));
    expect(result).toMatchObject({ terminal: true, apiCalls: 1, remainingCalls: 24 });
  });
  it("keeps busy responses terminal without inventing zero quota", async () => {
    const result = await refreshOneSymbol("AAPL", vi.fn().mockResolvedValue(Response.json({ error: "API_UPDATE_IN_PROGRESS: Another update is in progress", remainingCalls: 7, apiCalls: 0 }, { status: 429 })));
    expect(result).toMatchObject({ terminal: true, remainingCalls: 7, apiCalls: 0 });
  });
});
