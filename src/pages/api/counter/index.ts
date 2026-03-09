import dbConnect from "@/db/connect";
import ApiCounter from "@/db/models/ApiCounter";
import { findOneDoc, createDoc } from "@/db/utils";
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";

const ALPHA_KEY = process.env.ALPHAVANTAGE_KEY || process.env.NEXT_PUBLIC_ALPHAVANTAGE;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    await dbConnect();

    // Remove old index if exists (migration for schema change)
    try {
      await ApiCounter.collection.dropIndex("date_1");
    } catch (e) {
      // Index might not exist, ignore
    }

    const today = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"

    // Hash the API key
    const apiKeyHash = crypto
      .createHash("sha256")
      .update(ALPHA_KEY || "")
      .digest("hex");

    let counter = await findOneDoc(ApiCounter, { date: today, apiKey: apiKeyHash });
    if (!counter) {
      counter = await createDoc(ApiCounter, { date: today, apiKey: apiKeyHash, count: 0, limit: 25 });
    }

    return res.status(200).json({
      date: counter.date,
      count: counter.count,
      limit: counter.limit,
      remaining: Math.max(0, counter.limit - counter.count),
    });
  } catch (error) {
    console.error("Error in /api/counter:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: `Internal server error: ${errorMessage}` });
  }
}
