import mongoose from "mongoose";
import Sale from "../models/Sale.js";
import ShopInventory from "../models/ShopInventory.js";
import Batch from "../models/Batch.js";
import Medicine from "../models/Medicine.js";
import Dispatch from "../models/Dispatch.js";
import Shop from "../models/Shop.js";

// Helper to get date ranges
const getDateRanges = (period) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case "daily":
      return {
        start: today,
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      };
    case "weekly": {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      return { start: weekStart, end: weekEnd };
    }
    case "monthly": {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { start: monthStart, end: monthEnd };
    }
    case "yearly": {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      const yearEnd = new Date(now.getFullYear() + 1, 0, 1);
      return { start: yearStart, end: yearEnd };
    }
    default:
      return {
        start: today,
        end: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      };
  }
};

// Get reports by period
export const getReportByPeriod = async (req, res) => {
  try {
    const { period } = req.params;
    const { shopId } = req.query;

    if (!["daily", "weekly", "monthly", "yearly"].includes(period)) {
      return res.status(400).json({
        message: "Invalid period. Use: daily, weekly, monthly, yearly",
      });
    }

    const { start, end } = getDateRanges(period);

    // Build query
    const query = {
      createdAt: { $gte: start, $lt: end },
      status: "completed",
    };
    if (shopId) query.shopId = shopId;

    // Get sales data
    const salesStats = await Sale.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$total" },
          totalSales: { $sum: 1 },
          totalTax: { $sum: "$taxAmount" },
          totalDiscount: { $sum: "$discountAmount" },
          averageOrderValue: { $avg: "$total" },
        },
      },
    ]);

    // Get top selling medicines
    const topMedicines = await Sale.aggregate([
      { $match: query },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.medicineId",
          name: { $first: "$items.medicineName" },
          totalQuantity: { $sum: "$items.quantity" },
          totalRevenue: { $sum: "$items.lineTotal" },
        },
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 },
    ]);

    // Get sales by payment method
    const paymentMethods = await Sale.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$paymentMethod",
          count: { $sum: 1 },
          total: { $sum: "$total" },
        },
      },
    ]);

    // Get low stock items
    const lowStockQuery = shopId
      ? { shopId, stock: { $lt: 10 } }
      : { stock: { $lt: 10 } };
    const lowStockItems = await ShopInventory.find(lowStockQuery)
      .populate("medicineId", "name sku")
      .populate("shopId", "name")
      .sort({ stock: 1 })
      .limit(20);

    // Get warehouse low stock
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const warehouseAlerts = await Batch.find({
      $or: [
        { stock: { $lt: 50 } },
        { expiryDate: { $lte: thirtyDaysFromNow } },
      ],
    })
      .populate("medicineId", "name sku")
      .sort({ expiryDate: 1 })
      .limit(20);

    const stats = salesStats[0] || {
      totalRevenue: 0,
      totalSales: 0,
      totalTax: 0,
      totalDiscount: 0,
      averageOrderValue: 0,
    };

    res.status(200).json({
      period,
      dateRange: { start, end },
      summary: {
        totalRevenue: stats.totalRevenue,
        totalSales: stats.totalSales,
        totalTax: stats.totalTax,
        totalDiscount: stats.totalDiscount,
        averageOrderValue: stats.averageOrderValue,
      },
      topMedicines,
      paymentMethods,
      alerts: {
        lowStockItems,
        warehouseAlerts,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get dashboard stats for admin
export const getAdminDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Parallel queries for performance
    const [
      totalBatches,
      totalShops,
      pendingDispatches,
      todaySales,
      totalSales,
      lowStockBatches,
      expiringBatches,
    ] = await Promise.all([
      Batch.countDocuments(),
      Shop.countDocuments({ isActive: true, isOnline: true }),
      Dispatch.countDocuments({ status: { $in: ["created", "in_transit"] } }),
      Sale.aggregate([
        {
          $match: {
            createdAt: { $gte: today },
            status: "completed",
          },
        },
        { $unwind: "$items" },
        {
          $lookup: {
            from: "admin_medicines",
            localField: "items.medicineId",
            foreignField: "_id",
            as: "medicine",
          },
        },
        { $match: { medicine: { $ne: [] } } },
        {
          $group: {
            _id: "$_id",
            total: { $first: "$total" },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$total" },
            count: { $sum: 1 },
          },
        },
      ]),
      Sale.countDocuments({ status: "completed" }),
      Batch.countDocuments({ stock: { $lt: 50 } }),
      Batch.countDocuments({
        expiryDate: {
          $lte: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
      }),
    ]);

    const totalStock = await Batch.aggregate([
      { $group: { _id: null, total: { $sum: "$stock" } } },
    ]).then((r) => r[0]?.total || 0);

    const todayStats = todaySales[0] || { total: 0, count: 0 };

    res.status(200).json({
      totalStock,
      activeShops: totalShops,
      pendingDispatches,
      todaySales: todayStats.total,
      todayTransactions: todayStats.count,
      totalSales,
      alerts: lowStockBatches + expiringBatches,
      lowStockBatches,
      expiringBatches,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get shop dashboard stats
export const getShopDashboardStats = async (req, res) => {
  try {
    const shopId = req.user.shopId;
    if (!shopId) {
      return res
        .status(400)
        .json({ message: "User not associated with a shop" });
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [totalStock, todaySales, incomingDispatches, lowStockCount] =
      await Promise.all([
        ShopInventory.aggregate([
          { $match: { shopId: new mongoose.Types.ObjectId(shopId) } },
          {
            $lookup: {
              from: "admin_medicines",
              localField: "medicineId",
              foreignField: "_id",
              as: "medicine",
            },
          },
          { $match: { medicine: { $ne: [] } } },
          { $group: { _id: null, total: { $sum: "$stock" } } },
        ]).then((r) => r[0]?.total || 0),
        Sale.aggregate([
          {
            $match: {
              shopId: new mongoose.Types.ObjectId(shopId),
              createdAt: { $gte: today },
              status: "completed",
            },
          },
          { $unwind: "$items" },
          {
            $lookup: {
              from: "admin_medicines",
              localField: "items.medicineId",
              foreignField: "_id",
              as: "medicine",
            },
          },
          { $match: { medicine: { $ne: [] } } },
          {
            $group: {
              _id: "$_id",
              total: { $first: "$total" },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$total" },
              count: { $sum: 1 },
            },
          },
        ]),
        Dispatch.countDocuments({
          shopId: new mongoose.Types.ObjectId(shopId),
          status: { $in: ["created", "in_transit"] },
        }),
        ShopInventory.countDocuments({
          shopId: new mongoose.Types.ObjectId(shopId),
          stock: { $lt: 10 },
        }),
      ]);

    const todayStats = todaySales[0] || { total: 0, count: 0 };

    res.status(200).json({
      totalStock,
      todaySales: todayStats.total,
      todayTransactions: todayStats.count,
      incomingDispatches,
      lowStockCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Comprehensive analytics stats — today, monthly, yearly revenue + dispatch cost
export const getAnalyticsStats = async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    // ── Sales revenue ──
    const [todayAgg, monthAgg, yearAgg] = await Promise.all([
      Sale.aggregate([
        { $match: { createdAt: { $gte: todayStart }, status: "completed" } },
        {
          $group: {
            _id: null,
            revenue: { $sum: "$total" },
            orders: { $sum: 1 },
          },
        },
      ]),
      Sale.aggregate([
        { $match: { createdAt: { $gte: monthStart }, status: "completed" } },
        {
          $group: {
            _id: null,
            revenue: { $sum: "$total" },
            orders: { $sum: 1 },
          },
        },
      ]),
      Sale.aggregate([
        { $match: { createdAt: { $gte: yearStart }, status: "completed" } },
        {
          $group: {
            _id: null,
            revenue: { $sum: "$total" },
            orders: { $sum: 1 },
          },
        },
      ]),
    ]);

    const today = todayAgg[0] || { revenue: 0, orders: 0 };
    const month = monthAgg[0] || { revenue: 0, orders: 0 };
    const year = yearAgg[0] || { revenue: 0, orders: 0 };

    // ── Dispatch cost (how much admin spent buying medicines that were dispatched) ──
    // Logic: for every confirmed dispatch item, cost = quantity × medicine.basePrice
    const DispatchItem = (await import("../models/DispatchItem.js")).default;
    const confirmedDispatches = await Dispatch.find({ status: "confirmed" })
      .select("_id")
      .lean();
    const confirmedIds = confirmedDispatches.map((d) => d._id);

    let todayDispatchCost = 0;
    let monthDispatchCost = 0;
    let yearDispatchCost = 0;

    if (confirmedIds.length > 0) {
      // Get confirmed dispatches with their confirmedAt date
      const confirmedWithDate = await Dispatch.find({ status: "confirmed" })
        .select("_id confirmedAt")
        .lean();

      for (const dispatch of confirmedWithDate) {
        const confirmedAt = new Date(
          dispatch.confirmedAt || dispatch.createdAt,
        );
        const items = await DispatchItem.find({ dispatchId: dispatch._id })
          .populate("medicineId", "basePrice")
          .lean();

        for (const item of items) {
          const unitCost = item.medicineId?.basePrice || 0;
          const lineCost = unitCost * item.quantity;

          if (confirmedAt >= yearStart) yearDispatchCost += lineCost;
          if (confirmedAt >= monthStart) monthDispatchCost += lineCost;
          if (confirmedAt >= todayStart) todayDispatchCost += lineCost;
        }
      }
    }

    // ── Monthly trend (last 12 months) ──
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const monthlyTrend = await Sale.aggregate([
      { $match: { createdAt: { $gte: twelveMonthsAgo }, status: "completed" } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          revenue: { $sum: "$total" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // ── Yearly trend (last 5 years) ──
    const fiveYearsAgo = new Date(now.getFullYear() - 4, 0, 1);
    const yearlyTrend = await Sale.aggregate([
      { $match: { createdAt: { $gte: fiveYearsAgo }, status: "completed" } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y", date: "$createdAt" } },
          revenue: { $sum: "$total" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // ── Daily trend (last 30 days) ──
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
    const dailyTrend = await Sale.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo }, status: "completed" } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$total" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      today: {
        revenue: today.revenue,
        orders: today.orders,
        dispatchCost: todayDispatchCost,
      },
      month: {
        revenue: month.revenue,
        orders: month.orders,
        dispatchCost: monthDispatchCost,
      },
      year: {
        revenue: year.revenue,
        orders: year.orders,
        dispatchCost: yearDispatchCost,
      },
      trends: { daily: dailyTrend, monthly: monthlyTrend, yearly: yearlyTrend },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Custom filter stats — any specific date / month / year
export const getFilteredStats = async (req, res) => {
  try {
    // filterType: 'date' | 'month' | 'year'
    // date: 'YYYY-MM-DD'  (for filterType=date)
    // month: 'YYYY-MM'    (for filterType=month)
    // year: 'YYYY'        (for filterType=year)
    const { filterType, date, month, year } = req.query;

    if (!filterType) {
      return res.status(400).json({ message: "filterType is required" });
    }

    let start, end, label;

    if (filterType === "date") {
      if (!date)
        return res
          .status(400)
          .json({ message: "date is required for filterType=date" });
      start = new Date(date);
      end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      label = date;
    } else if (filterType === "month") {
      if (!month)
        return res
          .status(400)
          .json({ message: "month is required for filterType=month" });
      const [y, m] = month.split("-").map(Number);
      start = new Date(y, m - 1, 1);
      end = new Date(y, m, 1);
      label = new Date(y, m - 1, 1).toLocaleString("default", {
        month: "long",
        year: "numeric",
      });
    } else if (filterType === "year") {
      if (!year)
        return res
          .status(400)
          .json({ message: "year is required for filterType=year" });
      start = new Date(Number(year), 0, 1);
      end = new Date(Number(year) + 1, 0, 1);
      label = String(year);
    } else {
      return res
        .status(400)
        .json({ message: "filterType must be date | month | year" });
    }

    // Sales in range
    const salesAgg = await Sale.aggregate([
      { $match: { createdAt: { $gte: start, $lt: end }, status: "completed" } },
      {
        $group: {
          _id: null,
          revenue: { $sum: "$total" },
          orders: { $sum: 1 },
          avgOrder: { $avg: "$total" },
        },
      },
    ]);
    const sales = salesAgg[0] || { revenue: 0, orders: 0, avgOrder: 0 };

    // Dispatch cost in range (based on confirmedAt)
    const DispatchItem = (await import("../models/DispatchItem.js")).default;
    const confirmedInRange = await Dispatch.find({
      status: "confirmed",
      confirmedAt: { $gte: start, $lt: end },
    })
      .select("_id")
      .lean();
    const confirmedIds = confirmedInRange.map((d) => d._id);

    let dispatchCost = 0;
    if (confirmedIds.length > 0) {
      const items = await DispatchItem.find({
        dispatchId: { $in: confirmedIds },
      })
        .populate("medicineId", "basePrice")
        .lean();
      for (const item of items) {
        dispatchCost += (item.medicineId?.basePrice || 0) * item.quantity;
      }
    }

    // Daily breakdown within range (for chart)
    const dailyBreakdown = await Sale.aggregate([
      { $match: { createdAt: { $gte: start, $lt: end }, status: "completed" } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$total" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Top medicines in range
    const topMedicines = await Sale.aggregate([
      { $match: { createdAt: { $gte: start, $lt: end }, status: "completed" } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.medicineId",
          name: { $first: "$items.medicineName" },
          totalQuantity: { $sum: "$items.quantity" },
          totalRevenue: { $sum: "$items.lineTotal" },
        },
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 5 },
    ]);

    res.status(200).json({
      label,
      filterType,
      dateRange: { start, end },
      revenue: sales.revenue,
      orders: sales.orders,
      avgOrder: sales.avgOrder,
      dispatchCost,
      net: sales.revenue - dispatchCost,
      dailyBreakdown,
      topMedicines,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get sales trend data
export const getSalesTrend = async (req, res) => {
  try {
    const { days = 30, shopId } = req.query;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - parseInt(days));

    const query = {
      createdAt: { $gte: startDate, $lte: endDate },
      status: "completed",
    };
    if (shopId) query.shopId = shopId;

    const salesByDay = await Sale.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          revenue: { $sum: "$total" },
          transactions: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      period: `Last ${days} days`,
      data: salesByDay,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
