import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import authRoutes from "./routes/auth.routes.js";
import inventoryRoutes from "./routes/inventory.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import dispatchRoutes from "./routes/dispatch.routes.js";
import posRoutes from "./routes/pos.routes.js";
import reportsRoutes from "./routes/reports.routes.js";
import { ensureAdminAccount } from "./controllers/auth.controller.js";

// Global socket.io instance for emitting events from controllers
export let io;

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

// Socket.io setup with CORS
io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:8081",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:8081",
    credentials: true,
  }),
);
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/dispatch", dispatchRoutes);
app.use("/api/pos", posRoutes);
app.use("/api/reports", reportsRoutes);

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Join shop room for shop-specific updates
  socket.on("join-shop", (shopId) => {
    if (shopId) {
      socket.join(`shop-${shopId}`);
      console.log(`Socket ${socket.id} joined shop-${shopId}`);
    }
  });

  // Join admin room for admin updates
  socket.on("join-admin", () => {
    socket.join("admin");
    console.log(`Socket ${socket.id} joined admin room`);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/kk_pharma")
  .then(async () => {
    console.log("Connected to MongoDB");

    // Ensure configured admin credentials are always in sync.
    try {
      await ensureAdminAccount();
      console.log("Admin account sync complete.");
    } catch (e) {
      console.log("Admin account sync error:", e.message);
    }

    httpServer.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Socket.io ready for connections`);
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });
