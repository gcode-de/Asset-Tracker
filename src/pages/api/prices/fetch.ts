import dbConnect from "@/db/connect";
import Price from "@/db/models/Price";
import User from "@/db/models/User";
import ApiCounter from "@/db/models/ApiCounter";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import type { NextApiRequest, NextApiResponse } from "next";

const ALPHA_KEY = process.env.ALPHAVANTAGE_KEY || process.env.NEXT_PUBLIC_ALPHAVANTAGE;

interface FetchResult {
  value: number;
  currency: string;
  raw?: any;
}

async function fetchStock(symbol: string): Promise<FetchResult | null> {
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${ALPHA_KEY}`;
  const resp = await fetch(url);
  const data = await resp.json();
  const content = data?.["Global Quote"];
  const price = content?.["05. price"];
  return price ? { value: Number(price), currency: "USD", raw: content } : null;
}

async function fetchCryptoToEUR(symbol: string): Promise<FetchResult | null> {
  const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${encodeURIComponent(
    symbol
  )}&to_currency=EUR&apikey=${ALPHA_KEY}`;
  const resp = await fetch(url);
  const data = await resp.json();
  const content = data?.["Realtime Currency Exchange Rate"];
  const rate = content?.["5. Exchange Rate"];
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
  let counter = await ApiCounter.findOne({ date: today });
  if (!counter) {
    counter = await ApiCounter.create({ date: today, count: 0, limit: 25 });
  }

  // Check if we've hit the limit
  if (counter.count >= counter.limit) {
    return res.status(429).json({
      error: "API limit reached for today",
      count: counter.count,
      limit: counter.limit,
    });
  }

  // Find all users and collect all unique asset symbols
  const allUsers = await User.find({});
  const assetMap = new Map<string, { symbol: string; type: string }>();

  for (const user of allUsers) {
    const assets = Array.isArray(user.assets) ? user.assets : [];
    for (const asset of assets) {
      const symbol = (asset.abb || asset.name || asset.id || "").toString().toUpperCase();
      if (!symbol) continue;

      // Store unique symbols with their type
      if (!assetMap.has(symbol)) {
        assetMap.set(symbol, {
          symbol,
          type: (asset.type || "").toLowerCase(),
        });
      }
    }
  }

  const uniqueAssets = Array.from(assetMap.values());
  const results: Array<{ symbol: string; ok: boolean; reason?: string; price?: any }> = [];

  if (!ALPHA_KEY) {
    return res.status(500).json({ error: "AlphaVantage API key not configured (ALPHAVANTAGE_KEY)" });
  }

  let apiCallCount = 0;

  for (const asset of uniqueAssets) {
    const { symbol, type } = asset;

    try {
      let fetched: FetchResult | null = null;

      if (type === "crypto") {
        fetched = await fetchCryptoToEUR(symbol);
        apiCallCount++; // Increment for each API call
      } else if (type === "stocks" || type === "stock") {
        fetched = await fetchStock(symbol);
        apiCallCount++; // Increment for each API call
      } else {
        // Heuristic: if symbol looks like a stock ticker, try fetching
        if (/^[A-Z0-9\.\-]+$/i.test(symbol)) {
          fetched = await fetchStock(symbol);
          apiCallCount++; // Increment for each API call
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
          recordedAt: new Date(),
          source: "alphavantage",
        },
        { upsert: true, new: true } // Create if doesn't exist, return new doc
      );

      results.push({ symbol, ok: true, price: doc });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      results.push({ symbol, ok: false, reason: message });
    }
  }

  // Update counter in DB
  if (apiCallCount > 0) {
    await ApiCounter.findOneAndUpdate({ date: today }, { $inc: { count: apiCallCount } }, { upsert: true });
  }

  return res.status(200).json({
    fetched: results.filter((r) => r.ok).length,
    total: results.length,
    apiCalls: apiCallCount,
    remainingCalls: Math.max(0, counter.limit - (counter.count + apiCallCount)),
    results,
  });
}
