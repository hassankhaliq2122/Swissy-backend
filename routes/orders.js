const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Order = require('../models/Order');
const Invoice = require('../models/Invoice');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
// const { sendOrderNotification, sendOrderStatusUpdate } = require('../utils/email');
const router = express.Router();

/* ================================
   MULTER CONFIGURATION
================================ */
const uploadDir = path.join(__dirname, '../uploads/orders');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const ALLOWED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.pdf', '.svg', '.webp',
  '.ai', '.eps', '.cdr', '.dst', '.emb', '.pes', '.pxf', '.ofm'
];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.includes(ext)) cb(null, true);
  else cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', `Invalid file type: ${ext}`));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
});

/* ================================
   CREATE ORDER + INVOICE
================================ */
router.post('/', protect, upload.array('files', 5), async (req, res) => {
  try {
    const io = req.app.get('io'); // socket instance
    const body = req.body;
    const {
      orderType, designName, fileFormat, otherInstructions,
      PlacementofDesign, CustomMeasurements, length, width, unit, customSizes,
      patchDesignName, patchStyle, patchAmount, patchUnit, patchLength, patchWidth,
      patchBackingStyle, patchQuantity, patchAddress, notes
    } = body;

    if (!orderType || !['vector', 'digitizing', 'patches'].includes(orderType)) {
      return res.status(400).json({ success: false, message: 'Invalid order type.' });
    }

    if (!req.files?.length) {
      return res.status(400).json({ success: false, message: 'Please upload at least one file.' });
    }

    const uploadedFiles = req.files.map(f => ({
      url: `/uploads/orders/${f.filename}`,
      filename: f.filename,
      size: f.size,
      mimetype: f.mimetype,
    }));

    const orderData = {
      customerId: req.user._id,
      status: 'Pending',
      files: uploadedFiles,
      orderType,
      notes: notes || '',
      items: [],
    };



    
    /* ============================
       Handle dynamic items per order type
    ============================ */
    if (orderType === 'vector') {
      if (!designName || !fileFormat) return res.status(400).json({ success: false, message: 'Missing vector fields.' });
      orderData.designName = designName;
      orderData.fileFormat = fileFormat;
      orderData.items.push({ description: `${designName} (${fileFormat})`, quantity: 1, price: 50 });

    } else if (orderType === 'digitizing') {
      if (!length || !width || !unit) return res.status(400).json({ success: false, message: 'Missing digitizing fields.' });
      orderData.designName = designName;
      orderData.PlacementofDesign = PlacementofDesign;
      orderData.CustomMeasurements = CustomMeasurements;
      orderData.length = length;
      orderData.width = width;
      orderData.unit = unit;
      try {
        orderData.customSizes = typeof customSizes === 'string' ? JSON.parse(customSizes) : customSizes;
      } catch {
        orderData.customSizes = customSizes || {};
      }
      const sizeFactor = (parseFloat(length) || 0) * (parseFloat(width) || 0);
      orderData.items.push({ description: `${designName} - ${length}${unit} x ${width}${unit}`, quantity: 1, price: 20 + sizeFactor });

    } else if (orderType === 'patches') {
      const requiredFields = ['patchDesignName','patchStyle','patchAmount','patchUnit','patchLength','patchWidth','patchBackingStyle','patchQuantity','patchAddress'];
      const missing = requiredFields.filter(f => !body[f]);
      if (missing.length) return res.status(400).json({ success: false, message: `Missing patch fields: ${missing.join(', ')}` });

      Object.assign(orderData, { patchDesignName, patchStyle, patchAmount, patchUnit, patchLength, patchWidth, patchBackingStyle, patchQuantity, patchAddress });
      const patchSizeFactor = (parseFloat(patchLength) || 0) * (parseFloat(patchWidth) || 0);
      orderData.items.push({ description: `${patchDesignName} (${patchStyle})`, quantity: parseInt(patchQuantity) || 1, price: 10 + patchSizeFactor });
    }

    // ✅ Create Order
    const order = await Order.create(orderData);

    // ✅ Create Invoice automatically
    const subtotal = order.items.reduce((sum, item) => sum + (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 0), 0);
    const tax = subtotal * 0.1; // 10%
    const total = subtotal + tax;
    const invoice = await Invoice.create({
      orderId: order._id,
      customerId: order.customerId,
      invoiceNumber: `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      items: order.items,
      subtotal,
      tax,
      total,
    });

    // Notification for Customer
    const notificationCustomer = await Notification.create({
      userId: req.user._id,
      orderId: order._id,
      type: 'order_created',
      title: 'Order Placed Successfully',
      message: `Your order ${order.orderNumber} has been created successfully.`,
    });
    io.to(`user-${req.user._id}`).emit('newNotification', notificationCustomer);
    io.to(`user-${req.user._id}`).emit('orderUpdate', order);

    // Notify Admins about new order
    const admins = await User.find({ role: 'admin' });
    admins.forEach(a => io.to(`user-${a._id}`).emit('newOrder', order));

    res.status(201).json({ success: true, order, invoice });

  } catch (error) {
    console.error('❌ Failed to create order:', error);
    if (req.files?.length) req.files.forEach(f => {
      const filePath = path.join(uploadDir, f.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });
    res.status(500).json({ success: false, message: 'Failed to create order', error: error.message });
  }
});

/* ================================
   GET ORDERS (Customer / Admin)
================================ */
router.get('/', protect, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const filter = isAdmin ? {} : { customerId: req.user._id };
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .populate('customerId', 'name email')
      .populate('assignedTo', 'name email employeeRole');
    res.json({ success: true, count: orders.length, orders });
  } catch (error) {
    console.error('❌ Failed to fetch orders:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders', error: error.message });
  }
});

/* ================================
   GET ASSIGNED ORDERS (Employee)
================================ */
router.get('/assigned', protect, async (req, res) => {
  try {
    if (req.user.role !== 'employee') return res.status(403).json({ success: false, message: 'Only employees can access assigned orders' });

    const orders = await Order.find({ assignedTo: req.user._id })
      .sort({ createdAt: -1 })
      .populate('customerId', 'name email')
      .populate('assignedTo', 'name email employeeRole');

    res.json({ success: true, count: orders.length, orders });
  } catch (error) {
    console.error('❌ Failed to fetch assigned orders:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch assigned orders', error: error.message });
  }
});


/* ================================
   GET CUSTOMER INVOICES
================================ */
router.get('/invoices', protect, async (req, res) => {
  try {
    // Only fetch orders of the logged-in customer
    const orders = await Order.find({ customerId: req.user._id })
      .sort({ createdAt: -1 })
      .populate('invoiceId'); // populate invoice details

    const invoices = orders.map(o => ({
      orderId: o._id,
      orderNumber: o.orderNumber,
      orderType: o.orderType,
      status: o.status,
      totalAmount: o.totalAmount,
      invoice: o.invoiceId ? {
        invoiceNumber: o.invoiceId.invoiceNumber,
        subtotal: o.invoiceId.subtotal,
        tax: o.invoiceId.tax,
        total: o.invoiceId.total,
        status: o.invoiceId.status || 'pending'
      } : null,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt
    }));

    res.json({ success: true, count: invoices.length, invoices });
  } catch (error) {
    console.error('❌ Failed to fetch customer invoices:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch invoices', error: error.message });
  }
});




/* ================================
   ASSIGN SINGLE ORDER (Admin)
================================ */
router.patch('/assign/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Only admin can assign orders' });

    const { employeeId } = req.body;
    if (!employeeId) return res.status(400).json({ success: false, message: 'employeeId is required' });

    const employee = await User.findById(employeeId);
    if (!employee || employee.role !== 'employee') return res.status(400).json({ success: false, message: 'Invalid employee' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const previousAssigned = order.assignedTo ? order.assignedTo.toString() : null;
    order.assignedTo = employeeId;
    await order.save();

    // ✅ Remove order from previous employee
    if (previousAssigned && previousAssigned !== employeeId) {
      await User.findByIdAndUpdate(previousAssigned, { $pull: { assignedOrders: order._id } });
    }

    // ✅ Add order to current employee
    await User.findByIdAndUpdate(employeeId, { $addToSet: { assignedOrders: order._id } });

    const assignNotif = await Notification.create({
      userId: employeeId,
      orderId: order._id,
      type: 'order_assigned',
      title: `Order Assigned: ${order.orderNumber}`,
      message: `You have been assigned order ${order.orderNumber}.`,
    });

    const io = req.app.get('io');
    io.to(`user-${employeeId}`).emit('newNotification', assignNotif);
    io.emit('orderAssigned', { orderId: order._id, assignedTo: employeeId });

    res.json({ success: true, message: 'Order assigned successfully', order, previousAssigned });
  } catch (error) {
    console.error('❌ Failed to assign order:', error);
    res.status(500).json({ success: false, message: 'Failed to assign order', error: error.message });
  }
});

/* ================================
   BULK ASSIGN ORDERS (Admin)
================================ */
router.patch('/bulk-assign', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Only admin can bulk assign orders' });

    const { orderIds, employeeId } = req.body;
    if (!Array.isArray(orderIds) || orderIds.length === 0) return res.status(400).json({ success: false, message: 'orderIds (non-empty array) is required' });
    if (!employeeId) return res.status(400).json({ success: false, message: 'employeeId is required' });

    const employee = await User.findById(employeeId);
    if (!employee || employee.role !== 'employee') return res.status(400).json({ success: false, message: 'Invalid employee' });

    const orders = await Order.find({ _id: { $in: orderIds } });
    if (!orders.length) return res.status(404).json({ success: false, message: 'No matching orders found' });

    for (const o of orders) {
      const prev = o.assignedTo ? o.assignedTo.toString() : null;

      // ✅ Remove from previous employee
      if (prev && prev !== employeeId) await User.findByIdAndUpdate(prev, { $pull: { assignedOrders: o._id } });

      // ✅ Add to current employee
      await User.findByIdAndUpdate(employeeId, { $addToSet: { assignedOrders: o._id } });

      o.assignedTo = employeeId;
      await o.save();

      await Notification.create({
        userId: employeeId,
        orderId: o._id,
        type: 'order_assigned',
        title: `Order Assigned: ${o.orderNumber}`,
        message: `You have been assigned order ${o.orderNumber}.`,
      });
    }

    const io = req.app.get('io');
    io.to(`user-${employeeId}`).emit('newNotification', { message: `${orders.length} orders assigned` });
    io.emit('bulkAssign', { orderIds, employeeId });

    res.json({ success: true, message: 'Bulk assignment completed', assignedCount: orders.length });
  } catch (error) {
    console.error('❌ Failed bulk assign:', error);
    res.status(500).json({ success: false, message: 'Failed bulk assign', error: error.message });
  }
});

/* ================================
   UPDATE ORDER
================================ */
router.put('/:id', protect, async (req, res) => {
  try {
    const io = req.app.get('io');
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (req.user.role === 'admin' || (req.user.role === 'employee' && order.assignedTo?.toString() === req.user._id.toString())) {
      const { status, rejectedReason, report } = req.body;
      if (status) order.status = status;
      if (rejectedReason) order.rejectedReason = rejectedReason;
      if (report) order.report = report; // employee report field
      await order.save();

      // Notify Customer
      const notification = await Notification.create({
        userId: order.customerId,
        orderId: order._id,
        type: 'order_status_changed',
        title: `Order ${order.orderNumber} Updated`,
        message: `Your order status has been updated to ${order.status}.`,
      });
      io.to(`user-${order.customerId}`).emit('newNotification', notification);
      io.to(`user-${order.customerId}`).emit('orderUpdate', order);

      // Notify Admins
      const admins = await User.find({ role: 'admin' });
      admins.forEach(a => io.to(`user-${a._id}`).emit('adminOrderUpdate', order));

      return res.json({ success: true, order });
    }

    if (order.customerId.toString() === req.user._id.toString()) {
      if (req.body.notes) order.notes = req.body.notes;
      await order.save();
      return res.json({ success: true, order });
    }

    res.status(403).json({ success: false, message: 'Not authorized' });
  } catch (error) {
    console.error('❌ Failed to update order:', error);
    res.status(500).json({ success: false, message: 'Failed to update order', error: error.message });
  }
});

/* ================================
   DELETE ORDER
================================ */
router.delete('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (req.user.role !== 'admin' && order.customerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete order' });
    }

    if (order.files?.length) {
      order.files.forEach(f => {
        const filePath = path.join(uploadDir, f.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      });
    }

    if (order.assignedTo) await User.findByIdAndUpdate(order.assignedTo, { $pull: { assignedOrders: order._id } });

    await order.deleteOne();

    // Notify customer and admins
    const io = req.app.get('io');
    io.to(`user-${order.customerId}`).emit('orderDeleted', { orderId: order._id });
    const admins = await User.find({ role: 'admin' });
    admins.forEach(a => io.to(`user-${a._id}`).emit('orderDeleted', { orderId: order._id }));

    res.json({ success: true, message: 'Order deleted successfully' });
  } catch (error) {
    console.error('❌ Failed to delete order:', error);
    res.status(500).json({ success: false, message: 'Failed to delete order', error: error.message });
  }
});

module.exports = router;
