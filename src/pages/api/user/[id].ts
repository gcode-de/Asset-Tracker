import dbConnect from "../../../db/connect";
import User from "../../../db/models/User";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(request: NextApiRequest, response: NextApiResponse) {
  await dbConnect();
  const { id } = request.query;

  if (request.method === "GET") {
    const user = await User.findById(id as string).populate("reviews");

    if (!user) {
      return response.status(404).json({ status: "Not Found" });
    }
    console.log(user);
    response.status(200).json(user);
  }

  if (request.method === "PUT") {
    try {
      await User.findByIdAndUpdate(id as string, request.body);
      return response.status(200).json("User updated");
    } catch (error) {
      console.log(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      response.status(400).json({ error: message });
    }
  }

  if (request.method === "DELETE") {
    try {
      await User.findByIdAndDelete(id as string);
      return response.status(200).json("User deleted");
    } catch (error) {
      console.log(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      response.status(400).json({ error: message });
    }
  }
}
