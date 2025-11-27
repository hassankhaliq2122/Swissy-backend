// backend/routes/payments.js
const express = require('express');
const router = express.Router();
const paypalClient = require('../paypalClient');
const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');
const Order = require('../models/Order');
const Invoice = require('../models/Invoice');

// ✅ Create PayPal Order
router.post('/create-order', async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const request = new checkoutNodeJssdk.orders.OrdersCreateRequest();
    request.prefer('return=representation');
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: 'USD',
          value: order.totalAmount.toFixed(2),
        }
      }]
    });

    const createOrder = await paypalClient.execute(request);
    res.json({ id: createOrder.result.id });
  } catch (err) {
    console.error('PayPal create-order error:', err);
    res.status(500).json({ message: 'PayPal order creation failed' });
  }
});

// ✅ Capture Payment
router.post('/capture-order', async (req, res) => {
  try {
    const { orderID, localOrderId } = req.body;

    const request = new checkoutNodeJssdk.orders.OrdersCaptureRequest(orderID);
    request.requestBody({});

    const capture = await paypalClient.execute(request);

    // Update order and invoice
    const order = await Order.findById(localOrderId);
    order.paymentStatus = 'paid';
    order.status = 'In Progress';
    await order.save();

    const invoice = await Invoice.findOne({ orderId: order._id });
    invoice.paymentDetails = {
      transactionId: capture.result.id,
      payerId: capture.result.payer.payer_id,
      payerEmail: capture.result.payer.email_address,
      paymentMethod: 'PayPal',
      paidAt: new Date(),
    };
    await invoice.save();

    res.json({ success: true, capture });
  } catch (err) {
    console.error('PayPal capture-order error:', err);
    res.status(500).json({ message: 'Payment capture failed' });
  }
});

module.exports = router;
