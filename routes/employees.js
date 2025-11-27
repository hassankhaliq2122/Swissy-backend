const express = require("express");
const User = require("../models/User");
const Order = require("../models/Order");
const { protect, authorize } = require("../middleware/auth");
const { sendEmail } = require("../utils/emailService");
const crypto = require("crypto");

const router = express.Router();

/* ---------------------------------------------
    CREATE EMPLOYEE
--------------------------------------------- */
router.post("/", protect, authorize("admin"), async (req, res) => {
  try {
    const { name, email, employeeRole } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, message: "Name and Email are required" });
    }

    const validRoles = ["patches", "vector", "digitizing"];
    if (!validRoles.includes(employeeRole)) {
      return res.status(400).json({
        success: false,
        message: `Invalid employeeRole. Allowed: ${validRoles.join(", ")}`,
      });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ success: false, message: "User with this email already exists" });
    }

    // Generate temporary password
    const tempPassword = crypto.randomBytes(8).toString("hex");

    // Create employee
    const employee = await User.create({
      name,
      email,
      password: tempPassword,
      role: "employee",
      employeeRole,
      isActive: true,
    });

    // Add initial notification
    employee.notifications = employee.notifications || [];
    employee.notifications.push({
      message: `Welcome! Your employee account has been created.`,
      date: new Date(),
    });
    await employee.save();

    // Send email with credentials
    try {
      const html = `
        <div style="font-family: Arial; padding: 20px; max-width: 600px; margin: auto;">
          <h2 style="background: #000; color: #FFD700; padding: 15px; text-align: center;">
            Your Employee Account is Ready
          </h2>
          <div style="padding: 20px; background: #f5f5f5; border-radius: 8px;">
            <p>Hello <strong>${name}</strong>,</p>
            <p>Your employee account has been created.</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Temporary Password:</strong> ${tempPassword}</p>
            <p><strong>Department:</strong> ${employeeRole}</p>
            <p style="margin-top: 15px; color: red;">Please change your password after login.</p>
            <a href="${process.env.FRONTEND_URL}/admin/login"
              style="display:inline-block; background:#FFD700; color:#000; padding:10px 20px; border-radius:5px; margin-top:20px; text-decoration:none;">
              Login Here
            </a>
          </div>
        </div>
      `;
      await sendEmail({ email, subject: "Your Employee Account Login Details", html });
    } catch (err) {
      console.error("❌ Email sending failed:", err);
    }

    res.status(201).json({
      success: true,
      employee: {
        id: employee._id,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        employeeRole: employee.employeeRole,
      },
    });
  } catch (error) {
    console.error("❌ Error creating employee:", error);
    res.status(500).json({ success: false, message: "Failed to create employee", error: error.message });
  }
});

/* ---------------------------------------------
    GET ALL EMPLOYEES
--------------------------------------------- */
router.get("/", protect, authorize("admin"), async (req, res) => {
  try {
    const employees = await User.find({ role: "employee" })
      .select("-password")
      .sort({ createdAt: -1 });

    res.json({ success: true, count: employees.length, employees });
  } catch (error) {
    console.error("❌ Failed to fetch employees:", error);
    res.status(500).json({ success: false, message: "Failed to fetch employees", error: error.message });
  }
});

/* ---------------------------------------------
    UPDATE EMPLOYEE
--------------------------------------------- */
router.put("/:id", protect, authorize("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, message: "Employee ID is required" });

    const employee = await User.findById(id);
    if (!employee || employee.role !== "employee") {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    const { name, email, employeeRole, isActive } = req.body;

    if (name) employee.name = name;

    if (email && email !== employee.email) {
      const exists = await User.findOne({ email });
      if (exists) return res.status(400).json({ success: false, message: "Email already in use" });
      employee.email = email;
    }

    if (employeeRole) {
      const validRoles = ["patches", "vector", "digitizing"];
      if (!validRoles.includes(employeeRole)) {
        return res.status(400).json({
          success: false,
          message: `Invalid employeeRole. Allowed: ${validRoles.join(", ")}`,
        });
      }
      employee.employeeRole = employeeRole;
    }

    if (typeof isActive === "boolean") employee.isActive = isActive;

    await employee.save();

    res.json({
      success: true,
      message: "Employee updated successfully",
      employee: {
        id: employee._id,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        employeeRole: employee.employeeRole,
        isActive: employee.isActive,
      },
    });
  } catch (error) {
    console.error("❌ Employee update failed:", error);
    res.status(500).json({ success: false, message: "Failed to update employee", error: error.message });
  }
});

/* ---------------------------------------------
    DELETE EMPLOYEE
--------------------------------------------- */
router.delete("/:id", protect, authorize("admin"), async (req, res) => {
  try {
    const employee = await User.findById(req.params.id);
    if (!employee || employee.role !== "employee") {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    // Remove employee reference from assigned orders
    await Order.updateMany({ assignedTo: employee._id }, { $unset: { assignedTo: "" } });

    await employee.deleteOne();

    res.json({ success: true, message: "Employee deleted successfully" });
  } catch (error) {
    console.error("❌ Failed to delete employee:", error);
    res.status(500).json({ success: false, message: "Failed to delete employee", error: error.message });
  }
});

module.exports = router;
