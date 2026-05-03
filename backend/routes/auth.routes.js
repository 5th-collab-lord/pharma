import express from "express";
import {
  login,
  register,
  logout,
  markOnline,
  createInitialAdmin,
} from "../controllers/auth.controller.js";
import { verifyToken } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/logout", logout);
router.post("/online", verifyToken, markOnline);
router.post("/init-admin", createInitialAdmin);

export default router;
