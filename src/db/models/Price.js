import mongoose from "mongoose";

const { Schema } = mongoose;

const priceSchema = new Schema(
  {
    symbol: { type: String, required: true, index: true },
    value: { type: Number, required: true },
    currency: { type: String, default: "USD" },
    // optional timestamp provided by source (e.g. market timestamp)
    timestamp: { type: Date, default: Date.now },
    source: { type: String },
  },
  { timestamps: true }
);

const Price = mongoose.models.Price || mongoose.model("Price", priceSchema);

export default Price;
