import dbConnect from "@/db/connect";
import User, { IAsset } from "@/db/models/User";
import { cleanAssets } from "../../../../defaultAssets";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import type { NextApiRequest, NextApiResponse } from "next";

interface AssetUpdateBody {
  id: string | number;
  name?: string;
  quantity?: number;
  notes?: string;
  type?: string;
  abb?: string;
  value?: number;
  baseValue?: number;
  isDeleted?: boolean;
}

const upsertEmbeddedAsset = (assets: IAsset[] = [], id: string | number, update: Partial<IAsset>) => {
  return assets.map((asset) => {
    const match = asset?.id === id || `${asset?.id}` === `${id}`;
    if (!match) return asset;
    return { ...asset, ...update };
  });
};

export default async function handler(request: NextApiRequest, response: NextApiResponse) {
  await dbConnect();

  const { method } = request;
  const { action } = request.query;
  const session = await getServerSession(request, response, authOptions);
  const userEmail = session?.user?.email;

  switch (method) {
    case "GET":
      const userWithAssets = await User.findOne({ email: userEmail || "null" });
      return response.status(200).json(userWithAssets);

    case "POST":
      try {
        const userId = request.body.userId;
        const user = await User.findById(userId);
        if (!user) {
          return response.status(404).json({ error: "User not found" });
        }

        const incomingId = request.body.id;
        const hasIncomingId = incomingId !== undefined && incomingId !== null && `${incomingId}`.trim() !== "";
        const newAsset: IAsset = {
          id: hasIncomingId ? incomingId : Date.now(),
          name: request.body.name ?? "",
          quantity: request.body.quantity ?? 0,
          notes: request.body.notes ?? "",
          type: request.body.type ?? "",
          abb: request.body.abb ?? "",
          value: request.body.value ?? 0,
          baseValue: request.body.baseValue ?? 0,
          isDeleted: false,
        } as IAsset;

        user.assets.push(newAsset);
        await user.save();
        return response.status(201).json(newAsset);
      } catch (error) {
        console.error(error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return response.status(400).json({ error: message });
      }

    case "PUT":
      try {
        const user = await User.findOne({ email: userEmail || "null" });
        if (!user) {
          return response.status(404).json({ error: "User not found" });
        }

        switch (action) {
          case "update": {
            user.assets = upsertEmbeddedAsset(user.assets, request.body.id, request.body);
            user.markModified("assets");
            await user.save();
            return response.status(200).json({ message: "Asset updated" });
          }
          case "softDelete": {
            user.assets = upsertEmbeddedAsset(user.assets, request.body.id, { isDeleted: true });
            user.markModified("assets");
            await user.save();
            return response.status(200).json({ message: "Asset soft-deleted" });
          }
          case "softUndelete": {
            user.assets = upsertEmbeddedAsset(user.assets, request.body.id, { isDeleted: false });
            user.markModified("assets");
            await user.save();
            return response.status(200).json({ message: "Asset soft-undeleted" });
          }
          case "RESET_ASSETS": {
            user.assets = cleanAssets;
            user.markModified("assets");
            await user.save();
            return response.status(200).json({ message: "Assets reset successfully" });
          }
          default:
            return response.status(400).json({ error: "Invalid action" });
        }
      } catch (error) {
        console.error(error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return response.status(400).json({ error: message });
      }

    default:
      return response.status(405).json({ error: "Method not allowed" });
  }
}
