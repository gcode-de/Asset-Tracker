import mongoose, { Schema, Model, Document } from "mongoose";

if (mongoose.models.User) {
  delete mongoose.models.User;
}

export interface IAsset {
  id?: string | number;
  name: string;
  quantity: number;
  notes?: string;
  type: string;
  abb?: string;
  value: number;
  baseValue: number;
  costBasis?: number;
  isDeleted: boolean;
}

export interface IUserAlphaVantageKey {
  _id?: mongoose.Types.ObjectId;
  encryptedKey: string;
  maskedSuffix: string;
  createdAt: Date;
}

export interface IUser extends Document {
  email: string;
  password: string;
  name?: string;
  assets: IAsset[];
  alphaVantageKeys: IUserAlphaVantageKey[];
  alphaVantageKeyCursor: number;
}

const assetSchema = new Schema<IAsset>(
  {
    id: Schema.Types.Mixed,
    name: String,
    quantity: Number,
    notes: String,
    type: String,
    abb: String,
    value: Number,
    baseValue: Number,
    costBasis: Number,
    isDeleted: { type: Boolean, default: false },
  },
  { _id: false }
);

const alphaVantageKeySchema = new Schema<IUserAlphaVantageKey>(
  {
    encryptedKey: { type: String, required: true },
    maskedSuffix: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const userSchema = new Schema<IUser>({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  name: String,
  assets: [assetSchema],
  alphaVantageKeys: { type: [alphaVantageKeySchema], default: [] },
  alphaVantageKeyCursor: { type: Number, default: 0 },
});

const User: Model<IUser> = mongoose.model<IUser>("User", userSchema);
export default User;
