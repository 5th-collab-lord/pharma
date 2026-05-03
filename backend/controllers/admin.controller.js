import Shop from "../models/Shop.js";
import ShopUser from "../models/ShopUser.js";
import Batch from "../models/Batch.js";
import ShopInventory from "../models/ShopInventory.js";
import TransactionLog from "../models/TransactionLog.js";
import Sale from "../models/Sale.js";
import { io } from "../server.js";

export const getDashboardStats = async (req, res) => {
  try {
    const batches = await Batch.find();

    // Total stock
    const stock = batches.reduce((acc, curr) => acc + curr.stock, 0);

    // Active shops
    const shops = await Shop.countDocuments({ isActive: true, isOnline: true });

    // Pending Dispatches (Placeholder for now)
    const dispatches = 0;

    // Open Alerts (low stock < 50 or expiry < 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    let alerts = 0;
    batches.forEach((b) => {
      if (b.stock < 50) alerts++;
      if (b.expiryDate <= thirtyDaysFromNow) alerts++;
    });

    res.status(200).json({ stock, shops, dispatches, alerts });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getShops = async (req, res) => {
  try {
    // Return all shops, populated with user info
    const shops = await Shop.find().populate("ownerId", "name email");
    res.status(200).json(shops);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const approveShop = async (req, res) => {
  try {
    const { id } = req.params;
    const shop = await Shop.findByIdAndUpdate(
      id,
      { isActive: true },
      { new: true },
    );
    if (!shop) return res.status(404).json({ message: "Shop not found" });

    io.to("admin").emit("shopStatusChanged", { type: "approved", shopId: id });
    res.status(200).json({ message: "Shop approved successfully", shop });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const rejectShop = async (req, res) => {
  try {
    const { id } = req.params;
    const shop = await Shop.findById(id);
    if (!shop) return res.status(404).json({ message: "Shop not found" });

    // Delete the owner user
    await ShopUser.findByIdAndDelete(shop.ownerId);

    // Delete shop's local inventory
    await ShopInventory.deleteMany({ shopId: id });

    // Delete shop's sales
    await Sale.deleteMany({ shopId: id });

    // Delete the shop
    await Shop.findByIdAndDelete(id);

    io.to("admin").emit("shopStatusChanged", { type: "rejected", shopId: id });
    res.status(200).json({ message: "Shop rejected and deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const removeShop = async (req, res) => {
  try {
    const { id } = req.params;
    const shop = await Shop.findById(id);
    if (!shop) return res.status(404).json({ message: "Shop not found" });

    await ShopUser.findByIdAndDelete(shop.ownerId);
    await ShopInventory.deleteMany({ shopId: id });
    await Sale.deleteMany({ shopId: id });
    await Shop.findByIdAndDelete(id);

    io.to("admin").emit("shopStatusChanged", { type: "removed", shopId: id });
    res.status(200).json({ message: "Shop removed successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAlerts = async (req, res) => {
  try {
    const alerts = [];

    // 1. Shop Low Stock Alerts
    const lowStockShops = await ShopInventory.find({ stock: { $lt: 10 } })
      .populate("shopId", "name")
      .populate("medicineId", "name")
      .lean();

    lowStockShops.forEach((item) => {
      // Only alert for active shops
      if (item.shopId) {
        alerts.push({
          id: `shop-low-${item._id}`,
          type: "SHOP_LOW_STOCK",
          shopName: item.shopId.name,
          shopId: item.shopId._id,
          medicineName: item.medicineId?.name || "Unknown",
          currentStock: item.stock,
          severity: item.stock === 0 ? "critical" : "high",
          timestamp: new Date(),
        });
      }
    });

    // 2. Warehouse Low Stock & Expiry Alerts
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const warehouseIssues = await Batch.find({
      $or: [
        { stock: { $lt: 50 } },
        { expiryDate: { $lte: thirtyDaysFromNow } },
      ],
    })
      .populate("medicineId", "name")
      .lean();

    warehouseIssues.forEach((batch) => {
      if (batch.stock < 50) {
        alerts.push({
          id: `wh-low-${batch._id}`,
          type: "WAREHOUSE_LOW_STOCK",
          medicineName: batch.medicineId?.name || "Unknown",
          batchNumber: batch.batchNumber,
          currentStock: batch.stock,
          severity: batch.stock < 20 ? "critical" : "medium",
          timestamp: new Date(),
        });
      }
      if (new Date(batch.expiryDate) <= thirtyDaysFromNow) {
        alerts.push({
          id: `wh-exp-${batch._id}`,
          type: "WAREHOUSE_EXPIRING",
          medicineName: batch.medicineId?.name || "Unknown",
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          severity:
            new Date(batch.expiryDate) < new Date() ? "critical" : "medium",
          timestamp: new Date(),
        });
      }
    });

    // 3. Selling Price Deviation Alerts
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const sellingAlerts = await TransactionLog.find({
      type: "selling_price_alert",
      createdAt: { $gte: thirtyDaysAgo },
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("shopId", "name")
      .lean();

    sellingAlerts.forEach((log) => {
      const delta = Number(log.metadata?.delta ?? 0);
      alerts.push({
        id: `spd-${log._id}`,
        type: "SELLING_PRICE_DEVIATION",
        shopName: log.shopId?.name || "Branch",
        shopId: log.shopId?._id,
        receiptNo: log.metadata?.receiptNo,
        medicineName: log.metadata?.medicineName ?? "Medicine",
        batchNumber: log.metadata?.batchNumber,
        mandatedRetailPrice: Number(log.metadata?.mandatedRetailPrice ?? 0),
        soldUnitPrice: Number(log.metadata?.soldUnitPrice ?? 0),
        delta,
        severity: Math.abs(delta) > 5 ? "high" : "medium",
        timestamp: log.createdAt,
      });
    });

    // 4. Expiring Dispatch Alerts (Auto alert for dispatching near-expiry items)
    const expiringDispatchAlerts = await TransactionLog.find({
      type: "expiring_dispatch_alert",
      createdAt: { $gte: thirtyDaysAgo },
    })
      .sort({ createdAt: -1 })
      .populate("shopId", "name")
      .populate("metadata.medicineId", "name")
      .lean();

    expiringDispatchAlerts.forEach((log) => {
      alerts.push({
        id: `eda-${log._id}`,
        type: "EXPIRING_DISPATCH",
        shopName: log.shopId?.name || "Branch",
        shopId: log.shopId?._id,
        medicineName: log.metadata?.medicineId?.name || "Medicine",
        batchNumber: log.metadata?.batchNumber,
        expiryDate: log.metadata?.expiryDate,
        severity: "high",
        timestamp: log.createdAt,
        description: "Dispatched without proper checking of expiry",
      });
    });

    const severityOrder = { critical: 1, high: 2, medium: 3 };
    alerts.sort((a, b) => {
      const sa = severityOrder[a.severity] ?? 99;
      const sb = severityOrder[b.severity] ?? 99;
      if (sa !== sb) return sa - sb;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    res.status(200).json(alerts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
