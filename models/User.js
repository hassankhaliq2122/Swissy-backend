const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    // Basic Profile
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: "" },
    company: { type: String, default: "" },
    areaOfInterest: { type: String, default: "" },
    invoicingEmail: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    country: { type: String, default: "" },

    // Address Object
    address: {
      street: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      zipCode: { type: String, default: "" },
    },

    // Authentication
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: ["customer", "admin", "employee"], default: "customer" },

    // Employee specific
    employeeRole: {
      type: String,
      enum: ["vector", "digitizing", "patches", null],
      default: null,
    },

    // Google Auth
    googleAvatar: { type: String },
    authProvider: { type: String, default: "local" },

    // Account Status
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },

    // Stats
    ordersCompleted: { type: Number, default: 0 },
    ordersInProgress: { type: Number, default: 0 },
    employeeRating: { type: Number, min: 1, max: 5, default: null },

    // Admin
    adminNotes: { type: String, default: "" },
    assignedOrders: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],

    // Misc
    avatar: { type: String, default: "" },
    customerNumber: { type: String, unique: true, sparse: true },

    // Billing Info (Legacy/Optional)
    billingAddress: { type: String, default: "" },
    billingCity: { type: String, default: "" },
    billingState: { type: String, default: "" },
    billingZip: { type: String, default: "" },
    billingCountry: { type: String, default: "" },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
