import type { SymbolRefreshResult } from "./price-refresh";

/** Never include response bodies, statusText or fetch URLs in diagnostics. */
export async function readJsonResponse(response: Response, label = "Price refresh"): Promise<any> {
  if (!response.ok) {
    const timeout = response.status === 504 || response.status === 408;
    throw new Error(`${label} HTTP ${response.status}: ${timeout ? "request timed out. Please try again." : "request failed. Please try again."}`);
  }
  if (!/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(response.headers.get("content-type") || "")) {
    throw new Error(`${label} returned a non-JSON response. Please try again.`);
  }
  try {
    const data = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
    return data;
  } catch {
    throw new Error(`${label} returned invalid JSON. Please try again.`);
  }
}

export function revalidateApiCounter(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("api-counter-changed"));
}

export async function refreshOneSymbol(symbol: string, fetcher: typeof fetch = fetch): Promise<SymbolRefreshResult> {
  try { return await performRefresh(symbol, fetcher); }
  finally { revalidateApiCounter(); }
}

async function performRefresh(symbol: string, fetcher: typeof fetch): Promise<SymbolRefreshResult> {
  let response: Response;
  try {
    response = await fetcher("/api/prices/fetch", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ symbol }),
    });
  } catch {
    return { symbol, ok: false, apiCalls: null, reason: "Price refresh could not reach the server. Check your connection and try again." };
  }
  let apiCalls: number | null = null;
  let remainingCalls: number | undefined;
  try {
    // Parse structured failures as well as successes, but never display their raw bodies.
    const data = await readJsonResponse(new Response(await response.text(), { headers: response.headers }));
    apiCalls = isCallCount(data.apiCalls) ? data.apiCalls : null;
    remainingCalls = isCallCount(data.remainingCalls) ? data.remainingCalls : undefined;
    if ((data.apiCalls !== undefined && apiCalls === null) || (data.remainingCalls !== undefined && remainingCalls === undefined)) throw new Error("Price refresh returned an unexpected JSON response. Please try again.");
    if (!response.ok) throw new Error(httpFailure(response.status));
    const result = Array.isArray(data.results) ? data.results[0] : undefined;
    if (apiCalls === null || !Array.isArray(data.results) || data.results.length !== 1 || !result || typeof result !== "object" || Array.isArray(result) || result.symbol !== symbol.toUpperCase() || typeof result.ok !== "boolean" || (result.reason !== undefined && typeof result.reason !== "string")) throw new Error("Price refresh returned an unexpected JSON response. Please try again.");
    return { symbol, ok: result.ok, reason: result.reason, apiCalls, remainingCalls, terminal: /^(ALPHA_RATE_LIMIT|ALPHA_STORAGE|API_DAILY_LIMIT|API_UPDATE_IN_PROGRESS)/.test(String(result.reason || "")) };
  } catch (error) {
    return { symbol, ok: false, terminal: response.status === 429, apiCalls, remainingCalls, reason: !response.ok ? httpFailure(response.status) : error instanceof Error ? error.message : "Price refresh failed. Please try again." };
  }
}

function isCallCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

function httpFailure(status: number): string {
  if (status === 429) return "Price refresh HTTP 429: market data is busy or the daily quota is exhausted. Try again later.";
  return `Price refresh HTTP ${status}: ${status === 504 || status === 408 ? "request timed out." : "request failed."} Please try again.`;
}
