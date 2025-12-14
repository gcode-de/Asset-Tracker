import mongoose from "mongoose";

const { Schema } = mongoose;

const apiCounterSchema = new Schema(
  {
    date: { type: String, required: true, unique: true }, // Format: "YYYY-MM-DD"
    count: { type: Number, default: 0 },
    limit: { type: Number, default: 25 },
  },
  { timestamps: true }
);

const ApiCounter = mongoose.models.ApiCounter || mongoose.model("ApiCounter", apiCounterSchema);

export default ApiCounter;
