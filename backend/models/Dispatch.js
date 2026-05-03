import mongoose from 'mongoose';

const dispatchSchema = new mongoose.Schema({
  shopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    required: true,
  },
  notes: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ['created', 'in_transit', 'delivered', 'confirmed', 'rejected'],
    default: 'created',
    index: true,
  },
  confirmedAt: {
    type: Date,
    default: null,
  },
  rejectedAt: {
    type: Date,
    default: null,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
  }
}, { 
  timestamps: true,
  collection: 'admin_dispatches'
});

const Dispatch = mongoose.model('Dispatch', dispatchSchema);
export default Dispatch;
