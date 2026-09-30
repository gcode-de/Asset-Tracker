import { describe, expect, it } from "vitest";
import { collectRefreshableSymbols, refreshSymbolsSequentially } from "./price-refresh";

describe("collectRefreshableSymbols", () => {
  it("deduplicates supported symbols and refreshes the stalest price first", () => {
    const symbols = collectRefreshableSymbols(
      [
        { abb: "MSFT", type: "stocks", isDeleted: false },
        { abb: "BTC", type: "crypto", isDeleted: false },
        { abb: "msft", type: "etf", isDeleted: false },
        { abb: "CASH", type: "cash", isDeleted: false },
        { abb: "UNKNOWN", type: "", isDeleted: false },
        { abb: "ARCHIVED", type: "stocks", isDeleted: true },
      ],
      new Map([
        ["MSFT", new Date("2026-09-29T10:00:00.000Z")],
        ["BTC", new Date("2026-09-27T10:00:00.000Z")],
      ]),
    );

    expect(symbols).toEqual(["BTC", "MSFT"]);
  });
});

describe("refreshSymbolsSequentially", () => {
  it("waits for each price update before starting the next one and reports each result", async () => {
    const started: string[] = [];
    const completed: string[] = [];
    let releaseFirst: (() => void) | undefined;

    const run = refreshSymbolsSequentially({
      symbols: ["BTC", "MSFT"],
      refreshSymbol: async (symbol) => {
        started.push(symbol);
        if (symbol === "BTC") {
          await new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
        }
        completed.push(symbol);
        return { symbol, ok: true, apiCalls: 1, remainingCalls: 24 };
      },
      onResult: () => undefined,
    });

    await Promise.resolve();
    expect(started).toEqual(["BTC"]);

    releaseFirst?.();
    const results = await run;

    expect(started).toEqual(["BTC", "MSFT"]);
    expect(completed).toEqual(["BTC", "MSFT"]);
    expect(results.map((result) => result.symbol)).toEqual(["BTC", "MSFT"]);
  });

  it("waits before starting the next symbol when the caller supplies a rate-limit delay", async () => {
    const events: string[] = [];

    await refreshSymbolsSequentially({
      symbols: ["BTC", "MSFT"],
      refreshSymbol: async (symbol) => {
        events.push(`refresh:${symbol}`);
        return { symbol, ok: true, apiCalls: 1, remainingCalls: 24 };
      },
      onResult: () => undefined,
      waitBeforeNext: async (result) => {
        events.push(`wait:${result.symbol}`);
      },
    });

    expect(events).toEqual(["refresh:BTC", "wait:BTC", "refresh:MSFT"]);
  });

  it("stops after a terminal quota result", async () => {
    const refreshed: string[] = [];

    const results = await refreshSymbolsSequentially({
      symbols: ["BTC", "MSFT", "SAP"],
      refreshSymbol: async (symbol) => {
        refreshed.push(symbol);
        return symbol === "MSFT"
          ? { symbol, ok: false, apiCalls: 0, remainingCalls: 0, reason: "API_DAILY_LIMIT", terminal: true }
          : { symbol, ok: true, apiCalls: 1, remainingCalls: 1 };
      },
      onResult: () => undefined,
    });

    expect(refreshed).toEqual(["BTC", "MSFT"]);
    expect(results.map((result) => result.symbol)).toEqual(["BTC", "MSFT"]);
  });

  it("stops after an Alpha Vantage throttle result", async () => {
    const refreshed: string[] = [];

    const results = await refreshSymbolsSequentially({
      symbols: ["BTC", "MSFT"],
      refreshSymbol: async (symbol) => {
        refreshed.push(symbol);
        return symbol === "BTC"
          ? { symbol, ok: false, apiCalls: 1, remainingCalls: 24, reason: "ALPHA_RATE_LIMIT", terminal: true }
          : { symbol, ok: true, apiCalls: 1, remainingCalls: 23 };
      },
      onResult: () => undefined,
    });

    expect(refreshed).toEqual(["BTC"]);
    expect(results).toHaveLength(1);
  });

  it("continues with the next symbol after a failed update", async () => {
    const results = await refreshSymbolsSequentially({
      symbols: ["BAD", "MSFT"],
      refreshSymbol: async (symbol) => {
        if (symbol === "BAD") throw new Error("No quote available");
        return { symbol, ok: true, apiCalls: 1, remainingCalls: 23 };
      },
      onResult: () => undefined,
    });

    expect(results).toEqual([
      { symbol: "BAD", ok: false, apiCalls: 0, remainingCalls: undefined, reason: "No quote available" },
      { symbol: "MSFT", ok: true, apiCalls: 1, remainingCalls: 23 },
    ]);
  });
});
