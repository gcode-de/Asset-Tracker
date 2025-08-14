// Alle Models aus dem Cache entfernen
// import mongoose from "mongoose";
// Object.keys(mongoose.models).forEach((modelName) => {
//   delete mongoose.models[modelName];
// });

import dbConnect from "@/db/connect";
import User from "@/db/models/User";
import Asset from "@/db/models/Asset";
import { cleanAssets } from "../../../../defaultAssets";

export default async function handler(request, response) {
  await dbConnect();

  const { method } = request;
  const { action } = request.query;

  switch (method) {
    case "GET":
      const userWithAssets = await User.findById("65d89f5846848f9939128fe0");
      return response.status(200).json(userWithAssets);

    case "POST":
      try {
        const newAsset = new Asset(request.body);
        await newAsset.save();
        await User.findByIdAndUpdate(request.body.userId, { $push: { assets: newAsset._id } });
        return response.status(201).json(newAsset);
      } catch (error) {
        console.error(error);
        return response.status(400).json({ error: error.message });
      }

    case "PUT":
      try {
        switch (action) {
          case "update":
            await Asset.findByIdAndUpdate(request.body.id, request.body);
            return response.status(200).json({ message: "Asset updated" });
          case "softDelete":
            await Asset.findByIdAndUpdate(request.body.id, { isDeleted: true });
            return response.status(200).json({ message: "Asset soft-deleted" });
          case "softUndelete":
            await Asset.findByIdAndUpdate(request.body.id, { isDeleted: false });
            return response.status(200).json({ message: "Asset soft-undeleted" });
          case "RESET_ASSETS":
            await User.findByIdAndUpdate("65d89f5846848f9939128fe0", {
              assets: cleanAssets,
            });
            return response.status(200).json({ message: "Assets reset successfully" });
          default:
            return response.status(400).json({ error: "Invalid action" });
        }
      } catch (error) {
        console.error(error);
        return response.status(400).json({ error: error.message });
      }

    default:
      return response.status(405).json({ error: "Method not allowed" });
  }
}
