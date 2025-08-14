import mongoose from "mongoose";
const { Schema } = mongoose;

const assetSchema = new Schema({
  id: String,
  name: String,
  quantity: Number,
  notes: String,
  // type: String,
  // abb: String,
  // value: Number,
  // baseValue: Number,
  // isDeleted: { type: Boolean, default: false },
  // user: {
  //   type: mongoose.Schema.Types.ObjectId,
  //   ref: "User",
  // },
});

assetSchema.methods.softDelete = function () {
  this.isDeleted = true;
  return this.save();
};

assetSchema.methods.softUndelete = function () {
  this.isDeleted = false;
  return this.save();
};

const Asset = mongoose.models.Asset || mongoose.model("Asset", assetSchema);

export default Asset;
