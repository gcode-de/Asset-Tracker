import dbConnect from "@/db/connect";
import Price from "@/db/models/Price";
import User from "@/db/models/User";
import ApiCounter from "@/db/models/ApiCounter";
import { findOneDoc, createDoc, findOneAndUpdateDoc } from "@/db/utils";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import type { NextApiRequest, NextApiResponse } from "next";

const ALPHA_KEY = process.env.ALPHAVANTAGE_KEY || process.env.NEXT_PUBLIC_ALPHAVANTAGE;

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

async function fetchStock(symbol: string): Promise<FetchResult | null> {
  const norm = normalizeStockSymbol(symbol);
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(norm)}&apikey=${ALPHA_KEY}`;
  const resp = await fetch(url);
  const data = await resp.json();
  ensureAlphaNotThrottled(data);
  const content = data?.["Global Quote"];
  const price = content?.["05. price"];
  if (!price) return null;
  await delay(1000); // AlphaVantage: 1 request per second
  return { value: Number(price), currency: inferCurrencyForStock(norm), raw: content };
}

async function fetchCryptoToEUR(symbol: string): Promise<FetchResult | null> {
  const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${encodeURIComponent(
    symbol
  )}&to_currency=EUR&apikey=${ALPHA_KEY}`;
  const resp = await fetch(url);
  const data = await resp.json();
  ensureAlphaNotThrottled(data);
  const content = data?.["Realtime Currency Exchange Rate"];
  const rate = content?.["5. Exchange Rate"];
  await delay(1000); // AlphaVantage: 1 request per second
  return rate ? { value: Number(rate), currency: "EUR", raw: content } : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  await dbConnect();

  // Get today's date for counter
  const today = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"

  // Get or create today's counter
  const existingCounter = await findOneDoc(ApiCounter, { date: today });
  let counter = existingCounter;
  if (!counter) {
    counter = await createDoc(ApiCounter, { date: today, count: 0, limit: 25 });
  }

  // Check if we've hit the limit
  if (counter.count >= counter.limit) {
    return res.status(429).json({
      error: "API limit reached for today",
      count: counter.count,
      limit: counter.limit,
    });
  }

  // Find current user and collect unique asset symbols
  const userEmail = session?.user?.email;
  if (!userEmail) {
    return res.status(400).json({ error: "User email not available in session" });
  }

  const currentUser = await User.findOne({ email: userEmail });
  if (!currentUser) {
    return res.status(404).json({ error: "User not found" });
  }

  const assetMap = new Map<string, { symbol: string; type: string }>();
  const assets = Array.isArray(currentUser.assets) ? currentUser.assets : [];
  for (const asset of assets) {
    // Skip soft-deleted assets
    if ((asset as any).isDeleted) continue;
    const symbol = (asset.abb || asset.name || asset.id || "").toString().toUpperCase();
    if (!symbol) continue;

    const type = (asset.type || "").toLowerCase();
    // Skip unsupported categories entirely
    const unsupported = new Set(["commodity", "commodities", "cash", "real_estate", "realestate", "property"]);
    if (unsupported.has(type)) continue;

    // Store unique symbols with their type
    if (!assetMap.has(symbol)) {
      assetMap.set(symbol, {
        symbol,
        type,
      });
    }
  }

  const uniqueAssets = Array.from(assetMap.values());
  const results: Array<{ symbol: string; ok: boolean; reason?: string; price?: any }> = [];

  if (!ALPHA_KEY) {
    return res.status(500).json({ error: "AlphaVantage API key not configured (ALPHAVANTAGE_KEY)" });
  }

  let apiCallCount = 0;
  const fxCache = new Map<string, number>(); // from->EUR rate

  async function getFxToEUR(from: string): Promise<number> {
    const cur = (from || "").toUpperCase();
    if (cur === "EUR") return 1;
    if (fxCache.has(cur)) return fxCache.get(cur)!;
    const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${encodeURIComponent(
      cur
    )}&to_currency=EUR&apikey=${ALPHA_KEY}`;
    const resp = await fetch(url);
    const data = await resp.json();
    ensureAlphaNotThrottled(data);
    const rateStr = data?.["Realtime Currency Exchange Rate"]?.["5. Exchange Rate"];
    const rate = rateStr ? Number(rateStr) : NaN;
    if (!rate || Number.isNaN(rate)) throw new Error(`FX rate not available for ${cur}->EUR`);
    fxCache.set(cur, rate);
    apiCallCount++;
    await delay(1000); // AlphaVantage: 1 request per second
    return rate;
  }

  for (const asset of uniqueAssets) {
    const { symbol } = asset;
    let type = (asset.type || "").toLowerCase();

    // Normalize some common types
    if (type === "etf" || type === "fund") type = "stock";

    try {
      let fetched: FetchResult | null = null;

      if (type === "crypto") {
        fetched = await fetchCryptoToEUR(symbol);
        apiCallCount++; // Increment for each API call
      } else if (type === "stocks" || type === "stock") {
        fetched = await fetchStock(symbol);
        apiCallCount++; // Increment for each API call
        // Convert non-EUR quotes to EUR for consistency
        if (fetched && fetched.currency && fetched.currency !== "EUR") {
          const rate = await getFxToEUR(fetched.currency);
          fetched = { value: fetched.value * rate, currency: "EUR", raw: fetched.raw };
        }
      } else {
        // Heuristic: only for unknown types, try stock API if symbol looks like a ticker
        if (/^[A-Z0-9\.-]+$/i.test(symbol)) {
          fetched = await fetchStock(symbol);
          apiCallCount++; // Increment for each API call
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
        { upsert: true, new: true } // Create if doesn't exist, return new doc
      );

      results.push({ symbol, ok: true, price: doc });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      results.push({ symbol, ok: false, reason: message });
      // If we hit AlphaVantage throttle, stop further requests to save remaining calls
      if ((e as any)?.code === "ALPHA_RATE_LIMIT" || String(message).startsWith("ALPHA_RATE_LIMIT")) {
        break;
      }
    }
  }

  // Update counter in DB
  if (apiCallCount > 0) {
    await ApiCounter.updateOne({ date: today }, { $inc: { count: apiCallCount } }, { upsert: true });
  }

  return res.status(200).json({
    fetched: results.filter((r) => r.ok).length,
    total: results.length,
    apiCalls: apiCallCount,
    remainingCalls: Math.max(0, counter.limit - (counter.count + apiCallCount)),
    results,
  });
}
