import express from 'express';
import { getDashboardStats, getShops, approveShop, rejectShop, removeShop, getAlerts } from '../controllers/admin.controller.js';
import { verifyToken, isAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

// All admin routes should be protected by verifyToken and isAdmin
router.use(verifyToken, isAdmin);

router.get('/stats', getDashboardStats);
router.get('/alerts', getAlerts);
router.get('/shops', getShops);
router.patch('/shops/:id/approve', approveShop);
router.delete('/shops/:id/reject', rejectShop);
router.delete('/shops/:id/remove', removeShop);

export default router;
