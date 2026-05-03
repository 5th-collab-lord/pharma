import mongoose from 'mongoose';

const shopUserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    default: 'shop',
  },
  shopId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shop',
    default: null,
  }
}, { 
  timestamps: true,
  collection: 'shop_users' // Explicitly setting collection name for User/Shop folder
});

const ShopUser = mongoose.model('ShopUser', shopUserSchema);
export default ShopUser;
