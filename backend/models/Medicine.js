import mongoose from "mongoose";

const medicineSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
    },
    sku: {
      type: String,
      trim: true,
    },
    basePrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    requiredStock: {
      type: Number,
      default: 0,
      min: 0,
    },
    /** Total units ever ordered / received via warehouse batches (does not decrease on dispatch). */
    orderedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    collection: "admin_medicines",
  },
);

// Performance indexes
medicineSchema.index({ name: 1 });
medicineSchema.index({ category: 1 });
medicineSchema.index({ sku: 1 }, { unique: true, sparse: true });

// Auto-generate SKU if not provided
medicineSchema.pre("save", function (next) {
  if (!this.sku) {
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.sku = `MED-${this.name.substring(0, 3).toUpperCase()}-${randomStr}`;
  }
  next();
});

const Medicine = mongoose.model("Medicine", medicineSchema);
export default Medicine;
