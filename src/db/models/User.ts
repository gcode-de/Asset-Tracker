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
  isDeleted: boolean;
}

export interface IUser extends Document {
  email: string;
  password: string;
  name?: string;
  assets: IAsset[];
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
    isDeleted: { type: Boolean, default: false },
  },
  { _id: false }
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
});

const User: Model<IUser> = mongoose.model<IUser>("User", userSchema);
export default User;
