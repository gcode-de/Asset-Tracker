import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import dbConnect from "@/db/connect";
import ApiCounter from "@/db/models/ApiCounter";

const ALPHA_VANTAGE_FREE_TIER_INTERVAL_MS = 12_000;
const ALPHA_VANTAGE_REQUEST_TIMEOUT_MS = 12_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface AlphaVantageSearchResult {
  "1. symbol": string;
  "2. name": string;
  "3. type": string;
  "4. region": string;
  "5. marketopen": string;
  "6. marketclose": string;
  "7. timezone": string;
  "8. currency": string;
  "9. matchscore": string;
}

interface SearchMatch {
  symbol: string;
  name: string;
  type: string;
  region?: string;
  currency?: string;
  bestMatch?: boolean;
  assetClass?: "crypto" | "stocks" | "metals" | "cash" | "real_estate";
}

interface SearchResponse {
  matches: SearchMatch[];
  count: number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<SearchResponse | { error: string }>) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { query } = req.query;

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return res.status(400).json({ error: "Query parameter is required" });
  }

  const ALPHA_KEY = process.env.ALPHAVANTAGE_KEY;

  if (!ALPHA_KEY) {
    return res.status(500).json({ error: "AlphaVantage API key not configured" });
  }

  try {
    await dbConnect();
    const today = new Date().toISOString().split("T")[0];
    const apiKeyHash = crypto.createHash("sha256").update(ALPHA_KEY).digest("hex");
    const counter = await ApiCounter.findOneAndUpdate(
      { date: today, apiKey: apiKeyHash },
      { $setOnInsert: { date: today, apiKey: apiKeyHash, count: 0, limit: 25 } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const lockId = crypto.randomUUID();
    const now = new Date();
    const lockedCounter = await ApiCounter.findOneAndUpdate(
      {
        date: today,
        apiKey: apiKeyHash,
        count: { $lt: counter.limit },
        $or: [{ refreshLockExpiresAt: { $exists: false } }, { refreshLockExpiresAt: { $lte: now } }],
      },
      { $inc: { count: 1 }, $set: { refreshLockId: lockId, refreshLockExpiresAt: new Date(now.getTime() + 30_000) } },
      { new: true },
    );
    if (!lockedCounter) {
      return res.status(429).json({ error: "Market data is busy or the daily limit has been reached" });
    }

    const lastProviderRequestAt = lockedCounter.lastProviderRequestAt?.getTime() || 0;
    await delay(Math.max(0, lastProviderRequestAt + ALPHA_VANTAGE_FREE_TIER_INTERVAL_MS - Date.now()));
    await ApiCounter.updateOne(
      { date: today, apiKey: apiKeyHash, refreshLockId: lockId },
      { $set: { lastProviderRequestAt: new Date() } },
    );

    // Common crypto symbols to search for
    const cryptoSymbols = ["BTC", "ETH", "BNB", "XRP", "ADA", "DOGE", "SOL", "MATIC", "DOT", "AVAX", "SHIB", "LTC", "UNI", "LINK", "XLM"];
    const queryUpper = query.toUpperCase();

    // Check if query matches common crypto patterns
    const isCryptoQuery =
      cryptoSymbols.some((symbol) => queryUpper.includes(symbol)) ||
      queryUpper.includes("COIN") ||
      queryUpper.includes("BITCOIN") ||
      queryUpper.includes("ETHEREUM") ||
      queryUpper.includes("CRYPTO");

    // Search stocks/ETFs
    const stockUrl = `https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(query)}&apikey=${ALPHA_KEY}`;
    let stockData: any;
    try {
      const stockResponse = await fetch(stockUrl, { signal: AbortSignal.timeout(ALPHA_VANTAGE_REQUEST_TIMEOUT_MS) });
      stockData = await stockResponse.json();
    } finally {
      await ApiCounter.updateOne(
        { date: today, apiKey: apiKeyHash, refreshLockId: lockId },
        { $unset: { refreshLockId: 1, refreshLockExpiresAt: 1 } },
      );
    }

    let matches: SearchMatch[] = [];

    // Add stock results
    if (stockData.bestMatches && Array.isArray(stockData.bestMatches)) {
      const stockMatches = stockData.bestMatches.slice(0, 8).map((item: AlphaVantageSearchResult, index: number) => {
        const apiType = item["3. type"];
        let assetClass: "crypto" | "stocks" | "metals" | "cash" | "real_estate" = "stocks";

        // Map API type to our asset classes
        if (apiType.toLowerCase().includes("etf")) {
          assetClass = "stocks";
        } else if (apiType.toLowerCase().includes("equity") || apiType.toLowerCase().includes("stock")) {
          assetClass = "stocks";
        }

        return {
          symbol: item["1. symbol"],
          name: item["2. name"],
          type: item["3. type"],
          region: item["4. region"],
          currency: item["8. currency"],
          bestMatch: index === 0,
          assetClass,
        };
      });
      matches = [...matches, ...stockMatches];
    }

    // Add common crypto results if query looks crypto-related
    if (isCryptoQuery) {
      const cryptoMatches = cryptoSymbols
        .filter((symbol) => symbol.includes(queryUpper) || queryUpper.includes(symbol))
        .slice(0, 5)
        .map((symbol, index) => {
          const cryptoNames: Record<string, string> = {
            BTC: "Bitcoin",
            ETH: "Ethereum",
            BNB: "Binance Coin",
            XRP: "Ripple",
            ADA: "Cardano",
            DOGE: "Dogecoin",
            SOL: "Solana",
            MATIC: "Polygon",
            DOT: "Polkadot",
            AVAX: "Avalanche",
            SHIB: "Shiba Inu",
            LTC: "Litecoin",
            UNI: "Uniswap",
            LINK: "Chainlink",
            XLM: "Stellar",
          };

          return {
            symbol,
            name: cryptoNames[symbol] || symbol,
            type: "Cryptocurrency",
            currency: "USD",
            bestMatch: matches.length === 0 && index === 0,
            assetClass: "crypto" as const,
          };
        });

      matches = [...cryptoMatches, ...matches];
    }

    return res.status(200).json({ matches: matches.slice(0, 10), count: matches.length });
  } catch (error) {
    console.error("Asset search error:", error);
    return res.status(500).json({ error: "Asset search failed. Please try again." });
  }
}
