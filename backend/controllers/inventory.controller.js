import mongoose from "mongoose";
import Medicine from "../models/Medicine.js";
import Batch from "../models/Batch.js";
import ShopInventory from "../models/ShopInventory.js";
import Dispatch from "../models/Dispatch.js";
import DispatchItem from "../models/DispatchItem.js";
import DispatchLog from "../models/DispatchLog.js";
import Sale from "../models/Sale.js";
import { io } from "../server.js";

/** Total units received into the system for this medicine: current warehouse + confirmed dispatch (pending is still in warehouse). */
export async function syncMedicineOrderedQuantity(medicineId) {
  const mid = new mongoose.Types.ObjectId(String(medicineId));
  const [whAgg, confAgg] = await Promise.all([
    Batch.aggregate([
      { $match: { medicineId: mid } },
      { $group: { _id: null, total: { $sum: "$stock" } } },
    ]),
    DispatchItem.aggregate([
      { $match: { medicineId: mid } },
      {
        $lookup: {
          from: "admin_dispatches",
          localField: "dispatchId",
          foreignField: "_id",
          as: "d",
        },
      },
      { $unwind: "$d" },
      { $match: { "d.status": "confirmed" } },
      { $group: { _id: null, total: { $sum: "$quantity" } } },
    ]),
  ]);
  const wh = whAgg[0]?.total || 0;
  const confirmed = confAgg[0]?.total || 0;
  await Medicine.findByIdAndUpdate(mid, { orderedQuantity: wh + confirmed });
}

