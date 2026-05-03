import mongoose from 'mongoose';

const dispatchItemSchema = new mongoose.Schema({
  dispatchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dispatch',
    required: true,
  },
  batchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Batch',
    required: true,
  },
  medicineId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medicine',
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  /** Admin-set retail price guideline for this batch at dispatch time. */
  mandatedSellingPrice: {
    type: Number,
    min: 0,
    default: null,
  },
}, { 
  timestamps: true,
  collection: 'admin_dispatch_items'
});

const DispatchItem = mongoose.model('DispatchItem', dispatchItemSchema);
export default DispatchItem;
