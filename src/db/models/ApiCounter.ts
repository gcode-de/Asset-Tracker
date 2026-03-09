import mongoose, { Model } from "mongoose";
import type { Document } from "mongoose";

const { Schema } = mongoose;

export interface IApiCounter extends Document {
  date: string; // Format: "YYYY-MM-DD"
  apiKey: string; // AlphaVantage API Key hash or identifier
  count: number;
  limit: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const apiCounterSchema = new Schema<IApiCounter>(
  {
    date: { type: String, required: true }, // Format: "YYYY-MM-DD"
    apiKey: { type: String, required: true }, // AlphaVantage API Key hash
    count: { type: Number, default: 0 },
    limit: { type: Number, default: 25 },
  },
  { timestamps: true },
);

// Compound unique index on date and apiKey
apiCounterSchema.index({ date: 1, apiKey: 1 }, { unique: true });

// Proper Mongoose Model typing
let ApiCounter: Model<IApiCounter>;

if (mongoose.models.ApiCounter) {
  ApiCounter = mongoose.model<IApiCounter>("ApiCounter");
} else {
  ApiCounter = mongoose.model<IApiCounter>("ApiCounter", apiCounterSchema);
}

export default ApiCounter;
