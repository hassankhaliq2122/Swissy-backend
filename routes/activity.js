const express = require('express');
const router = express.Router();
const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

/* ================================
   LOG ACTIVITY (Called from Frontend)
================================ */
router.post('/log', protect, async (req, res) => {
    try {
        const { activityType, metadata } = req.body;

        await ActivityLog.create({
            userId: req.user._id,
            activityType,
            metadata: {
                ...metadata,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            }
        });

        // Update user's last active timestamp
        await User.findByIdAndUpdate(req.user._id, {
            lastActiveAt: new Date(),
            isOnline: true
        });

        res.json({ success: true });
    } catch (error) {
        console.error('❌ Failed to log activity:', error);
        res.status(500).json({ success: false, message: 'Failed to log activity' });
    }
});

/* ================================
   GET EMPLOYEE ACTIVITY (Admin Only)
================================ */
router.get('/employee/:id', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const logs = await ActivityLog.find({ userId: req.params.id })
            .sort({ timestamp: -1 })
            .limit(100)
            .populate('metadata.orderId', 'orderNumber');

        res.json({ success: true, logs });
    } catch (error) {
        console.error('❌ Failed to fetch activity logs:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch logs' });
    }
});

/* ================================
   GET ACTIVITY SUMMARY (Admin Only)
================================ */
router.get('/summary', protect, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        // Get all employees
        const employees = await User.find({ role: 'employee' }).select('name email lastActiveAt isOnline');

        // Get recent logs for each employee
        const summary = await Promise.all(employees.map(async (emp) => {
            const lastLog = await ActivityLog.findOne({ userId: emp._id }).sort({ timestamp: -1 });

            // Calculate if online (active in last 5 mins)
            const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
            const isOnline = emp.lastActiveAt && emp.lastActiveAt > fiveMinsAgo;

            return {
                _id: emp._id,
                name: emp.name,
                email: emp.email,
                isOnline,
                lastActiveAt: emp.lastActiveAt,
                lastActivity: lastLog ? lastLog.activityType : 'None'
            };
        }));

        res.json({ success: true, summary });
    } catch (error) {
        console.error('❌ Failed to fetch activity summary:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch summary' });
    }
});

module.exports = router;
