import mongoose, { Schema, Model, Document } from "mongoose";

export interface IAsset extends Document {
  id?: string;
  name: string;
  quantity?: number;
  notes?: string;
  isDeleted?: boolean;
  softDelete(): Promise<this>;
  softUndelete(): Promise<this>;
}

const assetSchema = new Schema<IAsset>({
  id: String,
  name: String,
  quantity: Number,
  notes: String,
});

assetSchema.methods.softDelete = function () {
  this.isDeleted = true;
  return this.save();
};

assetSchema.methods.softUndelete = function () {
  this.isDeleted = false;
  return this.save();
};

const Asset: Model<IAsset> = mongoose.models.Asset || mongoose.model<IAsset>("Asset", assetSchema);

export default Asset;
