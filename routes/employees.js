const express = require("express");
const User = require("../models/User");
const Order = require("../models/Order");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

/* ---------------------------------------------
    CREATE EMPLOYEE
--------------------------------------------- */
router.post("/", protect, authorize("admin"), async (req, res) => {
  try {
    const { name, email, password, employeeRole } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Name, Email, and Password are required",
        });
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
      return res
        .status(400)
        .json({
          success: false,
          message: "User with this email already exists",
        });
    }

    // Create employee with admin-provided password
    const employee = await User.create({
      name,
      email,
      username: email, // Use email as username for employees
      password,
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

    res.status(201).json({
      success: true,
      employee: {
        _id: employee._id,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        employeeRole: employee.employeeRole,
        isActive: employee.isActive,
      },
    });
  } catch (error) {
    console.error("❌ Error creating employee:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to create employee",
        error: error.message,
      });
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
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch employees",
        error: error.message,
      });
  }
});

/* ---------------------------------------------
    UPDATE EMPLOYEE
--------------------------------------------- */
router.put("/:id", protect, authorize("admin"), async (req, res) => {
  try {
    const { id } = req.params;
    if (!id)
      return res
        .status(400)
        .json({ success: false, message: "Employee ID is required" });

    const employee = await User.findById(id);
    if (!employee || employee.role !== "employee") {
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });
    }

    const { name, email, employeeRole, isActive } = req.body;

    if (name) employee.name = name;

    if (email && email !== employee.email) {
      const exists = await User.findOne({ email });
      if (exists)
        return res
          .status(400)
          .json({ success: false, message: "Email already in use" });
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
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to update employee",
        error: error.message,
      });
  }
});

/* ---------------------------------------------
    DELETE EMPLOYEE
--------------------------------------------- */
router.delete("/:id", protect, authorize("admin"), async (req, res) => {
  try {
    const employee = await User.findById(req.params.id);
    if (!employee || employee.role !== "employee") {
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });
    }

    // Remove employee reference from assigned orders
    await Order.updateMany(
      { assignedTo: employee._id },
      { $unset: { assignedTo: "" } }
    );

    await employee.deleteOne();

    res.json({ success: true, message: "Employee deleted successfully" });
  } catch (error) {
    console.error("❌ Failed to delete employee:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to delete employee",
        error: error.message,
      });
  }
});

module.exports = router;
