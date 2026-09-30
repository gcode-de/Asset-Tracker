import dbConnect from "../../../db/connect";
import User from "../../../db/models/User";
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";

export default async function handler(request: NextApiRequest, response: NextApiResponse) {
  await dbConnect();
  const { id } = request.query;
  const session = await getServerSession(request, response, authOptions);
  const email = session?.user?.email;
  if (!email) return response.status(401).json({ error: "Unauthorized" });
  const user = await User.findOne({ _id: id, email });
  if (!user) return response.status(404).json({ status: "Not Found" });

  if (request.method === "GET") {
    const safeUser = user.toObject();
    delete (safeUser as any).alphaVantageKeys;
    delete (safeUser as any).alphaVantageKeyCursor;
    delete (safeUser as any).password;
    return response.status(200).json(safeUser);
  }

  if (request.method === "PUT") {
    try {
      await User.updateOne({ _id: id, email }, request.body);
      return response.status(200).json("User updated");
    } catch (error) {
      console.log(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      response.status(400).json({ error: message });
    }
  }

  if (request.method === "DELETE") {
    try {
      await User.deleteOne({ _id: id, email });
      return response.status(200).json("User deleted");
    } catch (error) {
      console.log(error);
      const message = error instanceof Error ? error.message : "Unknown error";
      response.status(400).json({ error: message });
    }
  }
}
