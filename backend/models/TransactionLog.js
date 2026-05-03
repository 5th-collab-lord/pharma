import mongoose from 'mongoose';

const transactionLogSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'sale',
      'refund',
      'dispatch_create',
      'dispatch_confirm',
      'dispatch_reject',
      'stock_adjustment',
      'selling_price_alert',
    ],
    required: true,
    index: true,
  },
  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  referenceModel: {
    type: String,
    enum: ['Sale', 'Dispatch', 'Batch', 'ShopInventory'],
    required: true,
  },
  shopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    index: true,
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  performedByModel: {
    type: String,
    enum: ['Admin', 'ShopUser'],
    required: true,
  },
  amount: {
    type: Number,
    default: 0,
  },
  description: {
    type: String,
    trim: true,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  status: {
    type: String,
    enum: ['success', 'failed', 'pending'],
    default: 'success',
  },
  errorMessage: {
    type: String,
    default: null,
  },
}, {
  timestamps: true,
  collection: 'transaction_logs',
});

// Indexes for reporting
transactionLogSchema.index({ type: 1, createdAt: -1 });
transactionLogSchema.index({ shopId: 1, createdAt: -1 });
transactionLogSchema.index({ referenceId: 1 });
transactionLogSchema.index({ createdAt: -1 });

const TransactionLog = mongoose.model('TransactionLog', transactionLogSchema);
export default TransactionLog;
