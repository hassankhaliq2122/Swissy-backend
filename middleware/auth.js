const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * ============================================
 * Middleware: Protect Routes (Authentication)
 * ============================================
 */
exports.protect = async (req, res, next) => {
  try {
    let token;

    // Extract token from Authorization header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    // No token found
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, token missing",
      });
    }

    // Verify JWT
    if (!process.env.JWT_SECRET) {
      console.error("[AUTH-MIDDLEWARE-DEBUG] ERROR: JWT_SECRET is not set!");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find user by decoded ID
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      console.log(
        `[AUTH-MIDDLEWARE-DEBUG] User not found for ID: ${decoded.id}`
      );
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.isActive) {
      console.log(
        `[AUTH-MIDDLEWARE-DEBUG] Account inactive for user: ${user.email}`
      );
      return res.status(403).json({
        success: false,
        message: "Account is inactive. Please contact support.",
      });
    }

    // Attach user to request object
    req.user = user;
    next();
  } catch (error) {
    console.error(
      `[AUTH-MIDDLEWARE-DEBUG] JWT verification error: ${error.message}`
    );
    // Check if it's an expiration error
    if (error.name === "TokenExpiredError") {
      console.log("[AUTH-MIDDLEWARE-DEBUG] Token has expired");
    } else if (error.name === "JsonWebTokenError") {
      console.log(
        `[AUTH-MIDDLEWARE-DEBUG] Invalid token signature/format: ${error.message}`
      );
    }

    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

/**
 * ============================================
 * Middleware: Role Authorization
 * ============================================
 */
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role '${req.user.role}' is not authorized to access this route`,
      });
    }
    next();
  };
};

/**
 * ============================================
 * Middleware: Employee Permission Check
 * ============================================
 */
exports.checkEmployeePermission = (requiredPermission) => {
  return (req, res, next) => {
    if (req.user.role === "admin") return next();

    if (req.user.role === "employee") {
      const permissions = {
        viewer: ["read"],
        editor: ["read", "update"],
        full_access: ["read", "update", "create", "delete"],
      };

      const userPermissions = permissions[req.user.employeeRole] || [];

      if (userPermissions.includes(requiredPermission)) {
        return next();
      }
    }

    return res.status(403).json({
      success: false,
      message: "Insufficient permissions to perform this action",
    });
  };
};
