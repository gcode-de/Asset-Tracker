import dbConnect from "@/db/connect";
import Price from "@/db/models/Price";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";

export default async function handler(req, res) {
  await dbConnect();

  if (req.method === "GET") {
    try {
      const { symbol } = req.query;

      if (symbol) {
        const latest = await Price.find({ symbol }).sort({ timestamp: -1, createdAt: -1 }).limit(1);
        return res.status(200).json(latest[0] || null);
      }

      const latestPerSymbol = await Price.aggregate([
        { $sort: { timestamp: -1, createdAt: -1 } },
        {
          $group: {
            _id: "$symbol",
            symbol: { $first: "$symbol" },
            value: { $first: "$value" },
            currency: { $first: "$currency" },
            timestamp: { $first: "$timestamp" },
            source: { $first: "$source" },
            recordedAt: { $first: "$createdAt" },
          },
        },
        { $project: { _id: 0 } },
      ]);

      return res.status(200).json(latestPerSymbol);
    } catch (e) {
      console.error("/api/prices GET error", e);
      return res.status(500).json({ error: e.message || "Server error" });
    }
  }

  if (req.method === "POST") {
    try {
      const session = await getServerSession(req, res, authOptions);
      if (!session) return res.status(401).json({ error: "Unauthorized" });

      const body = req.body;

      const items = Array.isArray(body) ? body : [body];

      const docs = items.map((it) => {
        const symbol = it.symbol || it.ticker || it.name;
        const value = Number(it.value ?? it.price ?? it.last);
        const currency = it.currency || it.cur || "USD";
        const timestamp = it.timestamp ? new Date(it.timestamp) : new Date();

        if (!symbol || Number.isNaN(value)) {
          throw new Error("Invalid payload for price item: symbol and numeric value required");
        }

        return { symbol, value, currency, timestamp, source: it.source || it.provider || "client" };
      });

      const created = await Price.insertMany(docs);

      return res.status(201).json({ saved: created.length, items: created });
    } catch (e) {
      console.error("/api/prices POST error", e);
      return res.status(400).json({ error: e.message || "Bad request" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
