import mongoose from 'mongoose';

const batchSchema = new mongoose.Schema({
  medicineId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medicine',
    required: true,
  },
  batchNumber: {
    type: String,
    required: true,
    trim: true,
  },
  stock: {
    type: Number,
    required: true,
    min: 0,
  },
  expiryDate: {
    type: Date,
    required: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  }
}, {
  timestamps: true,
  collection: 'admin_warehouse_stock'
});

// Performance indexes
batchSchema.index({ medicineId: 1 });
batchSchema.index({ expiryDate: 1 });
batchSchema.index({ batchNumber: 1 });

const Batch = mongoose.model('Batch', batchSchema);
export default Batch;
