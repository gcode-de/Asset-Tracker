import dbConnect from "@/db/connect";
import Price from "@/db/models/Price";
import User from "@/db/models/User";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import type { NextApiRequest, NextApiResponse } from "next";
import { isRefreshableAsset, preciousMetalSymbol } from "@/lib/price-refresh";
import { createAlphaVantageClient, MarketDataError } from "@/lib/alpha-vantage-provider";

// One quote plus an uncached conversion fits within the function budget.
export const config = { maxDuration: 30 };

function normalizeStockSymbol(symbol: string): string {
  return symbol.replace(/\.LON$/i, ".L").replace(/\.DEX$/i, ".DE");
}
function inferCurrencyForStock(symbol: string): string {
  const s = symbol.toUpperCase();
  if (/(\.LON$|\.L$)/.test(s)) return "GBP";
  if (/(\.DE$|\.FRA$|\.DEX$|\.AS$|\.PA$|\.MI$|\.BR$)/.test(s)) return "EUR";
  if (/\.TO$/.test(s)) return "CAD";
  if (/\.HK$/.test(s)) return "HKD";
  if (/\.T$/.test(s)) return "JPY";
  return "USD";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }
  let provider: Awaited<ReturnType<typeof createAlphaVantageClient>> | undefined;
  try {
    const session = await getServerSession(req, res, authOptions);
    const email = session?.user?.email;
    if (!email) return res.status(401).json({ error: "Unauthorized" });
    const requestedSymbol = req.body?.symbol;
    if (typeof requestedSymbol !== "string" || !requestedSymbol.trim()) return res.status(400).json({ error: "A single asset symbol is required for price refresh" });
    await dbConnect();
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });
    const symbol = requestedSymbol.toUpperCase();
    const asset = user.assets?.find((item: any) => !item.isDeleted && isRefreshableAsset(item) && String(item.abb || item.name || item.id || "").toUpperCase() === symbol);
    if (!asset) return res.status(404).json({ error: "Refreshable asset not found" });
    provider = await createAlphaVantageClient(email);
    const results: Array<{ symbol: string; ok: boolean; reason?: string; retryAfter?: number; price?: any }> = [];
    try {
      let value: number;
      const metal = preciousMetalSymbol(asset);
      if (metal) {
        const data = await provider.request({ function: "GOLD_SILVER_SPOT", symbol: metal });
        if (data?.nominal !== `${metal}USD` || typeof data?.timestamp !== "string" || !data.timestamp.trim() ||
          (typeof data?.price !== "string" && typeof data?.price !== "number")) {
          throw new MarketDataError("ALPHA_INVALID", "A valid USD precious-metal spot quote is unavailable.");
        }
        value = Number(data.price);
        if (Number.isFinite(value) && value > 0) value *= await provider.fxToEUR("USD");
      } else if (String(asset.type).toLowerCase() === "crypto") {
        const data = await provider.request({ function: "CURRENCY_EXCHANGE_RATE", from_currency: symbol, to_currency: "EUR" });
        value = Number(data?.["Realtime Currency Exchange Rate"]?.["5. Exchange Rate"]);
      } else {
        const normalized = normalizeStockSymbol(symbol);
        const data = await provider.request({ function: "GLOBAL_QUOTE", symbol: normalized });
        value = Number(data?.["Global Quote"]?.["05. price"]);
        if (Number.isFinite(value) && value > 0) value *= await provider.fxToEUR(inferCurrencyForStock(normalized));
      }
      if (!Number.isFinite(value) || value <= 0) {
        results.push({ symbol, ok: false, reason: "No valid price available for this symbol." });
      } else {
        const price = await Price.findOneAndUpdate({ symbol }, { symbol, value, currency: "EUR", timestamp: new Date(), source: "alphavantage", ...(metal ? { unit: "troy_ounce" } : {}) }, { upsert: true, new: true });
        results.push({ symbol, ok: true, price });
      }
    } catch (error) {
      if (error instanceof MarketDataError && error.retryAfter) res.setHeader("Retry-After", String(error.retryAfter));
      results.push({ symbol, ok: false, ...(error instanceof MarketDataError && error.retryAfter ? { retryAfter: error.retryAfter } : {}), reason: error instanceof MarketDataError ? error.message : "Price refresh failed. Please try again." });
    }
    const quota = await provider.quota().catch(() => undefined);
    return res.status(200).json({ fetched: results.filter((result) => result.ok).length, total: results.length, apiCalls: provider.apiCalls, ...(quota ? { remainingCalls: quota.remaining } : {}), results });
  } catch {
    return res.status(500).json({ error: "Price refresh failed. Please try again.", ...(provider ? { apiCalls: provider.apiCalls } : {}) });
  }
}
