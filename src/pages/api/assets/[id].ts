import dbConnect from "../../../db/connect";
import Asset from "@/db/models/Asset";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(request: NextApiRequest, response: NextApiResponse) {
  await dbConnect();
  const { id } = request.query;

  if (request.method === "GET") {
    const asset = await Asset.findById(id as string).populate("reviews");

    if (!asset) {
      return response.status(404).json({ status: "Not Found" });
    }

    response.status(200).json(asset);
  }

  if (request.method === "PUT") {
    try {
      await Asset.findByIdAndUpdate(id as string, request.body);
      return response.status(200).json("Asset updated");
    } catch (error) {
      console.log(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      response.status(400).json({ error: message });
    }
  }

  if (request.method === "DELETE") {
    try {
      await Asset.findByIdAndDelete(id as string);
      return response.status(200).json("Asset deleted");
    } catch (error) {
      console.log(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      response.status(400).json({ error: message });
    }
  }
}
