import express from 'express';
import { checkout, getShopSales, getSaleByReceipt, getAllSales, cancelSale } from '../controllers/pos.controller.js';
import { verifyToken, isAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verifyToken);

// Shop POS routes
router.post('/checkout', checkout);
router.get('/sales/shop', getShopSales);
router.get('/sales/receipt/:receiptNo', getSaleByReceipt);
router.patch('/sales/:receiptNo/cancel', cancelSale);

// Admin routes
router.get('/sales/all', isAdmin, getAllSales);

export default router;
