import Sale from "../models/Sale.js";
import ShopInventory from "../models/ShopInventory.js";
import Batch from "../models/Batch.js";
import TransactionLog from "../models/TransactionLog.js";
import { io } from "../server.js";

// Generate unique receipt number
const generateReceiptNo = () => {
  const date = new Date();
  const prefix = "KK" + date.getFullYear().toString().slice(2);
  const random = Math.floor(100000 + Math.random() * 900000);
  const timestamp = Date.now().toString().slice(-4);
  return `${prefix}-${random}-${timestamp}`;
};

// Checkout - Process sale (no MongoDB transactions needed — standalone-safe)
export const checkout = async (req, res) => {
  const {
    customerName,
    customerPhone,
    paymentMethod,
    items,
    subtotal,
    tax,
    total,
    discount = 0,
  } = req.body;
  const shopId = req.user.shopId;
  const cashierId = req.user.id;

  // Track deducted stock so we can compensate on failure
  const deductedStock = []; // [{ shopId, batchId, qty }]

  try {
    // Validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error("Cart is empty");
    }
    if (!shopId) {
      throw new Error("User is not associated with a shop");
    }

    // Validate totals match (prevent tampering)
    const calculatedSubtotal = items.reduce(
      (sum, item) => sum + item.qty * item.unit_price,
      0,
    );
    const calculatedTax = calculatedSubtotal * 0.05;
    const calculatedTotal = calculatedSubtotal + calculatedTax - discount;

    if (
      Math.abs(calculatedSubtotal - subtotal) > 0.01 ||
      Math.abs(calculatedTax - tax) > 0.01 ||
      Math.abs(calculatedTotal - total) > 0.01
    ) {
      throw new Error("Price calculation mismatch detected");
    }

    const now = new Date();

    // ── Phase 1: Validate everything BEFORE touching stock ──
    for (const item of items) {
      if (!item.batch_id || !item.medicine_id || !item.qty || item.qty <= 0) {
        throw new Error("Invalid item data");
      }

      const shopInv = await ShopInventory.findOne({
        shopId,
        batchId: item.batch_id,
      });
      if (!shopInv) {
        throw new Error(`Medicine ${item.name} not found in shop inventory`);
      }
      if (shopInv.stock < item.qty) {
        throw new Error(
          `Insufficient stock for ${item.name}. Available: ${shopInv.stock}, Requested: ${item.qty}`,
        );
      }

      const batch = await Batch.findById(item.batch_id);
      if (!batch) throw new Error(`Batch not found for ${item.name}`);

      const mandatedPrice =
        shopInv.authorisedRetailPrice != null
          ? Number(shopInv.authorisedRetailPrice)
          : Number(batch.price);

      if (new Date(batch.expiryDate) < now) {
        throw new Error(
          `Cannot sell expired medicine: ${item.name}. Expired on ${batch.expiryDate.toISOString().split("T")[0]}`,
        );
      }

      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      if (new Date(batch.expiryDate) <= thirtyDaysFromNow) {
        console.warn(
          `Selling medicine expiring soon: ${item.name} on ${batch.expiryDate.toISOString().split("T")[0]}`,
        );
      }
    }

    // ── Phase 2: Deduct stock one by one; compensate on failure ──
    const processedItems = [];

    for (const item of items) {
      const batch = await Batch.findById(item.batch_id);

      const updatedInv = await ShopInventory.findOneAndUpdate(
        { shopId, batchId: item.batch_id, stock: { $gte: item.qty } },
        { $inc: { stock: -item.qty } },
        { new: true },
      );

      if (!updatedInv) {
        // Compensate: restore all previously deducted stock
        for (const done of deductedStock) {
          await ShopInventory.findOneAndUpdate(
            { shopId: done.shopId, batchId: done.batchId },
            { $inc: { stock: done.qty } },
          );
        }
        throw new Error(
          `Failed to deduct stock for ${item.name} — possible race condition. No charges were made.`,
        );
      }

      deductedStock.push({ shopId, batchId: item.batch_id, qty: item.qty });

      processedItems.push({
        medicineId: item.medicine_id,
        batchId: item.batch_id,
        batchNumber: item.batch_number || batch.batchNumber,
        medicineName: item.name,
        quantity: item.qty,
        unitPrice: item.unit_price,
        lineTotal: item.qty * item.unit_price,
      });
    }

    // ── Phase 3: Persist the sale record ──
    const receiptNo = generateReceiptNo();
    const sale = new Sale({
      receiptNo,
      shopId,
      customerName: customerName || "",
      customerPhone: customerPhone || "",
      cashierId,
      items: processedItems,
      subtotal: calculatedSubtotal,
      taxRate: 0.05,
      taxAmount: calculatedTax,
      discountAmount: discount,
      total: calculatedTotal,
      paymentMethod: paymentMethod || "cash",
      paymentStatus: "completed",
      status: "completed",
    });

    try {
      await sale.save();
    } catch (saveErr) {
      // Sale failed to save — restore all deducted stock
      for (const done of deductedStock) {
        await ShopInventory.findOneAndUpdate(
          { shopId: done.shopId, batchId: done.batchId },
          { $inc: { stock: done.qty } },
        );
      }
      throw new Error(`Sale could not be recorded: ${saveErr.message}`);
    }

    // Log transaction (best-effort, non-critical)
    await TransactionLog.create({
      type: "sale",
      referenceId: sale._id,
      referenceModel: "Sale",
      shopId,
      performedBy: cashierId,
      performedByModel: "ShopUser",
      amount: calculatedTotal,
      description: `Sale ${receiptNo} - ${items.length} items`,
      metadata: { receiptNo, itemCount: items.length, paymentMethod },
      status: "success",
    });

    const salePayload = {
      shopId: String(shopId),
      receiptNo,
      total: calculatedTotal,
    };
    io.to("admin").emit("newSale", salePayload);
    io.to(`shop-${shopId}`).emit("newSale", salePayload);
    io.to(`shop-${shopId}`).emit("inventoryUpdated");

    res.status(201).json({
      message: "Sale completed successfully",
      receiptNo,
      sale: {
        id: sale._id,
        receiptNo: sale.receiptNo,
        total: sale.total,
        createdAt: sale.createdAt,
      },
    });
  } catch (error) {
    // Log failed attempt (best-effort)
    try {
      await TransactionLog.create({
        type: "sale",
        referenceId: null,
        referenceModel: "Sale",
        shopId: req.user.shopId,
        performedBy: req.user.id,
        performedByModel: "ShopUser",
        amount: total || 0,
        description: `Failed sale - ${error.message}`,
        status: "failed",
        errorMessage: error.message,
      });
    } catch (logErr) {
      console.error("Failed to log transaction error:", logErr);
    }

    res.status(400).json({ message: error.message });
  }
};

