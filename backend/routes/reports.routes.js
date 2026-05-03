import express from "express";
import {
  getReportByPeriod,
  getAdminDashboardStats,
  getShopDashboardStats,
  getSalesTrend,
  getAnalyticsStats,
  getFilteredStats,
} from "../controllers/reports.controller.js";
import { verifyToken, isAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(verifyToken);

// Static routes FIRST
router.get("/dashboard/shop", getShopDashboardStats);
router.get("/dashboard/admin", isAdmin, getAdminDashboardStats);
router.get("/trend/sales", isAdmin, getSalesTrend);
router.get("/analytics", isAdmin, getAnalyticsStats);
router.get("/filter", isAdmin, getFilteredStats);

// Dynamic route LAST
router.get("/:period", isAdmin, getReportByPeriod);

export default router;
