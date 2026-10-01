import type { NextApiRequest, NextApiResponse } from "next";

/** A local reset cannot reset provider usage, so quota reservations are immutable. */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }
  return res.status(403).json({ error: "App-tracked allowances cannot be reset. They renew on the next UTC day." });
}
