import dbConnect from "@/db/connect";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { getAlphaVantageQuota } from "@/lib/alpha-vantage-provider";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.email) return res.status(401).json({ error: "Unauthorized" });
    await dbConnect();
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(await getAlphaVantageQuota(session.user.email));
  } catch {
    return res.status(500).json({ error: "App-tracked allowance could not be loaded. Please try again." });
  }
}