export const getInventory = async (req, res) => {
  try {
    const batches = await Batch.find()
      .populate("medicineId")
      .sort({ expiryDate: 1 });

    // Map to match the frontend expected structure
    const formattedBatches = batches.map((b) => ({
      id: b._id,
      batch_number: b.batchNumber,
      stock: b.stock,
      expiry_date: b.expiryDate.toISOString().split("T")[0],
      unit_price: b.price,
      medicines: {
        name: b.medicineId.name,
        category: b.medicineId.category,
        sku: b.medicineId.sku,
      },
    }));

    res.status(200).json(formattedBatches);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const addInventory = async (req, res) => {
  try {
    const { medicineName, category, batchNumber, stock, expiryDate, price } =
      req.body;

    // Validate inputs
    if (
      !medicineName ||
      !batchNumber ||
      stock === undefined ||
      !expiryDate ||
      price === undefined
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Find or create Medicine
    let medicine = await Medicine.findOne({
      name: { $regex: new RegExp(`^${medicineName}$`, "i") },
    });
    if (!medicine) {
      medicine = new Medicine({ name: medicineName, category });
      await medicine.save();
    }

    // Use provided price, or fall back to medicine's basePrice
    const batchPrice =
      price !== undefined && price !== "" && Number(price) > 0
        ? Number(price)
        : medicine.basePrice || 0;

    // If a price was explicitly provided and differs from basePrice, update basePrice too
    if (
      price !== undefined &&
      Number(price) > 0 &&
      Number(price) !== medicine.basePrice
    ) {
      medicine.basePrice = Number(price);
      await medicine.save();
    }

    // Create new Batch
    const newBatch = new Batch({
      medicineId: medicine._id,
      batchNumber,
      stock: Number(stock),
      expiryDate: new Date(expiryDate),
      price: batchPrice,
    });

    await newBatch.save();

    await syncMedicineOrderedQuantity(medicine._id);

    // Notify all admin clients that warehouse inventory changed
    io.to("admin").emit("warehouseUpdated", {
      type: "batch_added",
      medicineId: medicine._id,
      stock: Number(stock),
    });

    res
      .status(201)
      .json({ message: "Inventory added successfully", batch: newBatch });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getShopInventory = async (req, res) => {
  try {
    if (!req.user.shopId) {
      return res
        .status(400)
        .json({ message: "User is not associated with a shop" });
    }

    const userShopId =
      typeof req.user.shopId === "object"
        ? req.user.shopId._id
        : req.user.shopId;

    const inventory = await ShopInventory.find({ shopId: userShopId })
      .populate("medicineId")
      .populate("batchId")
      .sort({ createdAt: -1 });

    const formattedInventory = inventory.map((inv) => {
      const batchPrice =
        inv.batchId && typeof inv.batchId.price === "number"
          ? inv.batchId.price
          : Number(inv.batchId?.price ?? 0);
      const retailPrice =
        inv.retailPrice != null ? Number(inv.retailPrice) : batchPrice;
      const authorisedRetailPrice =
        inv.authorisedRetailPrice != null
          ? Number(inv.authorisedRetailPrice)
          : batchPrice;

      return {
        id: inv._id,
        stock: inv.stock,
        retailPrice,
        authorisedRetailPrice,
        batchId: inv.batchId
          ? {
              _id: inv.batchId._id,
              batchNumber: inv.batchId.batchNumber,
              expiryDate: inv.batchId.expiryDate,
              price: inv.batchId.price,
            }
          : null,
        medicineId: inv.medicineId
          ? {
              _id: inv.medicineId._id,
              name: inv.medicineId.name,
              category: inv.medicineId.category,
              sku: inv.medicineId.sku,
            }
          : null,
        batches: inv.batchId
          ? {
              batch_number: inv.batchId.batchNumber,
              expiry_date:
                inv.batchId.expiryDate instanceof Date
                  ? inv.batchId.expiryDate.toISOString().split("T")[0]
                  : inv.batchId.expiryDate
                    ? new Date(inv.batchId.expiryDate).toISOString().split("T")[0]
                    : "N/A",
              unit_price: retailPrice,
            }
          : null,
        medicines: inv.medicineId
          ? {
              name: inv.medicineId.name,
              category: inv.medicineId.category,
              sku: inv.medicineId.sku,
            }
          : null,
      };
    });

    res.status(200).json(formattedInventory);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET all medicines (master list)
export const getMedicines = async (req, res) => {
  try {
    const medicines = await Medicine.find().sort({ name: 1 }).lean();
    await Promise.all(
      medicines.map((m) => syncMedicineOrderedQuantity(m._id)),
    );
    const updated = await Medicine.find().sort({ name: 1 }).lean();
    res.status(200).json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST create a medicine (master)
export const addMedicine = async (req, res) => {
  try {
    const { name, category, sku, basePrice, requiredStock } = req.body;
    if (!name)
      return res.status(400).json({ message: "Medicine name is required" });

    const existing = await Medicine.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
    });
    if (existing)
      return res
        .status(400)
        .json({ message: "Medicine with this name already exists" });

    const medicine = new Medicine({
      name,
      category,
      sku,
      basePrice: basePrice !== undefined ? Number(basePrice) : 0,
      requiredStock: requiredStock !== undefined ? Number(requiredStock) : 0,
    });
    await medicine.save();
    io.to("admin").emit("medicinesUpdated", { type: "medicine_added" });
    res.status(201).json({ message: "Medicine added successfully", medicine });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH update a medicine (name, category, basePrice)
export const updateMedicine = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, basePrice, requiredStock } = req.body;

    const medicine = await Medicine.findById(id);
    if (!medicine)
      return res.status(404).json({ message: "Medicine not found" });

    // Check name uniqueness if name is being changed
    if (name && name.trim().toLowerCase() !== medicine.name.toLowerCase()) {
      const duplicate = await Medicine.findOne({
        name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
        _id: { $ne: id },
      });
      if (duplicate)
        return res
          .status(400)
          .json({ message: "Another medicine with this name already exists" });
      medicine.name = name.trim();
    }

    if (category !== undefined) medicine.category = category;
    if (requiredStock !== undefined)
      medicine.requiredStock = Number(requiredStock);
    if (basePrice !== undefined) {
      medicine.basePrice = Number(basePrice);
      // Update all existing warehouse batches for this medicine
      await Batch.updateMany({ medicineId: id }, { price: Number(basePrice) });
      // Update all branch mandated prices for this medicine globally
      await ShopInventory.updateMany({ medicineId: id }, { authorisedRetailPrice: Number(basePrice) });
    }

    await medicine.save();
    io.to("admin").emit("medicinesUpdated", {
      type: "medicine_updated",
      medicineId: id,
    });
    io.to("admin").emit("warehouseUpdated", {
      type: "price_changed",
      medicineId: id,
    });
    res
      .status(200)
      .json({ message: "Medicine updated successfully", medicine });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE a medicine (and its batches)
export const deleteMedicine = async (req, res) => {
  try {
    const { id } = req.params;
    const batches = await Batch.find({ medicineId: id }).select("_id").lean();
    const batchIds = batches.map((b) => b._id);

    // Remove dispatch lines related to this medicine/batches.
    const deletedDispatchItems = await DispatchItem.find({
      $or: [{ medicineId: id }, { batchId: { $in: batchIds } }],
    })
      .select("dispatchId")
      .lean();
    const affectedDispatchIds = [
      ...new Set(deletedDispatchItems.map((i) => i.dispatchId.toString())),
    ];
    await DispatchItem.deleteMany({
      $or: [{ medicineId: id }, { batchId: { $in: batchIds } }],
    });

    // Delete dispatches that no longer have any items.
    if (affectedDispatchIds.length > 0) {
      const emptyDispatchIds = [];
      for (const dispatchId of affectedDispatchIds) {
        const remaining = await DispatchItem.countDocuments({ dispatchId });
        if (remaining === 0) emptyDispatchIds.push(dispatchId);
      }
      if (emptyDispatchIds.length > 0) {
        await Dispatch.deleteMany({ _id: { $in: emptyDispatchIds } });
        await DispatchLog.deleteMany({ dispatchId: { $in: emptyDispatchIds } });
      }
    }

    // Remove warehouse and shop stocks tied to this medicine.
    await ShopInventory.deleteMany({
      $or: [{ medicineId: id }, { batchId: { $in: batchIds } }],
    });

    // Also remove sales records that include this medicine or its batches
    // (This ensures that if "all data is deleted", sales stats also reset)
    await Sale.deleteMany({
      $or: [
        { "items.medicineId": id },
        { "items.batchId": { $in: batchIds } },
      ],
    });

    await Batch.deleteMany({ medicineId: id });
    await Medicine.findByIdAndDelete(id);

    io.to("admin").emit("medicinesUpdated", {
      type: "medicine_deleted",
      medicineId: id,
    });
    io.to("admin").emit("warehouseUpdated", {
      type: "batch_deleted",
      medicineId: id,
    });
    io.to("admin").emit("dispatchUpdate", {
      type: "medicine_deleted_cleanup",
      medicineId: id,
    });
    res
      .status(200)
      .json({
        message:
          "Medicine, related batches, shop stock, and dispatch lines deleted successfully",
      });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET enriched inventory — per medicine: total entered, dispatched (confirmed), pending, remaining
export const getInventoryStats = async (req, res) => {
  try {
    // Import Dispatch and DispatchItem inline to avoid circular deps
    const { default: Dispatch } = await import("../models/Dispatch.js");
    const { default: DispatchItem } = await import("../models/DispatchItem.js");

    // All medicines
    const medicines = await Medicine.find().lean();

    // All batches grouped by medicine
    const batches = await Batch.find().lean();

    // Confirmed dispatches
    const confirmedDispatches = await Dispatch.find({ status: "confirmed" })
      .select("_id")
      .lean();
    const confirmedIds = confirmedDispatches.map((d) => d._id);
    const confirmedItems =
      confirmedIds.length > 0
        ? await DispatchItem.find({ dispatchId: { $in: confirmedIds } }).lean()
        : [];

    // Pending dispatches (created / in_transit)
    const pendingDispatches = await Dispatch.find({
      status: { $in: ["created", "in_transit"] },
    })
      .select("_id")
      .lean();
    const pendingIds = pendingDispatches.map((d) => d._id);
    const pendingItems =
      pendingIds.length > 0
        ? await DispatchItem.find({ dispatchId: { $in: pendingIds } }).lean()
        : [];

    // Build maps: batchId -> medicineId
    const batchMedicineMap = new Map();
    for (const b of batches) {
      batchMedicineMap.set(b._id.toString(), b.medicineId.toString());
    }

    // Per-medicine: dispatched confirmed
    const dispatchedMap = new Map(); // medicineId -> qty
    for (const item of confirmedItems) {
      const medId = batchMedicineMap.get(item.batchId.toString());
      if (!medId) continue;
      dispatchedMap.set(medId, (dispatchedMap.get(medId) || 0) + item.quantity);
    }

    // Per-medicine: pending
    const pendingMap = new Map();
    for (const item of pendingItems) {
      const medId = batchMedicineMap.get(item.batchId.toString());
      if (!medId) continue;
      pendingMap.set(medId, (pendingMap.get(medId) || 0) + item.quantity);
    }

    // Per-medicine: current warehouse stock (sum of all batches)
    const warehouseMap = new Map();
    for (const b of batches) {
      const medId = b.medicineId.toString();
      warehouseMap.set(medId, (warehouseMap.get(medId) || 0) + b.stock);
    }

    // Build result
    const result = medicines.map((m) => {
      const id = m._id.toString();
      const warehouseStock = warehouseMap.get(id) || 0;
      const dispatched = dispatchedMap.get(id) || 0;
      const pending = pendingMap.get(id) || 0;
      // Pending dispatch is still part of current warehouse stock until confirmation.
      const totalEntered = warehouseStock + dispatched;
      const basePrice = m.basePrice || 0;
      const requiredStock = m.requiredStock || 0;

      // stockStatus: how current warehouse stock compares to required
      let stockStatus = "no-requirement";
      if (requiredStock > 0) {
        const pct = warehouseStock / requiredStock;
        if (warehouseStock === 0) stockStatus = "out";
        else if (pct < 0.25)
          stockStatus = "critical"; // < 25% of required
        else if (pct < 0.5)
          stockStatus = "low"; // < 50% of required
        else if (warehouseStock >= requiredStock) stockStatus = "sufficient";
        else stockStatus = "moderate"; // 50-99%
      }

      return {
        _id: m._id,
        name: m.name,
        category: m.category,
        sku: m.sku,
        basePrice,
        requiredStock,
        requiredStockValue: requiredStock * basePrice,
        stockStatus,
        totalEntered,
        warehouseStock,
        dispatched,
        pending,
        dispatchValue: (dispatched + pending) * basePrice,
        warehouseValue: warehouseStock * basePrice,
      };
    });

    // Sort by name
    result.sort((a, b) => a.name.localeCompare(b.name));

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Shop user updates branch retail (shelf) price for a stock row they own */
export const patchShopInventoryRetail = async (req, res) => {
  try {
    if (!req.user.shopId) {
      return res
        .status(400)
        .json({ message: "User is not associated with a shop" });
    }
    const userShopId =
      typeof req.user.shopId === "object"
        ? req.user.shopId._id || req.user.shopId
        : req.user.shopId;
    const roomId = String(userShopId);

    const { inventoryId } = req.params;
    const { retailPrice } = req.body;
    const price = Number(retailPrice);
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ message: "Valid retail price is required" });
    }

    const updated = await ShopInventory.findOneAndUpdate(
      { _id: inventoryId, shopId: userShopId },
      { $set: { retailPrice: price } },
      { new: true },
    ).populate(["medicineId", "batchId"]);

    if (!updated) {
      return res.status(404).json({ message: "Inventory row not found" });
    }

    io.to(`shop-${roomId}`).emit("inventoryUpdated");
    io.to("admin").emit("warehouseUpdated", { type: "shop_retail_updated" });

    res.status(200).json({
      message: "Retail price updated",
      id: updated._id,
      retailPrice: price,
      medicineId: updated.medicineId?._id,
      batchId: updated.batchId?._id,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
