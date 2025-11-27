const express = require("express");
const { protect, authorize } = require("../middleware/auth");
const User = require("../models/User");

const router = express.Router();

/* ======================================================
   ADVANCED GET ALL USERS (ADMIN)
   Supports: search, filter, sort, pagination
====================================================== */
router.get("/", protect, authorize("admin"), async (req, res) => {
  try {
    const { q, role, sort = "createdAt_desc", page = 1, limit = 20 } = req.query;
    const query = {};

    // 🔍 SEARCH (name, email, username)
    if (q) {
      const regex = new RegExp(q.trim(), "i");
      query.$or = [{ name: regex }, { email: regex }, { username: regex }];
    }

    // 🔎 FILTER BY ROLE
    if (role) {
      // employee-specific subroles
      if (["vector", "digitizing", "patches"].includes(role)) {
        query.employeeRole = role;
        query.role = "employee";
      } else {
        query.role = role;
      }
    }

    // ⏳ SORTING
    const sortObj = {};
    sortObj.createdAt = sort === "createdAt_asc" ? 1 : -1;

    // 📄 PAGINATION
    const pageNum = Math.max(1, parseInt(page));
    const lim = Math.max(1, Math.min(100, parseInt(limit)));

    const total = await User.countDocuments(query);

    const users = await User.find(query)
      .select("-password -confirmPassword")
      .sort(sortObj)
      .skip((pageNum - 1) * lim)
      .limit(lim)
      .lean();

    res.json({
      success: true,
      users,
      total,
      page: pageNum,
      pages: Math.ceil(total / lim) || 1,
      limit: lim,
    });
  } catch (err) {
    console.error("❌ fetch users error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
});

/* ======================================================
   GET USER BY ID (ADMIN)
====================================================== */
router.get("/:id", protect, authorize("admin"), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(
      "-password -confirmPassword"
    );
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    res.json({ success: true, user });
  } catch (err) {
    console.error("❌ get user by id error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch user" });
  }
});

/* ======================================================
   ADMIN UPDATE USER (NEW)
====================================================== */
router.put("/:id", protect, authorize("admin"), async (req, res) => {
  try {
    const id = req.params.id;

    const {
      name,
      email,
      username,
      phone,
      company,
      invoicingEmail,
      role,
      employeeRole,
      street,
      city,
      state,
      zipCode,
      country,
      adminNotes,
      isActive,
    } = req.body;

    const updates = {};

    // NAME
    if (name !== undefined) updates.name = name.trim();

    // EMAIL UNIQUE CHECK
    if (email !== undefined) {
      const normalized = email.toLowerCase().trim();
      const exist = await User.findOne({ email: normalized, _id: { $ne: id } });
      if (exist)
        return res
          .status(400)
          .json({ success: false, message: "Email already exists" });
      updates.email = normalized;
    }

    // USERNAME UNIQUE CHECK
    if (username !== undefined) {
      const normalized = username.toLowerCase().trim();
      const exist = await User.findOne({
        username: normalized,
        _id: { $ne: id },
      });
      if (exist)
        return res
          .status(400)
          .json({ success: false, message: "Username already exists" });
      updates.username = normalized;
    }

    // OTHER FIELDS
    if (phone !== undefined) updates.phone = phone;
    if (company !== undefined) updates.company = company;

    if (invoicingEmail !== undefined) {
      const normalized = invoicingEmail.toLowerCase().trim();
      const exist = await User.findOne({
        invoicingEmail: normalized,
        _id: { $ne: id },
      });
      if (exist)
        return res.status(400).json({
          success: false,
          message: "Invoicing email already exists",
        });
      updates.invoicingEmail = normalized;
    }

    if (role !== undefined) updates.role = role;
    if (employeeRole !== undefined) updates.employeeRole = employeeRole;
    if (country !== undefined) updates.country = country;
    if (adminNotes !== undefined) updates.adminNotes = adminNotes;
    if (isActive !== undefined) updates.isActive = isActive;

    // ADDRESS BLOCK
    if (street !== undefined || city !== undefined || state !== undefined || zipCode !== undefined) {
      updates.address = {
        ...(street !== undefined ? { street } : {}),
        ...(city !== undefined ? { city } : {}),
        ...(state !== undefined ? { state } : {}),
        ...(zipCode !== undefined ? { zipCode } : {}),
      };
    }

    const user = await User.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    }).select("-password -confirmPassword");

    res.json({ success: true, user });
  } catch (err) {
    console.error("❌ update user by admin error:", err);
    res.status(500).json({ success: false, message: "Failed to update user" });
  }
});

/* ======================================================
   CUSTOMER SELF PROFILE UPDATE (UNTOUCHED)
====================================================== */
router.put("/profile", protect, async (req, res) => {
  try {
    const userId = req.user._id;

    const {
      name,
      username,
      email,
      phone,
      company,
      areaOfInterest,
      country,
      street,
      city,
      state,
      zipCode,
      invoicingEmail,
    } = req.body;

    const updates = {};

    if (name !== undefined) updates.name = name.trim();
    if (company !== undefined) updates.company = company;
    if (areaOfInterest !== undefined) updates.areaOfInterest = areaOfInterest;
    if (country !== undefined) updates.country = country;

    // EMAIL UNIQUE CHECK
    if (email !== undefined) {
      const normalizedEmail = email.toLowerCase().trim();
      const emailExists = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: userId },
      });
      if (emailExists)
        return res
          .status(400)
          .json({ success: false, message: "Email already exists" });
      updates.email = normalizedEmail;
    }

    // USERNAME UNIQUE CHECK
    if (username !== undefined) {
      const normalizedUsername = username.toLowerCase().trim();
      const usernameExists = await User.findOne({
        username: normalizedUsername,
        _id: { $ne: userId },
      });
      if (usernameExists)
        return res
          .status(400)
          .json({ success: false, message: "Username already exists" });
      updates.username = normalizedUsername;
    }

    // PHONE
    if (phone !== undefined) {
      const phoneExists = await User.findOne({
        phone,
        _id: { $ne: userId },
      });
      if (phoneExists)
        return res
          .status(400)
          .json({ success: false, message: "Phone number already exists" });
      updates.phone = phone;
    }

    // INVOICING EMAIL
    if (invoicingEmail !== undefined) {
      const normalizedInv = invoicingEmail.toLowerCase().trim();
      const invExists = await User.findOne({
        invoicingEmail: normalizedInv,
        _id: { $ne: userId },
      });
      if (invExists)
        return res
          .status(400)
          .json({ success: false, message: "Invoicing email already exists" });
      updates.invoicingEmail = normalizedInv;
    }

    // ADDRESS (ONLY FOR CUSTOMERS)
    if (req.user.role === "customer") {
      updates.address = { street, city, state, zipCode };
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updates, {
      new: true,
      runValidators: true,
    }).select("-password -confirmPassword");

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("❌ Failed to update profile:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
    });
  }
});

/* ======================================================
   UPDATE PASSWORD (STAYS SAME)
====================================================== */
router.put("/password", protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Please provide both passwords",
      });
    }

    const user = await User.findById(req.user._id).select("+password");
    if (!user)
      return res.status(404).json({ success: false, message: "User not found" });

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch)
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error("❌ Failed to update password:", error.message);
    res.status(500).json({ success: false, message: "Failed to update password" });
  }
});

module.exports = router;
