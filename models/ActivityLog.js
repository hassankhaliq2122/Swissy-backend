const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    activityType: {
        type: String,
        enum: ['login', 'logout', 'order_view', 'order_update', 'report_submit', 'page_view', 'heartbeat'],
        required: true,
    },
    timestamp: {
        type: Date,
        default: Date.now,
    },
    metadata: {
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
        ipAddress: String,
        userAgent: String,
        sessionDuration: Number, // in minutes (for logout)
        details: mongoose.Schema.Types.Mixed,
    }
});

// Index for faster queries
activityLogSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
