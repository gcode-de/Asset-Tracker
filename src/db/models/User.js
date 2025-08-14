import mongoose from "mongoose";
if (mongoose.models.User) {
  delete mongoose.models.User;
}

const { Schema } = mongoose;

const assetSchema = new Schema(
  {
    id: Number,
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

const userSchema = new Schema({
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

const User = mongoose.model("User", userSchema);
export default User;
