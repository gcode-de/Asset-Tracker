export interface RefreshableAsset {
  abb?: string;
  name?: string;
  id?: string | number;
  type?: string;
  isDeleted?: boolean;
}

export interface SymbolRefreshResult {
  symbol: string;
  ok: boolean;
  /** null means the server usage could not be determined. */
  apiCalls: number | null;
  remainingCalls?: number;
  reason?: string;
  terminal?: boolean;
}

export interface PriceRefreshResponse {
  fetched: number;
  apiCalls: number;
  remainingCalls: number;
  results?: Array<{ symbol: string; ok: boolean; reason?: string }>;
}

export function summarizeRefreshResults(results: SymbolRefreshResult[], fallbackRemaining: number) {
  return {
    fetched: results.filter((result) => result.ok).length,
    total: results.length,
    apiCalls: results.some((result) => result.apiCalls === null) ? null : results.reduce((sum, result) => sum + (result.apiCalls ?? 0), 0),
    remainingCalls: [...results].reverse().find((result) => typeof result.remainingCalls === "number")?.remainingCalls ?? fallbackRemaining,
  };
}

const refreshableAssetTypes = new Set(["stock", "stocks", "etf", "fund", "crypto"]);

export function isRefreshableAssetType(type: unknown): boolean {
  return refreshableAssetTypes.has(String(type || "").trim().toLowerCase());
}

function symbolFor(asset: RefreshableAsset): string {
  return String(asset.abb || asset.name || asset.id || "").trim().toUpperCase();
}

export function collectRefreshableSymbols(
  assets: RefreshableAsset[],
  lastUpdatedBySymbol: Map<string, Date> = new Map(),
): string[] {
  const uniqueSymbols = new Set<string>();

  for (const asset of assets) {
    if (asset.isDeleted) continue;
    if (!isRefreshableAssetType(asset.type)) continue;

    const symbol = symbolFor(asset);
    if (symbol) uniqueSymbols.add(symbol);
  }

  return [...uniqueSymbols].sort((left, right) => {
    const leftTime = lastUpdatedBySymbol.get(left)?.getTime() ?? 0;
    const rightTime = lastUpdatedBySymbol.get(right)?.getTime() ?? 0;
    return leftTime - rightTime;
  });
}

export async function refreshSymbolsSequentially({
  symbols,
  refreshSymbol,
  onResult,
  waitBeforeNext,
}: {
  symbols: string[];
  refreshSymbol: (symbol: string) => Promise<SymbolRefreshResult>;
  onResult: (result: SymbolRefreshResult, index: number, total: number) => void | Promise<void>;
  waitBeforeNext?: (result: SymbolRefreshResult, index: number, total: number) => void | Promise<void>;
}): Promise<SymbolRefreshResult[]> {
  const results: SymbolRefreshResult[] = [];

  for (const [index, symbol] of symbols.entries()) {
    let result: SymbolRefreshResult;
    try {
      result = await refreshSymbol(symbol);
    } catch (error) {
      result = {
        symbol,
        ok: false,
        apiCalls: null,
        remainingCalls: undefined,
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    results.push(result);
    await onResult(result, index, symbols.length);
    if (result.terminal) break;
    if (index < symbols.length - 1) await waitBeforeNext?.(result, index, symbols.length);
  }

  return results;
}
