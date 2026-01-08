const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
  {
    // 🔹 Link to Customer
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // 🔹 Link to Order
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },

    // 🔹 Invoice Number (Auto-Generate)
    invoiceNumber: {
      type: String,
      unique: true,
      required: true,
      default: function () {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 100000);
        return `INV-${timestamp}-${random}`;
      },
    },

    // 🔹 Items (copied from order)
    items: [
      {
        description: { type: String, required: true },
        quantity: { type: Number, default: 1, min: 0 },
        price: { type: Number, default: 0, min: 0 },
      },
    ],

    // 🔹 Amount Breakdown
    subtotal: { type: Number, required: true, min: 0, default: 0 },

    total: { type: Number, required: true, min: 0, default: 0 },

    // 🔹 Country and Currency
    country: { type: String, default: "USA" },
    currency: { type: String, default: "USD" },
    currencySymbol: { type: String, default: "$" },

    // 🔹 Payment Status
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid", "refunded", "cancelled"],
      default: "unpaid",
    },

    // 🔹 PayPal Transaction Details
    paymentDetails: {
      transactionId: { type: String, default: null },
      payerId: { type: String, default: null },
      payerEmail: { type: String, default: null },
      paymentMethod: { type: String, default: "PayPal" },
      paidAt: { type: Date, default: null },
    },

    // 🔹 Admin Generated / Sent
    generatedByAdmin: { type: Boolean, default: true },
    invoiceSent: { type: Boolean, default: false },
    customerViewed: { type: Boolean, default: false },

    // 🔹 Optional Notes (Admin / Customer)
    notes: { type: String, default: "" },

    // 🔹 Due Date (Optional)
    dueDate: { type: Date, default: null },

    // 🔹 Original Order Total (for admin reference)
    orderTotal: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// ✅ Export model
module.exports =
  mongoose.models.Invoice || mongoose.model("Invoice", invoiceSchema);
