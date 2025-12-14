import type { NextApiRequest, NextApiResponse } from "next";

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

  const ALPHA_KEY = process.env.NEXT_PUBLIC_ALPHAVANTAGE || process.env.ALPHAVANTAGE_KEY;

  if (!ALPHA_KEY) {
    return res.status(500).json({ error: "AlphaVantage API key not configured" });
  }

  try {
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
    const stockResponse = await fetch(stockUrl);
    const stockData = await stockResponse.json();

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
    const message = error instanceof Error ? error.message : "Search failed";
    return res.status(500).json({ error: message });
  }
}
