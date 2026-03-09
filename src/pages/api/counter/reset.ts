import dbConnect from "@/db/connect";
import ApiCounter from "@/db/models/ApiCounter";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";

const ALPHA_KEY = process.env.ALPHAVANTAGE_KEY || process.env.NEXT_PUBLIC_ALPHAVANTAGE;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: "Unauthorized" });

  try {
    await dbConnect();

    // Remove old index if exists (migration for schema change)
    try {
      await ApiCounter.collection.dropIndex("date_1");
    } catch (e) {
      // Index might not exist, ignore
    }

    const today = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
    const apiKeyHash = crypto
      .createHash("sha256")
      .update(ALPHA_KEY || "")
      .digest("hex");

    // Reset the counter for today
    await ApiCounter.updateOne({ date: today, apiKey: apiKeyHash }, { count: 0 }, { upsert: true });

    return res.status(200).json({ message: "Counter reset successfully" });
  } catch (error) {
    console.error("Error in /api/counter/reset:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: `Internal server error: ${errorMessage}` });
  }
}
