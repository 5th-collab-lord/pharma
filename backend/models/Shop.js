import mongoose from "mongoose";

const shopSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShopUser",
      required: true,
    },
    ownerContact: {
      type: String,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    isOnline: {
      type: Boolean,
      default: false, // true only while the shop user has an active session
    },
    lastSeenAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "shop_profiles",
  },
);

const Shop = mongoose.model("Shop", shopSchema);
export default Shop;
