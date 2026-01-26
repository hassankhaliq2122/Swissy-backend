const express = require("express");
const router = express.Router();
const Invoice = require("../models/Invoice");
const Order = require("../models/Order");
const User = require("../models/User");
const { protect } = require("../middleware/auth");
const { sendInvoiceEmail, generateInvoicePDF } = require("../utils/emailService");

/* ===============================
   Role Authorization Middleware
================================ */
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
    const invoice = await Invoice.findById(req.params.id).populate("orders");
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });

    // Resolve design name based on first order (or multiple)
    // For consolidated invoice, we might show "Consolidated Order" or list them.
    let designName = "Consolidated Order";
    if (invoice.orders && invoice.orders.length > 0) {
        if (invoice.orders.length === 1) {
             const order = invoice.orders[0];
             designName = order.patchDesignName || order.designName || "Custom Order";
        } else {
             designName = `${invoice.orders.length} Orders`;
        }
    }

    // Get order numbers
    const orderNumbers = invoice.orders ? invoice.orders.map(o => o.orderNumber).join(", ") : "N/A";

    // Return only necessary details for payment
    res.json({
      success: true,
      invoice: {
        _id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        orderNumber: orderNumbers,
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

    const invoice = await Invoice.findById(invoiceId).populate("customerId orders");
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });

    // 1. Verify with PayPal
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

    // Update linked orders status to paid
    if (invoice.orders && invoice.orders.length > 0) {
        for (const ord of invoice.orders) {
            ord.invoiceStatus = "paid";
            await ord.save();
        }
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
      .populate("orders")
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
   Admin creates invoice (Consolidated)
=============================== */
router.post("/create", protect, authorize("admin"), async (req, res) => {
  try {
    const { orderIds, items, subtotal, tax, total, notes, dueDate, currency } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ success: false, message: "No orders selected for invoice." });
    }

    // Fetch orders to validate same customer and calculate total if needed
    const orders = await Order.find({ _id: { $in: orderIds } });
    if (orders.length !== orderIds.length) {
        return res.status(404).json({ success: false, message: "One or more orders not found." });
    }

    // Validate same customer
    const firstCustomerId = orders[0].customerId.toString();
    const allSameCustomer = orders.every(o => o.customerId.toString() === firstCustomerId);
    if (!allSameCustomer) {
        return res.status(400).json({ success: false, message: "All selected orders must belong to the same customer." });
    }

    // Fetch customer
    const customer = await User.findById(firstCustomerId);
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });

    // Calculate sum of order totals (for reference)
    const ordersTotalSum = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    // Create invoice
    const invoice = await Invoice.create({
      customerId: customer._id,
      orders: orders.map(o => o._id), // Array of IDs
      items,
      subtotal,
      tax,
      total, // This is the invoice total (could be sum of orders or custom)
      notes,
      dueDate,
      currency: currency || "USD",
      orderTotal: ordersTotalSum,
      generatedByAdmin: true,
    });

    // Update all orders with invoice info
    for (const order of orders) {
        order.invoiceId = invoice._id;
        order.hasInvoice = true;
        order.invoiceStatus = "pending";
        await order.save();
    }

    // Send invoice email (populate orders first)
    try {
      // Need to populate orders for the email template if it relies on them
      await invoice.populate('orders'); 
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
    const { transactionId } = req.body; 

    const invoice = await Invoice.findById(invoiceId).populate("customerId orders");
    if (!invoice) return res.status(404).json({ success: false, message: "Invoice not found" });

     // 1. Verify with PayPal
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

    // Update linked orders status
    if (invoice.orders && invoice.orders.length > 0) {
        for (const ord of invoice.orders) {
            ord.invoiceStatus = "paid";
            await ord.save();
        }
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
      .populate("customerId orders")
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
    const invoice = await Invoice.findById(invoiceId).populate("customerId orders");
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
    // orderIds array instead of single orderId
    const { orderIds, items, currency, notes } = req.body;

    let orderNumbers = "PREVIEW";
    let customer = null;

    if (orderIds && orderIds.length > 0) {
        const orders = await Order.find({ _id: { $in: orderIds } }).populate("customerId");
        if (orders.length > 0) {
            customer = orders[0].customerId;
            orderNumbers = orders.map(o => o.orderNumber).join(", ");
        }
    }

    if (!customer) return res.status(404).json({ success: false, message: "Customer not found for selected orders" });

    // Mock invoice object for PDF generation
    const mockInvoice = {
      // Mock orders array with just orderNumber for PDF
      orders: orderIds.map((_, i) => ({ orderNumber: orderNumbers.split(", ")[i] || "N/A" })),
      // Also keep orderId.orderNumber compatible if needed, but better to update PDF generator
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
