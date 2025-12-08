const express = require("express");
const jwt = require("jsonwebtoken");
const { protect, authorize } = require("../middleware/auth");
const User = require("../models/User");

const router = express.Router();

/**
 * GET /api/users
 * Fetch users with optional search, role filter, sort, pagination
 */
router.get("/", protect, authorize("admin"), async (req, res) => {
  try {
    const { q, role, sort = "createdAt_desc", page = 1, limit = 20 } = req.query;
    const query = {};

    // Search by name/email/username
    if (q) {
      const regex = new RegExp(q.trim(), "i");
      query.$or = [{ name: regex }, { email: regex }, { username: regex }];
    }

    // Role filter
    if (role) {
      if (["vector", "digitizing", "patches"].includes(role)) {
        query.employeeRole = role;
        query.role = "employee";
      } else {
        query.role = role;
      }
    }

    const sortObj = sort === "createdAt_asc" ? { createdAt: 1 } : { createdAt: -1 };

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

/**
 * GET /api/users/:id
 * Fetch single user
 */
router.get("/:id", protect, authorize("admin"), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password -confirmPassword");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, user });
  } catch (err) {
    console.error("❌ get user by id error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch user" });
  }
});

/**
 * PUT /api/users/:id
 * Admin update user + optionally assign customer number
 * Frontend can send `assignCustomerNumber: true` to generate a number
 */
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
      assignCustomerNumber, // new flag from frontend
    } = req.body;

    const updates = {};

    if (name !== undefined) updates.name = name.trim();
    if (email !== undefined) {
      const normalized = email.toLowerCase().trim();
      const exist = await User.findOne({ email: normalized, _id: { $ne: id } });
      if (exist) return res.status(400).json({ success: false, message: "Email already exists" });
      updates.email = normalized;
    }
    if (username !== undefined) {
      const normalized = username.toLowerCase().trim();
      const exist = await User.findOne({ username: normalized, _id: { $ne: id } });
      if (exist) return res.status(400).json({ success: false, message: "Username already exists" });
      updates.username = normalized;
    }
    if (phone !== undefined) updates.phone = phone;
    if (company !== undefined) updates.company = company;
    if (invoicingEmail !== undefined) {
      const normalized = invoicingEmail.toLowerCase().trim();
      const exist = await User.findOne({ invoicingEmail: normalized, _id: { $ne: id } });
      if (exist) return res.status(400).json({ success: false, message: "Invoicing email already exists" });
      updates.invoicingEmail = normalized;
    }
    if (role !== undefined) updates.role = role;
    if (employeeRole !== undefined) updates.employeeRole = employeeRole;
    if (country !== undefined) updates.country = country;
    if (adminNotes !== undefined) updates.adminNotes = adminNotes;
    if (isActive !== undefined) updates.isActive = isActive;

    // Address
    if (street || city || state || zipCode) {
      updates.address = {
        ...(street ? { street } : {}),
        ...(city ? { city } : {}),
        ...(state ? { state } : {}),
        ...(zipCode ? { zipCode } : {}),
      };
    }

    // -----------------------------
    // Customer Number generation
    // -----------------------------
    if (role === "customer" && country && assignCustomerNumber) {
      const countryPrefix = country.slice(0, 3).toUpperCase();

      // Ensure user doesn't already have a number
      const userCurrent = await User.findById(id);
      if (!userCurrent.customerNumber) {
        const lastCustomer = await User.find({ role: "customer", country, customerNumber: { $regex: `^${countryPrefix}-` } })
          .sort({ createdAt: -1 })
          .limit(1)
          .lean();

        let nextNumber = 1;
        if (lastCustomer.length > 0) {
          const lastNum = parseInt(lastCustomer[0].customerNumber.split("-")[1], 10);
          nextNumber = lastNum + 1;
        }

        updates.customerNumber = `${countryPrefix}-${String(nextNumber).padStart(4, "0")}`;
      }
    }

    const updatedUser = await User.findByIdAndUpdate(id, updates, { new: true, runValidators: true }).select("-password -confirmPassword");

    res.json({ success: true, user: updatedUser });
  } catch (err) {
    console.error("❌ update user by admin error:", err);
    res.status(500).json({ success: false, message: "Failed to update user" });
  }
});

/**
 * POST /api/users/:id/impersonate
 * Admin impersonates a customer - generates token for that user
 */
router.post("/:id/impersonate", protect, authorize("admin"), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password -confirmPassword");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Only allow impersonating customers
    if (user.role !== "customer") {
      return res.status(400).json({ success: false, message: "Can only impersonate customers" });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(400).json({ success: false, message: "Cannot impersonate inactive user" });
    }

    // Generate token for the customer (1 day expiry for impersonation)
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

    console.log(`🔐 Admin ${req.user.email} impersonating customer ${user.email}`);

    res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        username: user.username,
      },
    });
  } catch (err) {
    console.error("❌ impersonate user error:", err);
    res.status(500).json({ success: false, message: "Failed to impersonate user" });
  }
});

module.exports = router;
