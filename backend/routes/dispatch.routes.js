import express from "express";
import {
  createDispatch,
  getAdminDispatches,
  getShopDispatches,
  acceptDispatch,
  rejectDispatch,
  markInTransit,
  getDispatchStockSummary,
} from "../controllers/dispatch.controller.js";
import { verifyToken, isAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(verifyToken);

// Admin routes
router.post("/", isAdmin, createDispatch);
router.get("/admin/recent", isAdmin, getAdminDispatches);
router.get("/admin/stock-summary", isAdmin, getDispatchStockSummary);
router.patch("/admin/:id/in-transit", isAdmin, markInTransit);

// Shop routes
router.get("/shop/incoming", getShopDispatches);
router.patch("/shop/:id/accept", acceptDispatch);
router.patch("/shop/:id/reject", rejectDispatch);

export default router;
