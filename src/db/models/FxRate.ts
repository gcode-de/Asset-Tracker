import mongoose, { type Model } from "mongoose";

interface IFxRate { from: string; to: string; rate: number; timestamp: Date }
const schema = new mongoose.Schema<IFxRate>({
  from: { type: String, required: true },
  to: { type: String, required: true },
  rate: { type: Number, required: true, validate: (value: number) => Number.isFinite(value) && value > 0 },
  timestamp: { type: Date, required: true },
});
schema.index({ from: 1, to: 1 }, { unique: true });
// Logical expiry is checked on read; do not depend on asynchronous TTL deletion.
const FxRate: Model<IFxRate> = mongoose.models.FxRate || mongoose.model<IFxRate>("FxRate", schema);
export default FxRate;