// Get shop sales with pagination
export const getShopSales = async (req, res) => {
  try {
    const shopId = req.user.shopId;
    if (!shopId) {
      return res
        .status(400)
        .json({ message: "User is not associated with a shop" });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = { shopId };
    if (req.query.startDate || req.query.endDate) {
      query.createdAt = {};
      if (req.query.startDate)
        query.createdAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate)
        query.createdAt.$lte = new Date(req.query.endDate);
    }

    const [sales, total] = await Promise.all([
      Sale.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Sale.countDocuments(query),
    ]);

    res.status(200).json({
      sales,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get sale by receipt number
export const getSaleByReceipt = async (req, res) => {
  try {
    const { receiptNo } = req.params;
    const shopId = req.user.shopId;

    const sale = await Sale.findOne({ receiptNo, shopId });
    if (!sale) return res.status(404).json({ message: "Sale not found" });

    res.status(200).json(sale);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all sales (admin only) with filters
export const getAllSales = async (req, res) => {
  try {
    const { shopId, startDate, endDate, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};
    if (shopId) query.shopId = shopId;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const [sales, total] = await Promise.all([
      Sale.find(query)
        .populate("shopId", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Sale.countDocuments(query),
    ]);

    const stats = await Sale.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$total" },
          totalSales: { $sum: 1 },
          averageOrderValue: { $avg: "$total" },
        },
      },
    ]);

    res.status(200).json({
      sales,
      stats: stats[0] || {
        totalRevenue: 0,
        totalSales: 0,
        averageOrderValue: 0,
      },
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Cancel/refund sale
export const cancelSale = async (req, res) => {
  const restoredStock = []; // for compensation tracking

  try {
    const { receiptNo } = req.params;
    const shopId = req.user.shopId;
    const userId = req.user.id;

    const sale = await Sale.findOne({ receiptNo, shopId });
    if (!sale) throw new Error("Sale not found");
    if (sale.status === "cancelled")
      throw new Error("Sale is already cancelled");

    // Restore stock for each item; compensate if any update fails
    for (const item of sale.items) {
      const updatedInv = await ShopInventory.findOneAndUpdate(
        { shopId, batchId: item.batchId },
        { $inc: { stock: item.quantity } },
        { new: true, upsert: true },
      );

      if (!updatedInv) {
        // Compensate: re-deduct anything already restored
        for (const done of restoredStock) {
          await ShopInventory.findOneAndUpdate(
            { shopId: done.shopId, batchId: done.batchId },
            { $inc: { stock: -done.quantity } },
          );
        }
        throw new Error(
          `Failed to restore stock for batch ${item.batchNumber}`,
        );
      }

      restoredStock.push({
        shopId,
        batchId: item.batchId,
        quantity: item.quantity,
      });
    }

    sale.status = "cancelled";
    sale.paymentStatus = "refunded";
    await sale.save();

    // Log (best-effort)
    await TransactionLog.create({
      type: "refund",
      referenceId: sale._id,
      referenceModel: "Sale",
      shopId,
      performedBy: userId,
      performedByModel: "ShopUser",
      amount: sale.total,
      description: `Refund for sale ${receiptNo}`,
      metadata: { originalReceiptNo: receiptNo },
      status: "success",
    });

    res.status(200).json({ message: "Sale cancelled and stock restored" });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
