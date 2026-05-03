import express from "express";
import {
  getInventory,
  addInventory,
  getShopInventory,
  patchShopInventoryRetail,
  getMedicines,
  addMedicine,
  updateMedicine,
  deleteMedicine,
  getInventoryStats,
} from "../controllers/inventory.controller.js";
import { verifyToken, isAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(verifyToken);

// Warehouse batches
router.get("/", getInventory);
router.post("/", isAdmin, addInventory);

// Shop inventory
router.get("/shop", getShopInventory);
router.patch("/shop/:inventoryId/retail", patchShopInventoryRetail);

// Inventory stats (per-medicine overview)
router.get("/stats", isAdmin, getInventoryStats);

// Medicine master CRUD
router.get("/medicines", getMedicines);
router.post("/medicines", isAdmin, addMedicine);
router.patch("/medicines/:id", isAdmin, updateMedicine);
router.delete("/medicines/:id", isAdmin, deleteMedicine);

export default router;
