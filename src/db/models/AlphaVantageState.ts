import mongoose, { type Model } from "mongoose";

export interface IAlphaVantageState {
  keyHash: string;
  refreshLockId?: string;
  pendingRequestId?: string;
  pendingRequestExpiresAt?: Date;
  refreshLockExpiresAt?: Date;
  lastProviderRequestAt?: Date;
  cooldownUntil?: Date;
  cooldownCode?: string;
}

// Key-scoped (not day-scoped): pacing and provider blocks survive UTC midnight.
// No raw tokens or provider response bodies are stored.
const schema = new mongoose.Schema<IAlphaVantageState>({
  keyHash: { type: String, required: true, unique: true },
  refreshLockId: String,
  // Outcome guard outlives the lease, but abandoned workers recover automatically.
  pendingRequestId: String,
  pendingRequestExpiresAt: Date,
  refreshLockExpiresAt: Date,
  lastProviderRequestAt: Date,
  cooldownUntil: Date,
  cooldownCode: String,
}, { timestamps: true });

const AlphaVantageState: Model<IAlphaVantageState> = mongoose.models.AlphaVantageState || mongoose.model<IAlphaVantageState>("AlphaVantageState", schema);
export default AlphaVantageState;
