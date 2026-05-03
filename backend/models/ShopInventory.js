import mongoose from 'mongoose';

const shopInventorySchema = new mongoose.Schema({
  shopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true,
  },
  medicineId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medicine',
    required: true,
  },
  batchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Batch',
    required: true,
  },
  stock: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  /** Branch selling price (what POS charges; shop can edit for margin). */
  retailPrice: {
    type: Number,
    min: 0,
    default: null,
  },
  /** Admin-mandated retail from latest dispatch for this batch (alerts if sale differs). */
  authorisedRetailPrice: {
    type: Number,
    min: 0,
    default: null,
  },
}, {
  timestamps: true,
  collection: 'shop_local_inventory'
});

// Performance indexes
shopInventorySchema.index({ shopId: 1, medicineId: 1 });
shopInventorySchema.index({ shopId: 1, batchId: 1 });
shopInventorySchema.index({ stock: 1 });

const ShopInventory = mongoose.model('ShopInventory', shopInventorySchema);
export default ShopInventory;
