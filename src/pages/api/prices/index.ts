import dbConnect from "@/db/connect";
import Price from "@/db/models/Price";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import type { NextApiRequest, NextApiResponse } from "next";

interface PriceItem {
  symbol?: string;
  ticker?: string;
  name?: string;
  value?: number;
  price?: number;
  last?: number;
  currency?: string;
  cur?: string;
  timestamp?: string | Date;
  source?: string;
  provider?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await dbConnect();

  if (req.method === "GET") {
    try {
      const { symbol } = req.query;

      if (symbol) {
        const latest = await Price.find({ symbol: symbol as string })
          .sort({ timestamp: -1, createdAt: -1 })
          .limit(1);
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
            // Use last update time as the "Recorded" timestamp shown in UI
            recordedAt: { $first: "$updatedAt" },
          },
        },
        { $project: { _id: 0 } },
      ]);

      return res.status(200).json(latestPerSymbol);
    } catch (e) {
      console.error("/api/prices GET error", e);
      const message = e instanceof Error ? e.message : "Server error";
      return res.status(500).json({ error: message });
    }
  }

  if (req.method === "POST") {
    try {
      const session = await getServerSession(req, res, authOptions);
      if (!session) return res.status(401).json({ error: "Unauthorized" });

      const body = req.body;

      const items: PriceItem[] = Array.isArray(body) ? body : [body];

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
      const message = e instanceof Error ? e.message : "Bad request";
      return res.status(400).json({ error: message });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
