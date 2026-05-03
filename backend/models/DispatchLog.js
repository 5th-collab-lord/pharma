import mongoose from 'mongoose';

const dispatchLogSchema = new mongoose.Schema({
  dispatchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dispatch',
    required: true,
    index: true,
  },
  action: {
    type: String,
    enum: ['created', 'in_transit', 'delivered', 'confirmed', 'rejected', 'cancelled'],
    required: true,
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'performedByModel',
  },
  performedByModel: {
    type: String,
    enum: ['Admin', 'ShopUser'],
    required: true,
  },
  notes: {
    type: String,
    trim: true,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
  collection: 'dispatch_logs',
});

// Index for efficient log retrieval
dispatchLogSchema.index({ dispatchId: 1, createdAt: -1 });

const DispatchLog = mongoose.model('DispatchLog', dispatchLogSchema);
export default DispatchLog;
