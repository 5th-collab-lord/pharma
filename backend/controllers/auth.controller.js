import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Admin from "../models/Admin.js";
import ShopUser from "../models/ShopUser.js";
import Shop from "../models/Shop.js";

export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await ShopUser.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new ShopUser({
      name,
      email,
      password: hashedPassword,
      role: "shop",
    });

    const savedUser = await newUser.save();

    const newShop = new Shop({
      name: `${name}'s Pharmacy`,
      ownerId: savedUser._id,
      ownerContact: email,
      isActive: false, // Default to false, needs admin approval
    });

    const savedShop = await newShop.save();

    // Link shop to user
    savedUser.shopId = savedShop._id;
    await savedUser.save();

    res.status(201).json({
      message: "Registration successful! Please wait for Admin approval.",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password, loginType } = req.body;

    let user;

    // Role check based on loginType from frontend
    if (loginType === "admin") {
      user = await Admin.findOne({ email });
      if (
        !user ||
        user.email !== process.env.ADMIN_EMAIL ||
        user.role !== "admin"
      ) {
        return res.status(403).json({
          message:
            "Access denied. Only the authorized administrator can access this portal.",
        });
      }
    } else {
      user = await ShopUser.findOne({ email }).populate("shopId");
      if (!user) {
        return res.status(400).json({ message: "Invalid email or password" });
      }
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    if (user.role === "shop") {
      const shop = await Shop.findById(user.shopId);
      if (!shop || !shop.isActive) {
        return res
          .status(403)
          .json({ message: "Your account is pending admin approval." });
      }
    }

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        shopId: user.shopId ? user.shopId._id || user.shopId : null,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    // Mark shop as online when a shop user logs in
    if (user.role === "shop" && user.shopId) {
      const shopId = user.shopId._id || user.shopId;
      await Shop.findByIdAndUpdate(shopId, {
        isOnline: true,
        lastSeenAt: new Date(),
      });
    }

    res.status(200).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        shopId: user.shopId?._id || user.shopId,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createInitialAdmin = async (req, res) => {
  try {
    // Check if admin exists
    const adminExists = await Admin.findOne({ role: "admin" });
    if (adminExists) {
      return res.status(400).json({ message: "Admin already exists" });
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminEmail || !adminPassword)
      throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD env vars must be set");

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminPassword, salt);

    const adminUser = new Admin({
      name: "Super Admin",
      email: adminEmail,
      password: hashedPassword,
      role: "admin",
    });

    await adminUser.save();
    res.status(201).json({ message: "Admin created successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const logout = async (req, res) => {
  try {
    const { shopId, role } = req.body;

    // Mark shop as offline on logout
    if (role === "shop" && shopId) {
      await Shop.findByIdAndUpdate(shopId, {
        isOnline: false,
        lastSeenAt: new Date(),
      });
    }

    res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const markOnline = async (req, res) => {
  try {
    const { shopId } = req.body;
    if (shopId) {
      await Shop.findByIdAndUpdate(shopId, {
        isOnline: true,
        lastSeenAt: new Date(),
      });
    }
    res.status(200).json({ message: "Online status updated" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const ensureAdminAccount = async () => {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword)
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD env vars must be set");

  const existingAdmin = await Admin.findOne({
    $or: [{ role: "admin" }, { email: adminEmail }],
  });

  if (!existingAdmin) {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminPassword, salt);
    await Admin.create({
      name: "Super Admin",
      email: adminEmail,
      password: hashedPassword,
      role: "admin",
    });
    return;
  }

  // Only update if something has actually changed
  let dirty = false;
  if (!existingAdmin.name) {
    existingAdmin.name = "Super Admin";
    dirty = true;
  }
  if (existingAdmin.email !== adminEmail) {
    existingAdmin.email = adminEmail;
    dirty = true;
  }
  if (existingAdmin.role !== "admin") {
    existingAdmin.role = "admin";
    dirty = true;
  }

  // Always re-verify the password matches; only re-hash if it doesn't
  const passwordMatches = await bcrypt.compare(
    adminPassword,
    existingAdmin.password,
  );
  if (!passwordMatches) {
    const salt = await bcrypt.genSalt(10);
    existingAdmin.password = await bcrypt.hash(adminPassword, salt);
    dirty = true;
  }

  if (dirty) await existingAdmin.save();
};
