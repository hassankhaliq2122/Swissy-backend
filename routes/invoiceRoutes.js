const express = require("express");
const router = express.Router();
const Invoice = require("../models/Invoice");
const Order = require("../models/Order");
const User = require("../models/User");
const { protect } = require("../middleware/auth");
const { sendInvoiceEmail } = require("../utils/emailService");

/* ===============================
   Role Authorization Middleware
=============================== */
const authorize = (roles = []) => {
  if (typeof roles === "string") roles = [roles];
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    next();
  };
};

/* ===============================
   Fetch invoices for logged-in customer
=============================== */
router.get("/my", protect, authorize("customer"), async (req, res) => {
  try {
    const invoices = await Invoice.find({ customerId: req.user._id })
      .populate("orderId")
      .sort({ createdAt: -1 });

    res.json({ success: true, count: invoices.length, invoices });
  } catch (err) {
    console.error("❌ Failed to fetch customer invoices:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch invoices",
      error: err.message,
    });
  }
});

/* ===============================
   Admin creates invoice
=============================== */
router.post("/create", protect, authorize("admin"), async (req, res) => {
  try {
    const { orderId, items, subtotal, total, notes, dueDate, country, currency, currencySymbol } = req.body;

    // Fetch order
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    // Fetch customer
    const customer = await User.findById(order.customerId);
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });

    // Create invoice
    const invoice = await Invoice.create({
      customerId: customer._id,
      orderId: order._id,
      items,
      subtotal,
      total,
      notes,
      dueDate,
      country: country || "USA",
      currency: currency || "USD",
      currencySymbol: currencySymbol || "$",
      orderTotal: order.totalAmount || 0,
      generatedByAdmin: true,
    });

    // Update order with invoice info
    order.invoiceId = invoice._id;
    order.hasInvoice = true;
    order.invoiceStatus = "pending";
    await order.save();

    // Send invoice email with PDF and payment link (optional - won't fail if email not configured)
    try {
      await sendInvoiceEmail(customer, invoice);
      console.log('✅ Invoice email sent successfully');
    } catch (emailError) {
      console.warn('⚠️ Failed to send invoice email (invoice still created):', emailError.message);
    }

    res.status(201).json({ success: true, invoice });
  } catch (err) {
    console.error("❌ Failed to create invoice:", err);
    res.status(500).json({ success: false, message: "Failed to create invoice", error: err.message });
  }
});

/* ===============================
   PayPal / Online Payment Callback
=============================== */
router.post("/pay/:invoiceId", protect, authorize("customer"), async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { transactionId, payerId, payerEmail } = req.body;

    const invoice = await Invoice.findById(invoiceId).populate("customerId orderId");
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });

    // Mark as paid
    invoice.paymentStatus = "paid";
    invoice.paymentDetails = {
      transactionId,
      payerId,
      payerEmail,
      paidAt: new Date(),
      paymentMethod: "PayPal",
    };
    await invoice.save();

    // Update linked order status
    if (invoice.orderId) {
      invoice.orderId.invoiceStatus = "paid";
      await invoice.orderId.save();
    }

    res.json({ success: true, message: "Payment successful", invoice });
  } catch (err) {
    console.error("❌ Failed to process payment:", err);
    res.status(500).json({ success: false, message: "Failed to process payment", error: err.message });
  }
});

/* ===============================
   Fetch all invoices (Admin)
   Optional filters: status, startDate, endDate
=============================== */
router.get("/all", protect, authorize("admin"), async (req, res) => {
  try {
    const { status, startDate, endDate } = req.query;
    let query = {};

    if (status) query.paymentStatus = status;
    if (startDate && endDate) query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };

    const invoices = await Invoice.find(query)
      .populate("customerId orderId")
      .sort({ createdAt: -1 });

    res.json({ success: true, count: invoices.length, invoices });
  } catch (err) {
    console.error("❌ Failed to fetch invoices (admin):", err);
    res.status(500).json({ success: false, message: "Failed to fetch invoices", error: err.message });
  }
});
/* ===============================
   Admin sends invoice to customer (manual resend)
=============================== */
router.post("/send/:invoiceId", protect, authorize("admin"), async (req, res) => {
  try {
    const { invoiceId } = req.params;

    // Fetch invoice
    const invoice = await Invoice.findById(invoiceId).populate("customerId");
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    const customer = invoice.customerId;
    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }

    // Send invoice email again (optional)
    try {
      await sendInvoiceEmail(customer, invoice);
      res.json({ success: true, message: "Invoice sent successfully!" });
    } catch (emailError) {
      console.warn('⚠️ Failed to send invoice email:', emailError.message);
      res.status(500).json({
        success: false,
        message: "Invoice exists but email failed to send. Please check email configuration.",
        error: emailError.message
      });
    }
  } catch (err) {
    console.error("❌ Failed to send invoice:", err);
    res.status(500).json({
      success: false,
      message: "Failed to send invoice",
      error: err.message,
    });
  }
});

module.exports = router;
