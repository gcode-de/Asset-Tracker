import type { NextApiRequest, NextApiResponse } from "next";
import dbConnect from "@/db/connect";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { createAlphaVantageClient, MarketDataError } from "@/lib/alpha-vantage-provider";

export const config = { maxDuration: 30 };

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
  apiCalls?: number;
  remainingCalls?: number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<SearchResponse | { error: string; apiCalls?: number; remainingCalls?: number }>) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { query } = req.query;

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return res.status(400).json({ error: "Query parameter is required" });
  }

  const session = await getServerSession(req, res, authOptions);
  const email = session?.user?.email;
  if (!email) return res.status(401).json({ error: "Unauthorized" });

  let provider: Awaited<ReturnType<typeof createAlphaVantageClient>> | undefined;
  try {
    await dbConnect();
    provider = await createAlphaVantageClient(email);

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
    let stockData: any;
    try {
      stockData = await provider.request({ function: "SYMBOL_SEARCH", keywords: query });
    } catch (error) {
      const quota = await provider.quota().catch(() => undefined);
      const terminal = error instanceof MarketDataError && /^(API_DAILY_LIMIT|API_UPDATE_IN_PROGRESS|ALPHA_RATE_LIMIT)$/.test(error.code);
      return res.status(terminal ? 429 : 502).json({ error: error instanceof MarketDataError ? error.message : "Asset search failed. Please try again.", apiCalls: provider.apiCalls, ...(quota ? { remainingCalls: quota.remaining } : {}) });
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

    const quota = await provider.quota().catch(() => undefined);
    return res.status(200).json({ matches: matches.slice(0, 10), count: matches.length, apiCalls: provider.apiCalls, ...(quota ? { remainingCalls: quota.remaining } : {}) });
  } catch {
    return res.status(500).json({ error: "Asset search failed. Please try again.", ...(provider ? { apiCalls: provider.apiCalls } : {}) });
  }
}
