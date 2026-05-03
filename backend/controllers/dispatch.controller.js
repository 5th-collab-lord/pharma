import Dispatch from "../models/Dispatch.js";
import DispatchItem from "../models/DispatchItem.js";
import DispatchLog from "../models/DispatchLog.js";
import Batch from "../models/Batch.js";
import ShopInventory from "../models/ShopInventory.js";
import TransactionLog from "../models/TransactionLog.js";
import { io } from "../server.js";
import mongoose from "mongoose";
import { syncMedicineOrderedQuantity } from "./inventory.controller.js";

export const createDispatch = async (req, res) => {
  try {
    const { shopId, notes, lines } = req.body;

    if (!shopId) throw new Error("Destination shop is required");
    if (!lines || lines.length === 0)
      throw new Error("At least one item line is required");

    const itemsToCreate = [];
    const batchIds = lines.map((line) => line.batchId).filter(Boolean);

    // Reserved quantity = all quantities in pending dispatches (created/in_transit) by batch.
    const reservedAgg =
      batchIds.length > 0
        ? await DispatchItem.aggregate([
            {
              $match: {
                batchId: {
                  $in: batchIds.map((id) => new mongoose.Types.ObjectId(id)),
                },
              },
            },
            {
              $lookup: {
                from: "admin_dispatches",
                localField: "dispatchId",
                foreignField: "_id",
                as: "dispatch",
              },
            },
            { $unwind: "$dispatch" },
            { $match: { "dispatch.status": { $in: ["created", "in_transit"] } } },
            { $group: { _id: "$batchId", reserved: { $sum: "$quantity" } } },
          ])
        : [];
    const reservedByBatch = new Map(
      reservedAgg.map((r) => [r._id.toString(), r.reserved]),
    );

    // Validate all items first (read-only, no writes yet)
    for (const line of lines) {
      if (!line.batchId) throw new Error("Batch ID is required for all lines");
      const batch = await Batch.findById(line.batchId);
      if (!batch) throw new Error(`Batch not found: ${line.batchId}`);
      if (line.quantity <= 0)
        throw new Error("Quantity must be greater than 0");
      const reserved = reservedByBatch.get(line.batchId.toString()) || 0;
      const available = batch.stock - reserved;
      if (line.quantity > available) {
        throw new Error(
          `Only ${available} units available in batch ${batch.batchNumber} (after pending dispatch reservations)`,
        );
      }
      const mandate =
        line.mandatedSellingPrice != null && line.mandatedSellingPrice !== ""
          ? Number(line.mandatedSellingPrice)
          : Number(batch.price);
      if (Number.isNaN(mandate) || mandate < 0) {
        throw new Error(`Invalid mandated selling price for batch ${batch.batchNumber}`);
      }

      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      const isExpiringSoon = new Date(batch.expiryDate) <= thirtyDaysFromNow;

      itemsToCreate.push({
        batchId: line.batchId,
        medicineId: batch.medicineId,
        quantity: line.quantity,
        batchNumber: batch.batchNumber,
        mandatedSellingPrice: mandate,
        isExpiringSoon,
      });
    }

    // Create Dispatch record
    const newDispatch = new Dispatch({
      shopId,
      notes,
      status: "created",
      createdBy: req.user.id,
    });
    await newDispatch.save();

    // Create Dispatch Items
    for (const item of itemsToCreate) {
      await new DispatchItem({
        dispatchId: newDispatch._id,
        batchId: item.batchId,
        medicineId: item.medicineId,
        quantity: item.quantity,
        mandatedSellingPrice: item.mandatedSellingPrice,
      }).save();

      if (item.isExpiringSoon) {
        // Log an alert for dispatching expiring medicine
        await TransactionLog.create({
          type: "expiring_dispatch_alert",
          referenceId: newDispatch._id,
          referenceModel: "Dispatch",
          shopId,
          performedBy: req.user.id,
          performedByModel: "Admin",
          description: `Expiring batch ${item.batchNumber} included in dispatch`,
          metadata: {
            batchNumber: item.batchNumber,
            medicineId: item.medicineId,
            expiryDate: (await Batch.findById(item.batchId)).expiryDate,
          },
          status: "success",
        });
      }
    }

    // Logs (best-effort, non-critical)
    await DispatchLog.create({
      dispatchId: newDispatch._id,
      action: "created",
      performedBy: req.user.id,
      performedByModel: "Admin",
      notes: notes || "Dispatch created",
    });

    await TransactionLog.create({
      type: "dispatch_create",
      referenceId: newDispatch._id,
      referenceModel: "Dispatch",
      shopId,
      performedBy: req.user.id,
      performedByModel: "Admin",
      description: `Dispatch created with ${itemsToCreate.length} items`,
      status: "success",
    });

    // Emit real-time update
    io.to(`shop-${shopId}`).emit("dispatchUpdate", {
      type: "created",
      dispatch: newDispatch,
    });
    io.to("admin").emit("dispatchUpdate", {
      type: "created",
      dispatch: newDispatch,
    });
    io.to("admin").emit("warehouseUpdated", { type: "dispatch_created" });

    res.status(201).json({
      message:
        "Dispatch created successfully. Warehouse stock will be deducted when shop confirms.",
      dispatch: newDispatch,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getAdminDispatches = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const status = req.query.status;

    const query = {};
    if (status) query.status = status;

    const [dispatches, total] = await Promise.all([
      Dispatch.find(query)
        .populate("shopId", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Dispatch.countDocuments(query),
    ]);

    const filteredDispatches = [];
    for (const d of dispatches) {
      const items = await DispatchItem.find({ dispatchId: d._id })
        .populate("medicineId", "name category sku")
        .populate("batchId", "batchNumber expiryDate");
      const validItems = items.filter((it) => it.medicineId && it.batchId);
      if (validItems.length === 0) continue;
      d.items = validItems;
      d.totalQuantity = validItems.reduce((acc, curr) => acc + curr.quantity, 0);
      filteredDispatches.push(d);
    }

    res.status(200).json({
      dispatches: filteredDispatches,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getShopDispatches = async (req, res) => {
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

    const dispatches = await Dispatch.find({
      shopId: userShopId,
      status: { $in: ["created", "in_transit"] },
    })
      .populate("createdBy", "name")
      .sort({ createdAt: -1 })
      .lean();

    for (const d of dispatches) {
      const items = await DispatchItem.find({ dispatchId: d._id })
        .populate("medicineId", "name category")
        .populate("batchId", "batchNumber expiryDate");
      d.items = items;
      d.totalQuantity = items.reduce((acc, curr) => acc + curr.quantity, 0);
    }

    res.status(200).json(dispatches);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const acceptDispatch = async (req, res) => {
  // Track what we've already deducted so we can compensate on failure
  const deductedBatches = []; // [{ batchId, quantity }]
  const upsertedInventory = []; // [{ shopId, batchId, quantity }]

  try {
    const { id } = req.params;
    const dispatch = await Dispatch.findById(id);

    if (!dispatch) throw new Error("Dispatch not found");
    if (dispatch.status !== "in_transit" && dispatch.status !== "created") {
      throw new Error("Only dispatches in transit or created can be confirmed");
    }

    const userShopId =
      typeof req.user.shopId === "object"
        ? req.user.shopId._id
        : req.user.shopId;
    if (dispatch.shopId.toString() !== String(userShopId))
      throw new Error("Unauthorized");

    const items = await DispatchItem.find({ dispatchId: dispatch._id });

    // Step 1: Validate all warehouse stock BEFORE making any changes
    for (const item of items) {
      const batch = await Batch.findById(item.batchId);
      if (!batch) throw new Error(`Batch not found: ${item.batchId}`);
      if (batch.stock < item.quantity) {
        throw new Error(
          `Insufficient warehouse stock for batch ${batch.batchNumber}. Available: ${batch.stock}, Required: ${item.quantity}`,
        );
      }
    }

    // Step 2: Deduct warehouse stock one by one; compensate on failure
    for (const item of items) {
      const updatedBatch = await Batch.findOneAndUpdate(
        { _id: item.batchId, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } },
        { new: true },
      );

      if (!updatedBatch) {
        // Compensate: restore everything already deducted
        for (const done of deductedBatches) {
          await Batch.findByIdAndUpdate(done.batchId, {
            $inc: { stock: done.quantity },
          });
        }
        throw new Error(
          `Failed to deduct warehouse stock — possible race condition. No changes were committed.`,
        );
      }

      deductedBatches.push({ batchId: item.batchId, quantity: item.quantity });
    }

    // Step 3: Add stock to shop inventory (admin mandated retail + branch retail defaults)
    for (const item of items) {
      const batch = await Batch.findById(item.batchId).select("price").lean();
      const mandate =
        item.mandatedSellingPrice != null && !Number.isNaN(Number(item.mandatedSellingPrice))
          ? Number(item.mandatedSellingPrice)
          : Number(batch?.price ?? 0);

      await ShopInventory.findOneAndUpdate(
        { shopId: dispatch.shopId, batchId: item.batchId },
        {
          $inc: { stock: item.quantity },
          $set: { authorisedRetailPrice: mandate },
          $setOnInsert: {
            shopId: dispatch.shopId,
            medicineId: item.medicineId,
            batchId: item.batchId,
            retailPrice: mandate,
          },
        },
        { new: true, upsert: true },
      );
      upsertedInventory.push({
        shopId: dispatch.shopId,
        batchId: item.batchId,
        quantity: item.quantity,
      });
    }

    // Step 4: Mark dispatch confirmed
    dispatch.status = "confirmed";
    dispatch.confirmedAt = new Date();
    await dispatch.save();

    const medicineIds = [...new Set(items.map((i) => String(i.medicineId)))];
    await Promise.all(
      medicineIds.map((id) => syncMedicineOrderedQuantity(id)),
    );

    // Logs (best-effort)
    await DispatchLog.create({
      dispatchId: dispatch._id,
      action: "confirmed",
      performedBy: req.user.id,
      performedByModel: "ShopUser",
      notes: "Dispatch confirmed by shop",
      metadata: { itemsCount: items.length },
    });

    await TransactionLog.create({
      type: "dispatch_confirm",
      referenceId: dispatch._id,
      referenceModel: "Dispatch",
      shopId: dispatch.shopId,
      performedBy: req.user.id,
      performedByModel: "ShopUser",
      description: `Dispatch confirmed - ${items.length} items added to shop inventory`,
      status: "success",
    });

    // Emit real-time update
    io.to(`shop-${dispatch.shopId}`).emit("dispatchUpdate", {
      type: "confirmed",
      dispatchId: dispatch._id,
    });
    io.to("admin").emit("dispatchUpdate", {
      type: "confirmed",
      dispatchId: dispatch._id,
    });
    io.to(`shop-${dispatch.shopId}`).emit("inventoryUpdated");
    io.to("admin").emit("warehouseUpdated", { type: "dispatch_confirmed" });

    res.status(200).json({
      message:
        "Dispatch confirmed successfully. Stock deducted from warehouse and added to shop inventory.",
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const rejectDispatch = async (req, res) => {
  try {
    const { id } = req.params;
    const dispatch = await Dispatch.findById(id);

    if (!dispatch) throw new Error("Dispatch not found");
    if (!["created", "in_transit"].includes(dispatch.status)) {
      throw new Error(
        "Only dispatches in created or in_transit status can be rejected",
      );
    }

    const userShopId =
      typeof req.user.shopId === "object"
        ? req.user.shopId._id
        : req.user.shopId;
    if (dispatch.shopId.toString() !== String(userShopId))
      throw new Error("Unauthorized");

    dispatch.status = "rejected";
    dispatch.rejectedAt = new Date();
    await dispatch.save();

    // Logs (best-effort)
    await DispatchLog.create({
      dispatchId: dispatch._id,
      action: "rejected",
      performedBy: req.user.id,
      performedByModel: "ShopUser",
      notes: "Dispatch rejected by shop",
    });

    await TransactionLog.create({
      type: "dispatch_reject",
      referenceId: dispatch._id,
      referenceModel: "Dispatch",
      shopId: dispatch.shopId,
      performedBy: req.user.id,
      performedByModel: "ShopUser",
      description: "Dispatch rejected by shop",
      status: "success",
    });

    // Emit real-time update
    io.to(`shop-${dispatch.shopId}`).emit("dispatchUpdate", {
      type: "rejected",
      dispatchId: dispatch._id,
    });
    io.to("admin").emit("dispatchUpdate", {
      type: "rejected",
      dispatchId: dispatch._id,
    });
    io.to("admin").emit("warehouseUpdated", { type: "dispatch_rejected" });

    res.status(200).json({
      message: "Dispatch rejected. Warehouse stock was not affected.",
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Stock summary: warehouse remaining vs total dispatched (confirmed) per medicine
export const getDispatchStockSummary = async (req, res) => {
  try {
    const batches = await Batch.find()
      .populate("medicineId", "name category sku")
      .lean();

    const confirmedDispatches = await Dispatch.find({ status: "confirmed" })
      .select("_id")
      .lean();
    const confirmedIds = confirmedDispatches.map((d) => d._id);

    const confirmedItems =
      confirmedIds.length > 0
        ? await DispatchItem.find({ dispatchId: { $in: confirmedIds } })
            .populate("medicineId", "name category sku")
            .lean()
        : [];

    const pendingDispatches = await Dispatch.find({
      status: { $in: ["created", "in_transit"] },
    })
      .select("_id")
      .lean();
    const pendingIds = pendingDispatches.map((d) => d._id);

    const pendingItems =
      pendingIds.length > 0
        ? await DispatchItem.find({ dispatchId: { $in: pendingIds } })
            .populate("medicineId", "name category sku")
            .lean()
        : [];

    const medicineMap = new Map();

    for (const b of batches) {
      if (!b.medicineId) continue;
      const id = b.medicineId._id.toString();
      if (!medicineMap.has(id)) {
        medicineMap.set(id, {
          medicineId: id,
          name: b.medicineId.name,
          category: b.medicineId.category,
          sku: b.medicineId.sku,
          warehouseStock: 0,
          dispatchedStock: 0,
          pendingStock: 0,
        });
      }
      medicineMap.get(id).warehouseStock += b.stock;
    }

    for (const item of confirmedItems) {
      if (!item.medicineId) continue;
      const id = item.medicineId._id.toString();
      if (!medicineMap.has(id)) {
        medicineMap.set(id, {
          medicineId: id,
          name: item.medicineId.name,
          category: item.medicineId.category,
          sku: item.medicineId.sku,
          warehouseStock: 0,
          dispatchedStock: 0,
          pendingStock: 0,
        });
      }
      medicineMap.get(id).dispatchedStock += item.quantity;
    }

    for (const item of pendingItems) {
      if (!item.medicineId) continue;
      const id = item.medicineId._id.toString();
      if (!medicineMap.has(id)) {
        medicineMap.set(id, {
          medicineId: id,
          name: item.medicineId.name,
          category: item.medicineId.category,
          sku: item.medicineId.sku,
          warehouseStock: 0,
          dispatchedStock: 0,
          pendingStock: 0,
        });
      }
      medicineMap.get(id).pendingStock += item.quantity;
    }

    const summary = Array.from(medicineMap.values()).map((m) => {
      const availableWarehouseStock = Math.max(
        m.warehouseStock - m.pendingStock,
        0,
      );
      return {
        ...m,
        availableWarehouseStock,
        totalStock:
          availableWarehouseStock + m.pendingStock + m.dispatchedStock,
      };
    });

    summary.sort((a, b) => b.dispatchedStock - a.dispatchedStock);

    res.status(200).json(summary);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mark dispatch as in_transit (admin only)
export const markInTransit = async (req, res) => {
  try {
    const { id } = req.params;
    const dispatch = await Dispatch.findById(id);

    if (!dispatch) throw new Error("Dispatch not found");
    if (dispatch.status !== "created") {
      throw new Error(
        "Only dispatches in created status can be marked as in transit",
      );
    }

    dispatch.status = "in_transit";
    await dispatch.save();

    // Log (best-effort)
    await DispatchLog.create({
      dispatchId: dispatch._id,
      action: "in_transit",
      performedBy: req.user.id,
      performedByModel: "Admin",
      notes: "Dispatch marked as in transit",
    });

    // Emit real-time update
    io.to(`shop-${dispatch.shopId}`).emit("dispatchUpdate", {
      type: "in_transit",
      dispatchId: dispatch._id,
    });
    io.to("admin").emit("dispatchUpdate", {
      type: "in_transit",
      dispatchId: dispatch._id,
    });

    res.status(200).json({ message: "Dispatch marked as in transit" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
