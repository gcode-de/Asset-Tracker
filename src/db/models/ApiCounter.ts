import mongoose, { Model } from "mongoose";
import type { Document } from "mongoose";

const { Schema } = mongoose;

export interface IApiCounter extends Document {
  date: string; // Format: "YYYY-MM-DD"
  count: number;
  limit: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const apiCounterSchema = new Schema<IApiCounter>(
  {
    date: { type: String, required: true, unique: true }, // Format: "YYYY-MM-DD"
    count: { type: Number, default: 0 },
    limit: { type: Number, default: 25 },
  },
  { timestamps: true }
);

// Proper Mongoose Model typing
let ApiCounter: Model<IApiCounter>;

if (mongoose.models.ApiCounter) {
  ApiCounter = mongoose.model<IApiCounter>("ApiCounter");
} else {
  ApiCounter = mongoose.model<IApiCounter>("ApiCounter", apiCounterSchema);
}

export default ApiCounter;
