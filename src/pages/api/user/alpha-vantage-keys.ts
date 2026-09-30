import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import dbConnect from "@/db/connect";
import User, { type IUserAlphaVantageKey } from "@/db/models/User";
import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { encryptUserApiKey, maskUserApiKey } from "@/lib/user-api-keys";

type KeyMetadata = { id: string; maskedSuffix: string; createdAt: string };

function metadata(key: IUserAlphaVantageKey): KeyMetadata {
  return {
    id: String(key._id),
    maskedSuffix: key.maskedSuffix,
    createdAt: new Date(key.createdAt).toISOString(),
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  const email = session?.user?.email;
  if (!email) return res.status(401).json({ error: "Unauthorized" });

  await dbConnect();

  if (req.method === "GET") {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.status(200).json({ keys: (user.alphaVantageKeys || []).map(metadata) });
  }

  if (req.method === "POST") {
    const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey.trim() : "";
    if (!apiKey) return res.status(400).json({ error: "Alpha Vantage API key is required" });

    let encryptedKey: string;
    try {
      encryptedKey = encryptUserApiKey(apiKey);
    } catch {
      return res.status(500).json({ error: "Private API key storage is not configured" });
    }

    const user = await User.findOneAndUpdate(
      { email, "alphaVantageKeys.2": { $exists: false } },
      { $push: { alphaVantageKeys: { encryptedKey, maskedSuffix: maskUserApiKey(apiKey), createdAt: new Date() } } },
      { new: true },
    );
    if (!user) return res.status(400).json({ error: "You can save up to 3 Alpha Vantage API keys" });
    return res.status(201).json({ key: metadata(user.alphaVantageKeys[user.alphaVantageKeys.length - 1]) });
  }

  if (req.method === "DELETE") {
    const id = typeof req.query.id === "string" ? req.query.id : "";
    if (!id) return res.status(400).json({ error: "API key id is required" });
    const user = await User.findOneAndUpdate({ email, "alphaVantageKeys._id": id }, { $pull: { alphaVantageKeys: { _id: id } } }, { new: true });
    if (!user) return res.status(404).json({ error: "API key not found" });
    return res.status(200).json({ keys: user.alphaVantageKeys.map(metadata) });
  }

  res.setHeader("Allow", ["GET", "POST", "DELETE"]);
  return res.status(405).json({ error: "Method not allowed" });
}
