import mongoose, { Schema, Model, Document } from "mongoose";

export interface IPrice extends Document {
  symbol: string;
  value: number;
  currency: string;
  timestamp: Date;
  source?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const priceSchema = new Schema<IPrice>(
  {
    symbol: { type: String, required: true, index: true },
    value: { type: Number, required: true },
    currency: { type: String, default: "USD" },
    timestamp: { type: Date, default: Date.now },
    source: { type: String },
  },
  { timestamps: true }
);

const Price: Model<IPrice> = mongoose.models.Price || mongoose.model<IPrice>("Price", priceSchema);

export default Price;
