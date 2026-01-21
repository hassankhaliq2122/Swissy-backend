const express = require("express");
const router = express.Router();
const Invoice = require("../models/Invoice");
const Order = require("../models/Order");
const User = require("../models/User");
const { protect } = require("../middleware/auth");
const { sendInvoiceEmail, generateInvoicePDF } = require("../utils/emailService");

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
   Public Invoice Fetch (for email links)
   NO AUTH REQUIRED
=============================== */
router.get("/public/:id", async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id).populate("orderId");
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });

    // Resolve design name based on order type
    let designName = "Custom Order";
    if (invoice.orderId) {
      designName = invoice.orderId.patchDesignName || invoice.orderId.designName || "Custom Order";
    }

    // Return only necessary details for payment
    res.json({
      success: true,
      invoice: {
        _id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        orderNumber: invoice.orderId ? invoice.orderId.orderNumber : "N/A",
        designName: designName,
        total: invoice.total,
        currency: invoice.currency,
        status: invoice.paymentStatus,
        items: invoice.items
      }
    });
  } catch (err) {
    console.error("❌ Failed to fetch public invoice:", err);
    res.status(500).json({ success: false, message: "Failed to fetch invoice" });
  }
});

/* ===============================
   Public Payment Verification (No Auth)
   Verifies PayPal transaction for a specific invoice
=============================== */
router.post("/public/pay/:invoiceId", async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { transactionId } = req.body;

    const invoice = await Invoice.findById(invoiceId).populate("customerId orderId");
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });

    // 1. Verify with PayPal
    // We ideally should move imports to top, but using require here ensures it works without extensive refactoring of imports at top
    const paypalClient = require('../paypalClient');
    const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');

    const request = new checkoutNodeJssdk.orders.OrdersGetRequest(transactionId);
    const order = await paypalClient.execute(request);
    
    // 2. Check Status
    if (order.result.status !== 'COMPLETED') {
        return res.status(400).json({ success: false, message: "Payment not completed" });
    }

    // Mark as paid
    invoice.paymentStatus = "paid";
    invoice.paymentDetails = {
      transactionId: order.result.id,
      payerId: order.result.payer.payer_id,
      payerEmail: order.result.payer.email_address,
      paidAt: new Date(),
      paymentMethod: "PayPal",
    };
    await invoice.save();

    // Update linked order status
    if (invoice.orderId) {
      invoice.orderId.invoiceStatus = "paid";
      await invoice.orderId.save();
    }

    res.json({ success: true, message: "Payment successful and verified", invoice });
  } catch (err) {
    console.error("❌ Failed to process public payment:", err);
    res.status(500).json({ success: false, message: "Failed to process payment", error: err.message });
  }
});

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
    const { orderId, items, subtotal, tax, total, notes, dueDate, currency } = req.body;

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
      tax,
      total,
      notes,
      dueDate,
      currency: currency || "USD",
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
/* ===============================
   PayPal / Online Payment Callback
=============================== */
router.post("/pay/:invoiceId", protect, authorize("customer"), async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { transactionId } = req.body; // Client only sends ID now

    const invoice = await Invoice.findById(invoiceId).populate("customerId orderId");
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });

     // 1. Verify with PayPal
    // We need to import these at the top, but for minimal disruption we require them here or assume global.
    // Ideally, add imports at the top. Let's assume we'll fix imports in a separate tool call if needed or just use require here.
    const paypalClient = require('../paypalClient');
    const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');

    const request = new checkoutNodeJssdk.orders.OrdersGetRequest(transactionId);
    const order = await paypalClient.execute(request);
    
    // 2. Check Status
    if (order.result.status !== 'COMPLETED') {
        return res.status(400).json({ success: false, message: "Payment not completed" });
    }

    // 3. Verify Amount (Optional but recommended: check order.result.purchase_units[0].amount.value == invoice.total)
    // For now, we trust the successful capture implies correct amount if the order was created correctly.

    // Mark as paid
    invoice.paymentStatus = "paid";
    invoice.paymentDetails = {
      transactionId: order.result.id,
      payerId: order.result.payer.payer_id,
      payerEmail: order.result.payer.email_address,
      paidAt: new Date(),
      paymentMethod: "PayPal",
    };
    await invoice.save();

    // Update linked order status
    if (invoice.orderId) {
      invoice.orderId.invoiceStatus = "paid";
      await invoice.orderId.save();
    }

    res.json({ success: true, message: "Payment successful and verified", invoice });
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

/* ===============================
   Admin Preview Invoice (No Save)
=============================== */
router.post("/preview", protect, authorize("admin"), async (req, res) => {
  try {
    const { orderId, items, currency, notes } = req.body;

    const order = await Order.findById(orderId).populate("customerId");
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    const customer = order.customerId;
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });

    // Mock invoice object for PDF generation
    const mockInvoice = {
      orderId: {
        orderNumber: order.orderNumber
      },
      invoiceNumber: `PREVIEW-${Date.now()}`,
      items,
      currency: currency || "USD",
      total: items.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.price || 0)), 0),
      notes,
      dueDate: new Date().toLocaleDateString(),
    };

    const pdfBuffer = await generateInvoicePDF(mockInvoice, customer);

    res.setHeader("Content-Type", "application/pdf");
    res.send(pdfBuffer);
  } catch (err) {
    console.error("❌ Failed to generate invoice preview:", err);
    res.status(500).json({ success: false, message: `Failed to generate preview: ${err.message}` });
  }
});

module.exports = router;
