import dbConnect from "@/db/connect";
import Price from "@/db/models/Price";
import User from "@/db/models/User";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";

const ALPHA_KEY = process.env.ALPHAVANTAGE_KEY || process.env.NEXT_PUBLIC_ALPHAVANTAGE;

async function fetchStock(symbol) {
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${ALPHA_KEY}`;
  const resp = await fetch(url);
  const data = await resp.json();
  const content = data?.["Global Quote"];
  const price = content?.["05. price"];
  return price ? { value: Number(price), currency: "USD", raw: content } : null;
}

async function fetchCryptoToEUR(symbol) {
  const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${encodeURIComponent(
    symbol
  )}&to_currency=EUR&apikey=${ALPHA_KEY}`;
  const resp = await fetch(url);
  const data = await resp.json();
  const content = data?.["Realtime Currency Exchange Rate"];
  const rate = content?.["5. Exchange Rate"];
  return rate ? { value: Number(rate), currency: "EUR", raw: content } : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  await dbConnect();

  // Find local user by id (if present) or email
  let localUser = null;
  if (session.user?.id) {
    try {
      localUser = await User.findById(session.user.id);
    } catch (e) {}
  }
  if (!localUser && session.user?.email) {
    localUser = await User.findOne({ email: session.user.email });
  }

  if (!localUser) return res.status(404).json({ error: "Local user not found" });

  const assets = Array.isArray(localUser.assets) ? localUser.assets : [];
  const results = [];

  if (!ALPHA_KEY) {
    return res.status(500).json({ error: "AlphaVantage API key not configured (ALPHAVANTAGE_KEY)" });
  }

  for (const asset of assets) {
    const symbol = (asset.abb || asset.name || asset.ticker || asset.id || "").toString();
    if (!symbol) continue;

    try {
      let fetched = null;
      if ((asset.type || "").toLowerCase() === "crypto") {
        fetched = await fetchCryptoToEUR(symbol.toUpperCase());
      } else if ((asset.type || "").toLowerCase() === "stocks" || (asset.type || "").toLowerCase() === "stock") {
        fetched = await fetchStock(symbol);
      } else {
        // Heuristic: if abb contains non-numeric letters and possible dot, treat as stock
        if (/^[A-Z0-9\.\-]+$/i.test(symbol)) {
          fetched = await fetchStock(symbol);
        } else {
          // skip unsupported types (metals, real_estate, cash)
          continue;
        }
      }

      if (!fetched) {
        results.push({ symbol, ok: false, reason: "no data" });
        continue;
      }

      const doc = await Price.create({
        symbol,
        value: fetched.value,
        currency: fetched.currency || "USD",
        timestamp: new Date(),
        source: "alphavantage",
      });

      results.push({ symbol, ok: true, price: doc });
    } catch (e) {
      results.push({ symbol, ok: false, reason: e.message || String(e) });
    }
  }

  return res.status(200).json({ fetched: results.length, results });
}
