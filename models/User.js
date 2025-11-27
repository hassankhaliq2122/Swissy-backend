const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    // -------------------------
    // BASIC PROFILE
    // -------------------------
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // Address object (customer only)
    address: {
      street: {
        type: String,
        required: function () {
          return this.role === "customer";
        },
      },
      city: {
        type: String,
        required: function () {
          return this.role === "customer";
        },
      },
      state: {
        type: String,
        required: function () {
          return this.role === "customer";
        },
      },
      zipCode: {
        type: String,
        required: function () {
          return this.role === "customer";
        },
      },
    },
    phone: {
      type: String,
      unique: true,
      required: false,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    username:{
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    customerNumber: {
  type: String,
  unique: true,
  sparse: true, 
},

    invoicingEmail: {
      type: String,
      required: false,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    // Used only for validation — NOT stored
    confirmPassword: {
      type: String,
      required: false,
      validate: {
        validator: function (val) {
          return val === this.password;
        },
        message: "Passwords do not match",
      },
    },

    // -------------------------
    // ROLE SYSTEM
    // -------------------------
    role: {
      type: String,
      enum: ["customer", "employee", "admin"],
      default: "customer",
    },
    employeeRole: {
      type: String,
      enum: ["vector", "digitizing", "patches", null],
      default: null,
      required: function () {
        return this.role === "employee";
      },
    },

    // -------------------------
    // ACCOUNT STATUS & STATS
    // -------------------------
    isActive: {
      type: Boolean,
      default: true,
    },
    ordersCompleted: {
      type: Number,
      default: 0,
    },
    ordersInProgress: {
      type: Number,
      default: 0,
    },
    employeeRating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    adminNotes: {
      type: String,
      default: "",
    },
  
     assignedOrders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }], 
  },
  { timestamps: true },
  
);

// -------------------------
// REMOVE confirmPassword BEFORE SAVING
// -------------------------
userSchema.pre("save", function (next) {
  this.confirmPassword = undefined; // prevent saving it in DB
  next();
});

// -------------------------
// PASSWORD HASHING
// -------------------------
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// -------------------------
// PASSWORD COMPARISON
// -------------------------
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
