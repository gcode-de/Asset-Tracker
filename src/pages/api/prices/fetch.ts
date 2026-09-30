import dbConnect from "@/db/connect";
import Price from "@/db/models/Price";
import User from "@/db/models/User";
import ApiCounter from "@/db/models/ApiCounter";
import { findOneDoc } from "@/db/utils";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { isRefreshableAssetType } from "@/lib/price-refresh";
import { resolveAlphaVantageKey } from "@/lib/alpha-vantage-key-resolver";

const ALPHA_VANTAGE_FREE_TIER_INTERVAL_MS = 12_000;
const ALPHA_VANTAGE_REQUEST_TIMEOUT_MS = 12_000;

interface FetchResult {
  value: number;
  currency: string;
  raw?: any;
}

// Helper: Wait for specified milliseconds (AlphaVantage requires 1 req/sec)
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Normalize certain exchange suffixes to AlphaVantage conventions
function normalizeStockSymbol(symbol: string): string {
  let s = String(symbol || "");
  // Common mappings: Yahoo-style -> AlphaVantage style
  s = s.replace(/\.LON$/i, ".L");
  s = s.replace(/\.DEX$/i, ".DE");
  return s;
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

function ensureAlphaNotThrottled(data: any) {
  if (data?.Note) {
    // AlphaVantage minute/day throttle reached
    const err = new Error("ALPHA_RATE_LIMIT: " + String(data.Note));
    (err as any).code = "ALPHA_RATE_LIMIT";
    throw err;
  }
  if (data?.["Error Message"]) {
    const err = new Error("ALPHA_INVALID: " + String(data["Error Message"]));
    (err as any).code = "ALPHA_INVALID";
    throw err;
  }
  if (data?.Information) {
    const err = new Error("ALPHA_INFO: " + String(data.Information));
    (err as any).code = "ALPHA_INFO";
    throw err;
  }
}

async function fetchStock(symbol: string, apiKey: string, reserveApiCall: () => Promise<() => Promise<void>>): Promise<FetchResult | null> {
  const norm = normalizeStockSymbol(symbol);
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(norm)}&apikey=${apiKey}`;
  const releaseApiCall = await reserveApiCall();
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(ALPHA_VANTAGE_REQUEST_TIMEOUT_MS) });
    const data = await resp.json();
    ensureAlphaNotThrottled(data);
    const content = data?.["Global Quote"];
    const priceStr = content?.["05. price"];
    if (!priceStr) return null;
    const price = Number(priceStr);
    if (Number.isNaN(price)) {
      throw new Error(`Invalid price string: "${priceStr}" for symbol ${norm}`);
    }
    return { value: price, currency: inferCurrencyForStock(norm), raw: content };
  } finally {
    await releaseApiCall();
  }
}

async function fetchCryptoToEUR(symbol: string, apiKey: string, reserveApiCall: () => Promise<() => Promise<void>>): Promise<FetchResult | null> {
  const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${encodeURIComponent(
    symbol,
  )}&to_currency=EUR&apikey=${apiKey}`;
  const releaseApiCall = await reserveApiCall();
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(ALPHA_VANTAGE_REQUEST_TIMEOUT_MS) });
    const data = await resp.json();
    ensureAlphaNotThrottled(data);
    const content = data?.["Realtime Currency Exchange Rate"];
    const rateStr = content?.["5. Exchange Rate"];
    if (!rateStr) return null;
    const rate = Number(rateStr);
    if (Number.isNaN(rate)) {
      throw new Error(`Invalid rate string: "${rateStr}" for crypto ${symbol}`);
    }
    return { value: rate, currency: "EUR", raw: content };
  } finally {
    await releaseApiCall();
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    await dbConnect();

    // Remove old index if exists (migration for schema change)
    try {
      await ApiCounter.collection.dropIndex("date_1");
    } catch {
      // Index might not exist, ignore
    }

    const { symbol: requestedSymbol } = req.body || {};
    if (!requestedSymbol) {
      return res.status(400).json({ error: "A single asset symbol is required for price refresh" });
    }
    const today = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
    const userEmail = session?.user?.email;
    if (!userEmail) {
      return res.status(400).json({ error: "User email not available in session" });
    }

    const currentUser = await User.findOne({ email: userEmail });
    if (!currentUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const alphaVantage = await resolveAlphaVantageKey(userEmail);
    const apiKeyHash = crypto.createHash("sha256").update(alphaVantage.key).digest("hex");

    // Atomically initialize today's counter before trying to reserve a provider call.
    const counter = await ApiCounter.findOneAndUpdate(
      { date: today, apiKey: apiKeyHash },
      { $setOnInsert: { date: today, apiKey: apiKeyHash, count: 0, limit: 25 } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    // Check if we've hit the limit
    if (counter.count >= counter.limit) {
      return res.status(429).json({
        error: "API limit reached for today",
        count: counter.count,
        limit: counter.limit,
      });
    }

    const assetMap = new Map<string, { symbol: string; type: string }>();
    const assets = Array.isArray(currentUser.assets) ? currentUser.assets : [];
    for (const asset of assets) {
      // Skip soft-deleted assets
      if ((asset as any).isDeleted) continue;
      const symbol = (asset.abb || asset.name || asset.id || "").toString().toUpperCase();
      if (!symbol) continue;

      const type = (asset.type || "").toLowerCase();
      if (!isRefreshableAssetType(type)) continue;

      // Store unique symbols with their type
      if (!assetMap.has(symbol)) {
        assetMap.set(symbol, {
          symbol,
          type,
        });
      }
    }

    const uniqueAssets = Array.from(assetMap.values());

    // If a specific symbol is requested, filter to only that one
    let filteredAssets = uniqueAssets;
    if (requestedSymbol) {
      const reqSym = requestedSymbol.toString().toUpperCase();
      filteredAssets = uniqueAssets.filter((a) => a.symbol === reqSym);
      if (filteredAssets.length === 0) {
        return res.status(404).json({ error: `Asset with symbol ${reqSym} not found` });
      }
    }

    // Sort assets by oldest price update first (only if fetching all)
    if (!requestedSymbol) {
      const symbols = filteredAssets.map((a) => a.symbol);
      const existingPrices = await Price.find({ symbol: { $in: symbols } }).sort({ timestamp: 1 }); // oldest first
      const priceMap = new Map(existingPrices.map((p) => [p.symbol, p.timestamp]));
      filteredAssets.sort((a, b) => {
        const aTime = priceMap.get(a.symbol)?.getTime() || 0;
        const bTime = priceMap.get(b.symbol)?.getTime() || 0;
        return aTime - bTime; // oldest first
      });
    }

    const results: Array<{ symbol: string; ok: boolean; reason?: string; price?: any }> = [];

    let apiCallCount = 0;
    let remainingCalls = Math.max(0, counter.limit - counter.count);
    const fxCache = new Map<string, number>(); // from->EUR rate

    async function reserveApiCall(): Promise<() => Promise<void>> {
      const lockId = crypto.randomUUID();
      const now = new Date();
      const updatedCounter = await ApiCounter.findOneAndUpdate(
        {
          date: today,
          apiKey: apiKeyHash,
          count: { $lt: counter.limit },
          $or: [
            { refreshLockExpiresAt: { $exists: false } },
            { refreshLockExpiresAt: { $lte: now } },
          ],
        },
        {
          $inc: { count: 1 },
          $set: { refreshLockId: lockId, refreshLockExpiresAt: new Date(now.getTime() + 30_000) },
        },
        { new: true },
      );

      if (!updatedCounter) {
        const latestCounter = await findOneDoc(ApiCounter, { date: today, apiKey: apiKeyHash });
        const code = !latestCounter || latestCounter.count >= latestCounter.limit ? "API_DAILY_LIMIT" : "API_UPDATE_IN_PROGRESS";
        const err = new Error(`${code}: ${code === "API_DAILY_LIMIT" ? "API limit reached for today" : "Another price update is in progress"}`);
        (err as any).code = code;
        throw err;
      }

      apiCallCount++;
      remainingCalls = Math.max(0, updatedCounter.limit - updatedCounter.count);
      const lastProviderRequestAt = updatedCounter.lastProviderRequestAt?.getTime() || 0;
      await delay(Math.max(0, lastProviderRequestAt + ALPHA_VANTAGE_FREE_TIER_INTERVAL_MS - Date.now()));
      await ApiCounter.updateOne(
        { date: today, apiKey: apiKeyHash, refreshLockId: lockId },
        { $set: { lastProviderRequestAt: new Date() } },
      );
      return async () => {
        await ApiCounter.updateOne(
          { date: today, apiKey: apiKeyHash, refreshLockId: lockId },
          { $unset: { refreshLockId: 1, refreshLockExpiresAt: 1 } },
        );
      };
    }

    async function getFxToEUR(from: string): Promise<number> {
      const cur = (from || "").toUpperCase();
      if (cur === "EUR") return 1;
      if (fxCache.has(cur)) return fxCache.get(cur)!;
      const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${encodeURIComponent(
        cur,
      )}&to_currency=EUR&apikey=${alphaVantage.key}`;
      const releaseApiCall = await reserveApiCall();
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(ALPHA_VANTAGE_REQUEST_TIMEOUT_MS) });
        const data = await resp.json();
        ensureAlphaNotThrottled(data);
        const rateStr = data?.["Realtime Currency Exchange Rate"]?.["5. Exchange Rate"];
        if (!rateStr) throw new Error(`FX rate not available for ${cur}->EUR`);
        const rate = Number(rateStr);
        if (Number.isNaN(rate)) throw new Error(`Invalid FX rate string: "${rateStr}" for ${cur}->EUR`);
        fxCache.set(cur, rate);
        return rate;
      } finally {
        await releaseApiCall();
      }
    }

    for (const asset of filteredAssets) {
      const { symbol } = asset;
      let type = (asset.type || "").toLowerCase();

      // Normalize some common types
      if (type === "etf" || type === "fund") type = "stock";

      try {
        let fetched: FetchResult | null = null;

        if (type === "crypto") {
          fetched = await fetchCryptoToEUR(symbol, alphaVantage.key, reserveApiCall);
        } else if (type === "stocks" || type === "stock") {
          fetched = await fetchStock(symbol, alphaVantage.key, reserveApiCall);
          // Convert non-EUR quotes to EUR for consistency
          if (fetched && fetched.currency && fetched.currency !== "EUR") {
            const rate = await getFxToEUR(fetched.currency);
            fetched = { value: fetched.value * rate, currency: "EUR", raw: fetched.raw };
          }
        } else {
          // Heuristic: only for unknown types, try stock API if symbol looks like a ticker
          if (/^[A-Z0-9\.-]+$/i.test(symbol)) {
            fetched = await fetchStock(symbol, alphaVantage.key, reserveApiCall);
            if (fetched && fetched.currency && fetched.currency !== "EUR") {
              const rate = await getFxToEUR(fetched.currency);
              fetched = { value: fetched.value * rate, currency: "EUR", raw: fetched.raw };
            }
          } else {
            // skip unsupported types (metals, real_estate, cash)
            continue;
          }
        }

        if (!fetched) {
          results.push({ symbol, ok: false, reason: "no data" });
          continue;
        }

        // Upsert: Update existing or create new price entry (no duplicates!)
        const doc = await Price.findOneAndUpdate(
          { symbol }, // Find by symbol
          {
            symbol,
            value: fetched.value,
            currency: fetched.currency || "USD",
            timestamp: new Date(),
            source: "alphavantage",
          },
          { upsert: true, new: true }, // Create if doesn't exist, return new doc
        );

        results.push({ symbol, ok: true, price: doc });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        results.push({ symbol, ok: false, reason: message });
        // If we hit AlphaVantage throttle, stop further requests to save remaining calls
        if (
          (e as any)?.code === "ALPHA_RATE_LIMIT" ||
          (e as any)?.code === "API_DAILY_LIMIT" ||
          (e as any)?.code === "API_UPDATE_IN_PROGRESS" ||
          String(message).startsWith("ALPHA_RATE_LIMIT") ||
          String(message).startsWith("API_DAILY_LIMIT") ||
          String(message).startsWith("API_UPDATE_IN_PROGRESS")
        ) {
          break;
        }
      }
    }


    return res.status(200).json({
      fetched: results.filter((r) => r.ok).length,
      total: results.length,
      apiCalls: apiCallCount,
      remainingCalls,
      results,
    });
  } catch (error) {
    console.error("Error in /api/prices/fetch:", error);
    return res.status(500).json({ error: "Price refresh failed. Please try again." });
  }
}
