import dbConnect from "../../../db/connect";
import User from "../../../db/models/User";

export default async function handler(request, response) {
  await dbConnect();
  const { id } = request.query;

  if (request.method === "GET") {
    const user = await User.findById(id).populate("reviews");

    if (!user) {
      return response.status(404).json({ status: "Not Found" });
    }
    console.log(user);
    response.status(200).json(user);
  }

  if (request.method === "PUT") {
    try {
      await User.findByIdAndUpdate(id, request.body);
      return response.status(200).json("User updated");
    } catch (error) {
      console.log(error);
      response.status(400).json({ error: error.message });
    }
  }

  if (request.method === "DELETE") {
    try {
      await User.findByIdAndDelete(id);
      return response.status(200).json("User deleted");
    } catch (error) {
      console.log(error);
      response.status(400).json({ error: error.message });
    }
  }
}
