const mongoose = require("mongoose");

/* ===============================
   Sub-schemas
=============================== */
const customSizesSchema = new mongoose.Schema(
  {
    length: { type: Number, min: 0, default: 0 },
    width: { type: Number, min: 0, default: 0 },
    unit: { type: String, enum: ["inches", "cm", "mm"], default: "inches" },
  },
  { _id: false }
);

const fileSchema = new mongoose.Schema(
  {
    url: String,
    filename: String,
    size: Number,
    mimetype: String,
  },
  { _id: false }
);

const itemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true },
    quantity: { type: Number, default: 1, min: 0 },
    price: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

/* ===============================
   Order Schema
=============================== */
const orderSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // 🔹 Order Number (auto-generated with type prefix)
    orderNumber: {
      type: String,
      unique: true,
      default: function () {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 10000)
          .toString()
          .padStart(4, "0");

        // Determine prefix based on order type
        let prefix = "ORD";
        if (this.orderType === "vector") prefix = "VEC";
        else if (this.orderType === "digitizing") prefix = "DIG";
        else if (this.orderType === "patches") prefix = "PAT";

        return `${prefix}-${timestamp}-${random}`;
      },
    },

    // 🔹 Order Type
    orderType: {
      type: String,
      enum: ["vector", "digitizing", "patches"],
      required: true,
      default: "",
    },

    /* ==========================================
     VECTOR & DIGITIZING FIELDS
  ========================================== */
    designName: {
      type: String,
      required: function () {
        return this.orderType === "vector" || this.orderType === "digitizing";
      },
      trim: true,
    },
    fileFormat: {
      type: String,
      enum: ["AI", "CDR", "SVG", "PDF", "EPS", "Other"],
      required: function () {
        return this.orderType === "vector";
      },
    },
    otherInstructions: { type: String, default: "", trim: true },

    /* ==========================================
     PATCH FIELDS
  ========================================== */
    patchDesignName: {
      type: String,
      trim: true,
      required: function () {
        return this.orderType === "patches";
      },
    },
    patchStyle: {
      type: String,
      enum: [
        "Embroidery Patches",
        "Sublimation Patches",
        "Leather Patches",
        "PVC / Silicon Patches",
        "Woven Patches",
        "Chenille Patches",
        "Keychains",
        "TPU Patches",
      ],
      required: function () {
        return this.orderType === "patches";
      },
    },
    patchAmount: {
      type: Number,
      min: 0,
      required: function () {
        return this.orderType === "patches";
      },
    },
    patchUnit: {
      type: String,
      enum: ["inches", "centimeters", "millimeters"],
      required: function () {
        return this.orderType === "patches";
      },
    },
    patchLength: {
      type: Number,
      min: 0,
      required: function () {
        return this.orderType === "patches";
      },
    },
    patchWidth: {
      type: Number,
      min: 0,
      required: function () {
        return this.orderType === "patches";
      },
    },
    patchBackingStyle: {
      type: String,
      enum: ["Iron On", "Sewn On", "Peel N Stick", "Velcro M+F"],
      required: function () {
        return this.orderType === "patches";
      },
    },
    patchQuantity: {
      type: Number,
      min: 1,
      required: function () {
        return this.orderType === "patches";
      },
    },
    patchAddress: {
      type: String,
      required: function () {
        return this.orderType === "patches";
      },
    },
    trackingNumber: { type: String, default: "", trim: true },

    /* ==========================================
     DIGITIZING FIELDS
  ========================================== */
    PlacementofDesign: {
      type: String,
      required: function () {
        return this.orderType === "digitizing";
      },
    },
    CustomMeasurements: {
      type: String,
      required: function () {
        return this.orderType === "digitizing";
      },
    },
    length: { type: Number, min: 0, default: 0 },
    width: { type: Number, min: 0, default: 0 },
    unit: { type: String, enum: ["inches", "cm", "mm"], default: "inches" },
    customSizes: { type: customSizesSchema, default: () => ({}) },

    /* ==========================================
     COMMON FIELDS
  ========================================== */
    items: { type: [itemSchema], default: [] },
    files: { type: [fileSchema], default: [] },
    status: {
      type: String,
      enum: [
        "In Progress", // 1
        "Waiting for Approval", // 2 (Admin uploaded sample)
        "Design Approved", // 3 (Customer approved sample)
        "In Revision", // 3 (Customer requested edit)
        "Manufacturing", // 4 (Design Approved -> Manufacturing)
        "Revision Ready", // 4 (Admin uploaded revision)
        "Revision Approved", // 4 (Customer approved revision)
        "Completed", // auto
        "Rejected", // optional
        "Cancelled", // optional
        "Superseded", // replaced by revision order
      ],
      default: "In Progress",
    },

    // 🔹 Customer Approval Status (Feedback)
    customerApprovalStatus: {
      type: String,
      enum: ["pending", "approved", "revision_requested"],
      default: "pending",
    },

    // 🔹 Sample Images (Admin Uploads)
    sampleImages: [
      {
        url: String,
        filename: String,
        uploadedAt: { type: Date, default: Date.now },
        type: {
          type: String,
          enum: ["initial", "revision"],
          default: "initial",
        },
        comments: { type: String, default: "" }, // Admin comments
      },
    ],

    // 🔹 Revision Tracking
    parentOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    isRevision: {
      type: Boolean,
      default: false,
    },
    revisionNumber: {
      type: Number,
      default: 0, // 0 = original, 1 = first revision, 2 = second revision, etc.
    },
    revisionReason: {
      type: String,
      default: "",
    },

    totalAmount: { type: Number, default: 0 },
    notes: { type: String, default: "" },
    rejectedReason: { type: String, default: "" },

    /* ==========================================
     ASSIGNMENT & REPORTING
  ========================================== */
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    requiredEmployeeRole: {
      type: String,
      enum: ["vector", "digitizing", "patches"],
      required: true,
      default: function () {
        return this.orderType;
      },
    },
    report: { type: String, default: "" },
    completedCount: { type: Number, default: 0 },

    /* ==========================================
     EMPLOYEE PENDING WORK (Awaiting Admin Approval)
  ========================================== */
    employeePendingWork: {
      hasPendingWork: { type: Boolean, default: false },
      pendingStatus: { type: String, default: "" },
      pendingFiles: [
        {
          url: String,
          filename: String,
          uploadedAt: { type: Date, default: Date.now },
          comments: { type: String, default: "" },
        },
      ],
      pendingReport: { type: String, default: "" },
      submittedAt: { type: Date },
      submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      rejectionReason: { type: String, default: "" },
      wasRejected: { type: Boolean, default: false },
    },

    /* ==========================================
     EMPLOYEE PENDING WORK (Awaiting Admin Approval)
  ========================================== */
    employeePendingWork: {
      hasPendingWork: { type: Boolean, default: false },
      pendingStatus: { type: String, default: "" },
      pendingFiles: [
        {
          url: String,
          filename: String,
          uploadedAt: { type: Date, default: Date.now },
          comments: { type: String, default: "" },
        },
      ],
      pendingReport: { type: String, default: "" },
      submittedAt: { type: Date },
      submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      rejectionReason: { type: String, default: "" },
      wasRejected: { type: Boolean, default: false },
    },

    /* ==========================================
     🔥 INVOICE SETTINGS (ADDED)
  ========================================== */
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      default: null,
    },
    hasInvoice: {
      type: Boolean,
      default: false,
    },
    invoiceStatus: {
      type: String,
      enum: ["pending", "paid", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true }
);

/* ===============================
   Export Model
=============================== */
const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);
module.exports = Order;
