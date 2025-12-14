import dbConnect from "@/db/connect";
import ApiCounter from "@/db/models/ApiCounter";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  await dbConnect();

  const today = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"

  let counter = await ApiCounter.findOne({ date: today });
  if (!counter) {
    counter = await ApiCounter.create({ date: today, count: 0, limit: 25 });
  }

  return res.status(200).json({
    date: counter.date,
    count: counter.count,
    limit: counter.limit,
    remaining: Math.max(0, counter.limit - counter.count),
  });
}
