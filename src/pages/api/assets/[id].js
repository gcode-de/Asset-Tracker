import dbConnect from "../../../db/connect";
import Asset from "@/db/models/Asset";

export default async function handler(request, response) {
  await dbConnect();
  const { id } = request.query;

  if (request.method === "GET") {
    const asset = await Asset.findById(id).populate("reviews");

    if (!asset) {
      return response.status(404).json({ status: "Not Found" });
    }

    response.status(200).json(asset);
  }

  if (request.method === "PUT") {
    try {
      await Asset.findByIdAndUpdate(id, request.body);
      return response.status(200).json("Asset updated");
    } catch (error) {
      console.log(error);
      response.status(400).json({ error: error.message });
    }
  }

  if (request.method === "DELETE") {
    try {
      await Asset.findByIdAndDelete(id);
      return response.status(200).json("Asset deleted");
    } catch (error) {
      console.log(error);
      response.status(400).json({ error: error.message });
    }
  }
}
