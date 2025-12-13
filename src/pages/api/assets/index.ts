import dbConnect from "@/db/connect";
import User from "@/db/models/User";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(request: NextApiRequest, response: NextApiResponse) {
  await dbConnect();

  if (request.method === "GET") {
    const userWithAssets = await User.findById("65d89f5846848f9939128fe0").populate("assets");
    console.log(userWithAssets);
    return response.status(200).json(userWithAssets);
  }

  if (request.method === "POST") {
    try {
      // Deprecated code - assets are now embedded in User
      return response.status(501).json({ error: "Not implemented - use /api/user endpoint" });
    } catch (error) {
      console.log(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      response.status(400).json({ error: message });
    }
  }

  if (request.method === "PUT") {
    try {
      // Deprecated code - assets are now embedded in User
      return response.status(501).json({ error: "Not implemented - use /api/user endpoint" });
    } catch (error) {
      console.log(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      response.status(400).json({ error: message });
    }
  }
}
