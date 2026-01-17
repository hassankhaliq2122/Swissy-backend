/**
 * Payment Routes
 * 
 * API endpoints for handling PayPal payments with dual account routing.
 * These routes serve as the bridge between the frontend and PayPal,
 * ensuring that PayPal credentials are never exposed to the client.
 */

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { createPayPalOrder, capturePayPalOrder } = require('../services/paypalService');
const Invoice = require('../models/Invoice');

// ================================
// MIDDLEWARE
// ================================

/**
 * Authorization middleware for customer role
 */
const authorize = (roles = []) => {
    if (typeof roles === 'string') roles = [roles];
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        next();
    };
};

// ================================
// CREATE PAYPAL ORDER
// ================================

/**
 * POST /api/payments/create-order
 * 
 * Creates a PayPal order for invoice payment
 * Automatically selects USA or Europe PayPal account based on invoice country
 * 
 * @body {string} invoiceId - Invoice ID to pay
 * @returns {object} PayPal order with approval URL
 */
router.post('/create-order', protect, authorize('customer'), async (req, res) => {
    try {
        const { invoiceId } = req.body;

        if (!invoiceId) {
            return res.status(400).json({
                success: false,
                message: 'Invoice ID is required'
            });
        }

        // Fetch invoice
        const invoice = await Invoice.findById(invoiceId).populate('customerId');

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }

        // Verify customer owns this invoice
        if (invoice.customerId._id.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to pay this invoice'
            });
        }

        // Check if already paid
        if (invoice.paymentStatus === 'paid') {
            return res.status(400).json({
                success: false,
                message: 'This invoice has already been paid'
            });
        }

        // Get country code from invoice (fallback to USA)
        const countryData = require('../utils/countryMapping');
        const countryCode = countryData.getCountryCode(invoice.country) || 'US';

        // Create PayPal order
        // The service will automatically route to correct PayPal account
        const paypalOrder = await createPayPalOrder({
            amount: invoice.total,
            currency: invoice.currency || 'USD',
            countryCode: countryCode,
            invoiceId: invoice._id.toString(),
            description: `Invoice ${invoice.invoiceNumber} - SwissEmbroPatches`
        });

        console.log(`💳 Payment initiated for invoice ${invoice.invoiceNumber} using ${countryCode === 'US' ? 'USA' : 'Europe'} PayPal account`);

        res.json({
            success: true,
            paypalOrderId: paypalOrder.orderId,
            approvalUrl: paypalOrder.approvalUrl,
            message: 'PayPal order created successfully'
        });

    } catch (error) {
        console.error('❌ Payment order creation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create payment order',
            error: error.message
        });
    }
});

// ================================
// CAPTURE PAYPAL PAYMENT
// ================================

/**
 * POST /api/payments/capture-order
 * 
 * Captures a PayPal payment after customer approval
 * Updates invoice payment status
 * 
 * @body {string} invoiceId - Invoice ID
 * @body {string} paypalOrderId - PayPal order ID
 * @returns {object} Payment capture result
 */
router.post('/capture-order', protect, authorize('customer'), async (req, res) => {
    try {
        const { invoiceId, paypalOrderId } = req.body;

        if (!invoiceId || !paypalOrderId) {
            return res.status(400).json({
                success: false,
                message: 'Invoice ID and PayPal order ID are required'
            });
        }

        // Fetch invoice
        const invoice = await Invoice.findById(invoiceId);

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }

        // Verify customer owns this invoice
        if (invoice.customerId.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to pay this invoice'
            });
        }

        // Get country code for routing to correct PayPal account
        const countryData = require('../utils/countryMapping');
        const countryCode = countryData.getCountryCode(invoice.country) || 'US';

        // Capture payment
        const captureResult = await capturePayPalOrder(paypalOrderId, countryCode);

        // Update invoice
        invoice.paymentStatus = 'paid';
        invoice.paymentDetails = {
            transactionId: captureResult.captureId,
            payerId: captureResult.payerId,
            payerEmail: captureResult.payerEmail,
            paymentMethod: 'PayPal',
            paidAt: new Date()
        };
        await invoice.save();

        // Update linked order
        if (invoice.orderId) {
            const Order = require('../models/Order');
            await Order.findByIdAndUpdate(invoice.orderId, {
                invoiceStatus: 'paid'
            });
        }

        console.log(`✅ Invoice ${invoice.invoiceNumber} marked as paid`);

        res.json({
            success: true,
            message: 'Payment completed successfully',
            invoice: {
                id: invoice._id,
                invoiceNumber: invoice.invoiceNumber,
                paymentStatus: invoice.paymentStatus,
                paidAt: invoice.paymentDetails.paidAt
            }
        });

    } catch (error) {
        console.error('❌ Payment capture error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to capture payment',
            error: error.message
        });
    }
});

// ================================
// GET PAYMENT STATUS
// ================================

/**
 * GET /api/payments/status/:invoiceId
 * 
 * Get payment status for an invoice
 * 
 * @param {string} invoiceId - Invoice ID
 * @returns {object} Payment status
 */
router.get('/status/:invoiceId', protect, authorize('customer'), async (req, res) => {
    try {
        const { invoiceId } = req.params;

        const invoice = await Invoice.findById(invoiceId);

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }

        // Verify customer owns this invoice
        if (invoice.customerId.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to view this invoice'
            });
        }

        res.json({
            success: true,
            paymentStatus: invoice.paymentStatus,
            paymentDetails: invoice.paymentDetails
        });

    } catch (error) {
        console.error('❌ Payment status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get payment status',
            error: error.message
        });
    }
});

module.exports = router;
