const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Order = require('../models/Order');
const Invoice = require('../models/Invoice');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { sendOrderAssignmentEmail, sendBulkOrderAssignmentEmail, sendCustomerOrderConfirmation, sendAdminNewOrderEmail, sendCustomerStatusUpdateEmail, sendTrackingNumberEmail } = require('../utils/emailService');
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

    // Handle both Multer files and Cloudinary URLs
    let uploadedFiles = [];

    if (req.files?.length > 0) {
      // Old way: Multer uploaded files
      console.log('📁 Processing Multer files:', req.files.length);
      uploadedFiles = req.files.map(f => ({
        url: `/uploads/orders/${f.filename}`,
        filename: f.filename,
        size: f.size,
        mimetype: f.mimetype,
      }));
    } else if (body.files && Array.isArray(body.files) && body.files.length > 0) {
      // New way: Cloudinary URLs sent as JSON
      console.log('☁️ Processing Cloudinary files:', body.files.length);
      uploadedFiles = body.files;
    } else {
      return res.status(400).json({ success: false, message: 'Please upload at least one file.' });
    }

    const orderData = {
      customerId: req.user._id,
      status: 'In Progress',
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
      const requiredFields = ['patchDesignName', 'patchStyle', 'patchAmount', 'patchUnit', 'patchLength', 'patchWidth', 'patchBackingStyle', 'patchQuantity', 'patchAddress'];
      const missing = requiredFields.filter(f => !body[f]);
      if (missing.length) return res.status(400).json({ success: false, message: `Missing patch fields: ${missing.join(', ')}` });

      Object.assign(orderData, { patchDesignName, patchStyle, patchAmount, patchUnit, patchLength, patchWidth, patchBackingStyle, patchQuantity, patchAddress });
      const patchSizeFactor = (parseFloat(patchLength) || 0) * (parseFloat(patchWidth) || 0);
      orderData.items.push({ description: `${patchDesignName} (${patchStyle})`, quantity: parseInt(patchQuantity) || 1, price: 10 + patchSizeFactor });
    }

    // ✅ Create Order
    const order = await Order.create(orderData);

    // ❌ Disable Automatic Invoice Creation (Admin will create manually)
    // const subtotal = order.items.reduce((sum, item) => sum + (parseFloat(item.price) || 0) * (parseInt(item.quantity) || 0), 0);
    // const tax = subtotal * 0.1; // 10%
    // const total = subtotal + tax;
    // const invoice = await Invoice.create({
    //   orderId: order._id,
    //   customerId: order.customerId,
    //   invoiceNumber: `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    //   items: order.items,
    //   subtotal,
    //   tax,
    //   total,
    // });

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
    try {
      const admins = await User.find({ role: 'admin' });
      for (const admin of admins) {
        const adminNotification = await Notification.create({
          userId: admin._id,
          orderId: order._id,
          type: 'order_created',
          title: 'New Order Received',
          message: `New ${order.orderType || 'order'} order ${order.orderNumber} from ${req.user.name || 'customer'}`,
        });
        io.to(`user-${admin._id}`).emit('newNotification', adminNotification);
        io.to(`user-${admin._id}`).emit('newOrder', order);
      }
    } catch (notifError) {
      console.error('⚠️ Failed to send admin notifications (order still created):', notifError);
    }

    // 📧 Send Emails (non-blocking)
    try {
      // Customer confirmation email
      await sendCustomerOrderConfirmation(req.user, order);
      console.log('📧 Customer confirmation email sent');

      // Admin notification emails
      const adminEmail = process.env.ADMIN_EMAIL; // Override with env variable
      if (adminEmail) {
        await sendAdminNewOrderEmail(adminEmail, order, req.user);
      } else {
        const admins = await User.find({ role: 'admin' });
        for (const admin of admins) {
          await sendAdminNewOrderEmail(admin.email, order, req.user);
        }
      }
      console.log('📧 Admin notification emails sent');
    } catch (emailError) {
      console.error('⚠️ Failed to send order emails (order still created):', emailError);
    }

    res.status(201).json({ success: true, order });

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
   GET ORDER STATS (Admin)
================================ */
router.get('/stats', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'employee') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const stats = await Order.aggregate([
      {
        $facet: {
          statusCounts: [
            { $group: { _id: "$status", count: { $sum: 1 } } }
          ],
          typeCounts: [
            { $group: { _id: "$orderType", count: { $sum: 1 } } }
          ],
          totalCount: [
            { $count: "count" }
          ]
        }
      }
    ]);

    const result = stats[0];
    const statusMap = result.statusCounts.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {});
    const typeMap = result.typeCounts.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {});
    const total = result.totalCount[0] ? result.totalCount[0].count : 0;

    res.json({
      success: true,
      stats: {
        pending: statusMap['Pending'] || 0,
        inProgress: statusMap['In Progress'] || 0,
        completed: statusMap['Completed'] || 0,
        rejected: statusMap['Rejected'] || 0,
        patches: typeMap['patches'] || 0,
        digitizing: typeMap['digitizing'] || 0,
        vector: typeMap['vector'] || 0,
        total
      }
    });
  } catch (error) {
    console.error('❌ Failed to fetch stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
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
      .populate('assignedTo', 'name email employeeRole')
      .populate('invoiceId')
      .populate('parentOrderId', 'orderNumber');
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
      .select('-patchAddress') // Exclude patch address for privacy
      .sort({ createdAt: -1 })
      .populate('customerId', '_id') // Only populate ID, no name/email
      .populate('assignedTo', 'name email employeeRole')
      .populate('invoiceId')
      .populate('parentOrderId', 'orderNumber');

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




const { generateOrderPDF } = require('../utils/pdfService');

/* ================================
   DOWNLOAD ORDER PDF
================================ */
router.get('/:id/pdf', protect, async (req, res) => {
  try {
    console.log(`📥 PDF Request for Order ID: ${req.params.id}`);
    const order = await Order.findById(req.params.id).populate('customerId', 'name email');

    if (!order) {
      console.error(`❌ Order not found: ${req.params.id}`);
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    console.log(`📄 Generating PDF for order ${order.orderNumber}...`);
    const pdfBuffer = await generateOrderPDF(order);
    console.log(`✅ PDF Generated. Size: ${pdfBuffer.length} bytes`);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Order-${order.orderNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });

    res.send(pdfBuffer);
    console.log(`📤 PDF sent to client.`);
  } catch (error) {
    console.error('❌ Failed to generate PDF route error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate PDF' });
  }
});

/* ================================
   GET CUSTOMER AGGREGATE DATA (Admin)
================================ */
router.get('/customer-aggregate', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Only admin can access customer aggregates' });

    const { customerId, customerEmail, customerName } = req.query;

    if (!customerId && !customerEmail && !customerName) {
      return res.status(400).json({ success: false, message: 'Provide customerId, customerEmail, or customerName' });
    }

    // Build query to find customer
    let customerQuery = {};
    if (customerId) customerQuery._id = customerId;
    else if (customerEmail) customerQuery.email = new RegExp(customerEmail, 'i');
    else if (customerName) customerQuery.name = new RegExp(customerName, 'i');

    // Find customers matching the query
    const customers = await User.find(customerQuery).select('_id name email');

    if (!customers.length) {
      return res.json({ success: true, aggregates: [] });
    }

    const customerIds = customers.map(c => c._id);

    // Get all orders for these customers
    const orders = await Order.find({ customerId: { $in: customerIds } })
      .populate('invoiceId')
      .sort({ createdAt: -1 });

    // Aggregate data by customer
    const aggregates = customers.map(customer => {
      const customerOrders = orders.filter(o => o.customerId.toString() === customer._id.toString());

      // Calculate total quantity
      let totalQuantity = 0;
      customerOrders.forEach(order => {
        if (order.orderType === 'patches') {
          totalQuantity += order.patchQuantity || 0;
        } else {
          // For vector/digitizing, sum up item quantities
          order.items.forEach(item => {
            totalQuantity += item.quantity || 0;
          });
        }
      });

      // Calculate total paid (from invoices with paid status or completed orders)
      let totalPaid = 0;
      customerOrders.forEach(order => {
        if (order.invoiceId && order.invoiceId.status === 'paid') {
          totalPaid += order.invoiceId.total || 0;
        } else if (order.status === 'Completed' && order.invoiceId) {
          totalPaid += order.invoiceId.total || 0;
        }
      });

      // Group by status
      const ordersByStatus = {};
      customerOrders.forEach(order => {
        ordersByStatus[order.status] = (ordersByStatus[order.status] || 0) + 1;
      });

      return {
        customer: {
          _id: customer._id,
          name: customer.name,
          email: customer.email
        },
        totalOrders: customerOrders.length,
        totalQuantity,
        totalPaid: totalPaid.toFixed(2),
        ordersByStatus,
        orders: customerOrders
      };
    });

    res.json({ success: true, aggregates });
  } catch (error) {
    console.error('❌ Failed to fetch customer aggregates:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch customer aggregates', error: error.message });
  }
});

/* ================================
   GET EMPLOYEE ANALYTICS (Admin)
================================ */
router.get('/employee-analytics', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Only admin can access employee analytics' });

    const { startDate, endDate } = req.query;

    // Get all employees
    const employees = await User.find({ role: 'employee' }).select('name email employeeRole');

    // Build date filter if provided
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    // Get all orders (with optional date filter)
    const allOrders = await Order.find(dateFilter)
      .populate('assignedTo', 'name email')
      .populate('customerId', 'name email')
      .sort({ createdAt: -1 });

    // Build analytics for each employee
    const analytics = employees.map(employee => {
      const assignedOrders = allOrders.filter(o => o.assignedTo?._id.toString() === employee._id.toString());

      const pending = assignedOrders.filter(o => o.status === 'Pending' || o.status === 'In Progress');
      const inProgress = assignedOrders.filter(o => o.status === 'In Progress');
      const completed = assignedOrders.filter(o => o.status === 'Completed');
      const rejected = assignedOrders.filter(o => o.status === 'Rejected');

      // Calculate average completion time for completed orders
      let avgCompletionTime = 0;
      if (completed.length > 0) {
        const completionTimes = completed.map(o => {
          const created = new Date(o.createdAt);
          const updated = new Date(o.updatedAt);
          return (updated - created) / (1000 * 60 * 60 * 24); // days
        });
        avgCompletionTime = (completionTimes.reduce((a, b) => a + b, 0) / completed.length).toFixed(2);
      }

      // Recent completed orders with details
      const recentCompleted = completed.slice(0, 10).map(o => ({
        _id: o._id,
        orderNumber: o.orderNumber,
        orderType: o.orderType,
        designName: o.designName || o.patchDesignName || '-',
        customerName: o.customerId?.name || '-',
        status: o.status,
        completedAt: o.updatedAt,
        createdAt: o.createdAt
      }));

      return {
        employee: {
          _id: employee._id,
          name: employee.name,
          email: employee.email,
          role: employee.employeeRole
        },
        totalAssigned: assignedOrders.length,
        pending: pending.length,
        inProgress: inProgress.length,
        completed: completed.length,
        rejected: rejected.length,
        avgCompletionTimeDays: avgCompletionTime,
        recentCompleted,
        allCompletedOrders: completed.map(o => ({
          _id: o._id,
          orderNumber: o.orderNumber,
          orderType: o.orderType,
          designName: o.designName || o.patchDesignName || '-',
          customerName: o.customerId?.name || '-',
          completedAt: o.updatedAt,
          createdAt: o.createdAt
        }))
      };
    });

    // Also include unassigned orders count
    const unassignedOrders = allOrders.filter(o => !o.assignedTo);

    res.json({
      success: true,
      analytics,
      unassignedCount: unassignedOrders.length,
      totalOrders: allOrders.length
    });
  } catch (error) {
    console.error('❌ Failed to fetch employee analytics:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch employee analytics', error: error.message });
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

    const order = await Order.findById(req.params.id).populate('customerId', 'name');
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

    // 📧 Send Email Notification
    try {
      await sendOrderAssignmentEmail(employee, order);
    } catch (emailErr) {
      console.error('⚠️ Failed to send assignment email:', emailErr);
    }

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

    const orders = await Order.find({ _id: { $in: orderIds } }).populate('customerId', 'name');
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

    // 📧 Send Bulk Email Notification
    try {
      await sendBulkOrderAssignmentEmail(employee, orders);
    } catch (emailErr) {
      console.error('⚠️ Failed to send bulk assignment email:', emailErr);
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
   CUSTOMER APPROVE / REQUEST REVISION
   (MUST BE BEFORE PUT /:id)
================================ */
router.patch('/:id/approve', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.customerId.toString() !== req.user._id.toString()) return res.status(403).json({ success: false, message: 'Not authorized' });

    order.customerApprovalStatus = 'approved';
    await order.save();

    // Notify admin
    const admins = await User.find({ role: 'admin' });
    const io = req.app.get('io');
    admins.forEach(a => io.to(`user-${a._id}`).emit('adminOrderUpdate', order));
    io.to(`user-${order.customerId}`).emit('orderUpdate', order);

    res.json({ success: true, order });
  } catch (error) {
    console.error('❌ Failed to approve design:', error);
    res.status(500).json({ success: false, message: 'Failed to approve design', error: error.message });
  }
});

router.patch('/:id/revision-request', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.customerId.toString() !== req.user._id.toString()) return res.status(403).json({ success: false, message: 'Not authorized' });

    order.customerApprovalStatus = 'revision_requested';
    if (req.body.comments) {
      order.notes = (order.notes || '') + '\nRevision Request: ' + req.body.comments;
    }
    await order.save();

    const io = req.app.get('io');
    const admins = await User.find({ role: 'admin' });
    admins.forEach(a => io.to(`user-${a._id}`).emit('adminOrderUpdate', order));
    io.to(`user-${order.customerId}`).emit('orderUpdate', order);

    res.json({ success: true, order });
  } catch (error) {
    console.error('❌ Failed to request revision:', error);
    res.status(500).json({ success: false, message: 'Failed to request revision', error: error.message });
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
      const { status, rejectedReason, report, trackingNumber } = req.body;
      const previousStatus = order.status; // Capture previous status for email
      const previousTrackingNumber = order.trackingNumber; // Capture previous tracking number

      if (status) order.status = status;
      if (rejectedReason) order.rejectedReason = rejectedReason;
      if (report) order.report = report; // employee report field
      if (trackingNumber !== undefined) order.trackingNumber = trackingNumber; // admin can set tracking number
      await order.save();

      // Notify Customer of status change (only if status actually changed)
      if (status && status !== previousStatus) {
        const notification = await Notification.create({
          userId: order.customerId,
          orderId: order._id,
          type: 'order_status_changed',
          title: `Order ${order.orderNumber} Updated`,
          message: `Your order status has been updated to ${order.status}.`,
        });
        io.to(`user-${order.customerId}`).emit('newNotification', notification);
      }

      // Always emit order update for real-time sync
      io.to(`user-${order.customerId}`).emit('orderUpdate', order);

      // Notify Admins
      const admins = await User.find({ role: 'admin' });
      admins.forEach(a => io.to(`user-${a._id}`).emit('adminOrderUpdate', order));

      // 📧 Send status update email to customer (non-blocking)
      if (status && status !== previousStatus) {
        try {
          const customer = await User.findById(order.customerId);
          if (customer) {
            await sendCustomerStatusUpdateEmail(customer, order, previousStatus);
            console.log(`📧 Status update email sent to ${customer.email}`);
          }
        } catch (emailError) {
          console.error('⚠️ Failed to send status update email:', emailError);
        }
      }

      // 🚚 Send tracking number update notification and email (non-blocking)
      if (trackingNumber && trackingNumber !== previousTrackingNumber && order.orderType === 'patches') {
        try {
          const customer = await User.findById(order.customerId);
          if (customer) {
            // Create tracking number notification
            const trackingNotification = await Notification.create({
              userId: order.customerId,
              orderId: order._id,
              type: 'tracking_number_added',
              title: `🚚 Tracking Number Added`,
              message: `Your order ${order.orderNumber} has been shipped! Tracking number: ${trackingNumber}`,
            });
            io.to(`user-${order.customerId}`).emit('newNotification', trackingNotification);

            // Send tracking number email
            await sendTrackingNumberEmail(customer, order, trackingNumber);
            console.log(`📧 Tracking number email sent to ${customer.email}`);
          }
        } catch (emailError) {
          console.error('⚠️ Failed to send tracking number notification/email:', emailError);
        }
      }

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
   SEND EMAIL TO CUSTOMER (Admin)
=============================== */
const { sendCustomOrderEmail } = require('../utils/emailService');

router.post('/:id/email', protect, upload.array('files', 10), async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admin can send emails' });
    }

    const order = await Order.findById(req.params.id).populate('customerId', 'email name');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (!order.customerId?.email) {
      return res.status(400).json({ success: false, message: 'Customer has no email address' });
    }

    // Process attachments
    const attachments = (req.files || []).map(file => ({
      filename: file.originalname,
      content: fs.readFileSync(file.path),
      contentType: file.mimetype
    }));

    await sendCustomOrderEmail(
      order.customerId.email,
      order.orderNumber,
      req.body.message,
      attachments
    );

    // Cleanup temp files
    if (req.files) {
      req.files.forEach(f => {
        try { fs.unlinkSync(f.path); } catch (e) { console.error('Failed to cleanup file:', f.path); }
      });
    }

    res.json({ success: true, message: 'Email sent successfully' });

  } catch (error) {
    console.error('❌ Failed to send email:', error);
    // Cleanup on error
    if (req.files) {
      req.files.forEach(f => {
        try { fs.unlinkSync(f.path); } catch (e) { /* ignore */ }
      });
    }
    res.status(500).json({ success: false, message: 'Failed to send email', error: error.message });
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
/* ================================
   UPLOAD SAMPLE IMAGE (Admin → Customer)
================================ */
router.post('/:id/sample', protect, upload.single('file'), async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Only admin can upload sample' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Check if multiple files are provided (new preferred way)
    if (req.body.files && Array.isArray(req.body.files)) {
      console.log(`☁️ Processing ${req.body.files.length} Cloudinary sample uploads`);
      req.body.files.forEach(file => {
        order.sampleImages.push({
          url: file.url,
          filename: file.filename || file.name || 'sample.jpg',
          type: 'initial',
          comments: req.body.comments || '',
          uploadedAt: new Date()
        });
      });
    }
    // Check if single Cloudinary URL is provided (backward compatibility)
    else if (req.body.cloudinaryUrl) {
      console.log('☁️ Processing single Cloudinary sample upload');
      order.sampleImages.push({
        url: req.body.cloudinaryUrl,
        filename: req.body.filename || 'sample.jpg',
        type: 'initial',
        comments: req.body.comments || '',
        uploadedAt: new Date()
      });
    }
    // Check if Multer file is provided (backward compatibility)
    else if (req.file) {
      console.log('📁 Processing Multer sample upload');
      order.sampleImages.push({
        url: `/uploads/orders/${req.file.filename}`,
        filename: req.file.filename,
        type: 'initial',
        comments: req.body.comments || '',
        uploadedAt: new Date()
      });
    }
    else {
      return res.status(400).json({ success: false, message: 'Please upload sample file(s) or provide Cloudinary URL(s)' });
    }
    order.status = 'Waiting for Approval';
    await order.save();

    // Notify customer
    const notification = await Notification.create({
      userId: order.customerId,
      orderId: order._id,
      type: 'sample_uploaded',
      title: 'Sample Uploaded',
      message: `A sample has been uploaded for order ${order.orderNumber}. Approve or Request Revision.`,
    });

    const io = req.app.get('io');
    io.to(`user-${order.customerId}`).emit('newNotification', notification);
    io.to(`user-${order.customerId}`).emit('orderUpdate', order);

    res.json({ success: true, order, sampleImage: order.sampleImages[order.sampleImages.length - 1] });
  } catch (error) {
    console.error('❌ Failed to upload sample:', error);
    res.status(500).json({ success: false, message: 'Failed to upload sample', error: error.message });
  }
});

/* ================================
   UPLOAD REVISION (Admin)
================================ */
router.post('/:id/revision', protect, upload.single('file'), async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Only admin can upload revision' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Check if multiple files are provided (new preferred way)
    if (req.body.files && Array.isArray(req.body.files)) {
      console.log(`☁️ Processing ${req.body.files.length} Cloudinary revision uploads`);
      req.body.files.forEach(file => {
        order.sampleImages.push({
          url: file.url,
          filename: file.filename || file.name || 'revision.jpg',
          type: 'revision',
          comments: req.body.comments || '',
          uploadedAt: new Date()
        });
      });
    }
    // Check if single Cloudinary URL is provided (backward compatibility)
    else if (req.body.cloudinaryUrl) {
      console.log('☁️ Processing single Cloudinary revision upload');
      order.sampleImages.push({
        url: req.body.cloudinaryUrl,
        filename: req.body.filename || 'revision.jpg',
        type: 'revision',
        comments: req.body.comments || '',
        uploadedAt: new Date()
      });
    }
    // Check if Multer file is provided (backward compatibility)
    else if (req.file) {
      console.log('📁 Processing Multer revision upload');
      order.sampleImages.push({
        url: `/uploads/orders/${req.file.filename}`,
        filename: req.file.filename,
        type: 'revision',
        comments: req.body.comments || '',
        uploadedAt: new Date()
      });
    }
    else {
      return res.status(400).json({ success: false, message: 'Please upload revision file(s) or provide Cloudinary URL(s)' });
    }
    order.status = 'Revision Ready';
    await order.save();

    // Notify customer
    const notification = await Notification.create({
      userId: order.customerId,
      orderId: order._id,
      type: 'revision_uploaded',
      title: 'Revision Uploaded',
      message: `A revised sample has been uploaded for order ${order.orderNumber}. Approve or Request further edits.`,
    });

    const io = req.app.get('io');
    io.to(`user-${order.customerId}`).emit('newNotification', notification);
    io.to(`user-${order.customerId}`).emit('orderUpdate', order);

    res.json({ success: true, order, revisionImage: order.sampleImages[order.sampleImages.length - 1] });
  } catch (error) {
    console.error('❌ Failed to upload revision:', error);
    res.status(500).json({ success: false, message: 'Failed to upload revision', error: error.message });
  }
});

/* ================================
   APPROVE REVISION (Customer)
================================ */
router.patch('/:id/revision-approve', protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.customerId.toString() !== req.user._id.toString()) return res.status(403).json({ success: false, message: 'Not authorized' });

    // order.status = 'Revision Approved'; // ❌ Customer cannot change status
    order.customerApprovalStatus = 'approved';
    await order.save();

    const io = req.app.get('io');
    const admins = await User.find({ role: 'admin' });
    admins.forEach(a => io.to(`user-${a._id}`).emit('adminOrderUpdate', order));
    io.to(`user-${order.customerId}`).emit('orderUpdate', order);

    res.json({ success: true, order });
  } catch (error) {
    console.error('❌ Failed to approve revision:', error);
    res.status(500).json({ success: false, message: 'Failed to approve revision', error: error.message });
  }
});

/* ================================
   CREATE REVISION ORDER (Customer)
================================ */
router.post('/:id/create-revision', protect, async (req, res) => {
  try {
    const parentOrder = await Order.findById(req.params.id).populate('customerId');
    if (!parentOrder) return res.status(404).json({ success: false, message: 'Parent order not found' });

    // Verify the customer owns this order
    if (parentOrder.customerId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Calculate next revision number
    const existingRevisions = await Order.find({ parentOrderId: parentOrder._id });
    const nextRevisionNumber = existingRevisions.length + 1;

    // Create revision order by copying parent order data
    const revisionOrderData = {
      customerId: parentOrder.customerId._id,
      orderType: parentOrder.orderType,
      status: 'In Progress',

      // Copy order-type-specific fields
      designName: parentOrder.designName,
      fileFormat: parentOrder.fileFormat,
      otherInstructions: parentOrder.otherInstructions,

      patchDesignName: parentOrder.patchDesignName,
      patchStyle: parentOrder.patchStyle,
      patchAmount: parentOrder.patchAmount,
      patchUnit: parentOrder.patchUnit,
      patchLength: parentOrder.patchLength,
      patchWidth: parentOrder.patchWidth,
      patchBackingStyle: parentOrder.patchBackingStyle,
      patchQuantity: parentOrder.patchQuantity,
      patchAddress: parentOrder.patchAddress,

      PlacementofDesign: parentOrder.PlacementofDesign,
      CustomMeasurements: parentOrder.CustomMeasurements,
      length: parentOrder.length,
      width: parentOrder.width,
      unit: parentOrder.unit,
      customSizes: parentOrder.customSizes,

      // Copy files and items
      files: parentOrder.files,
      items: parentOrder.items,

      // Revision tracking
      parentOrderId: parentOrder._id,
      isRevision: true,
      revisionNumber: nextRevisionNumber,
      revisionReason: req.body.comments || 'Customer requested revision',

      // Notes
      notes: `Revision ${nextRevisionNumber} of order ${parentOrder.orderNumber}. Reason: ${req.body.comments || 'Not specified'}`,
    };

    const revisionOrder = await Order.create(revisionOrderData);

    // Update parent order status to indicate it has been superseded
    parentOrder.status = 'Superseded';
    await parentOrder.save();

    // Notify admins about the new revision request
    const io = req.app.get('io');
    if (io) {
      const admins = await User.find({ role: 'admin' });
      const notification = await Notification.create({
        userId: admins[0]._id, // First admin
        orderId: revisionOrder._id,
        type: 'revision_requested',
        title: 'Revision Order Created',
        message: `Customer ${parentOrder.customerId.name} created revision order ${revisionOrder.orderNumber} for ${parentOrder.orderNumber}`,
      });

      admins.forEach(admin => {
        io.to(`user-${admin._id}`).emit('newNotification', notification);
        io.to(`user-${admin._id}`).emit('adminOrderUpdate', revisionOrder);
      });
    }

    res.status(201).json({
      success: true,
      message: 'Revision order created successfully',
      revisionOrder: {
        _id: revisionOrder._id,
        orderNumber: revisionOrder.orderNumber,
        orderType: revisionOrder.orderType,
        status: revisionOrder.status,
        parentOrderId: revisionOrder.parentOrderId,
        revisionNumber: revisionOrder.revisionNumber,
      }
    });
  } catch (error) {
    console.error('❌ Failed to create revision order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create revision order',
      error: error.message
    });
  }
});

/* ================================
   EMPLOYEE SUBMIT WORK (Pending Admin Approval)
================================ */
router.post('/:id/employee-submit', protect, async (req, res) => {
  try {
    if (req.user.role !== 'employee') {
      return res.status(403).json({ success: false, message: 'Only employees can submit work' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Verify employee is assigned to this order
    if (!order.assignedTo || order.assignedTo.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this order' });
    }

    const { pendingStatus, pendingFiles, pendingReport, comments } = req.body;

    // Store pending work (NOT sent to customer yet)
    order.employeePendingWork = {
      hasPendingWork: true,
      pendingStatus: pendingStatus || 'Waiting for Approval',
      pendingFiles: pendingFiles || [],
      pendingReport: pendingReport || comments || '',
      submittedAt: new Date(),
      submittedBy: req.user._id,
      rejectionReason: '',
      wasRejected: false
    };

    await order.save();

    // Notify admins about pending work
    const io = req.app.get('io');
    const admins = await User.find({ role: 'admin' });

    for (const admin of admins) {
      const notification = await Notification.create({
        userId: admin._id,
        orderId: order._id,
        type: 'employee_work_pending',
        title: '📋 Employee Work Pending Approval',
        message: `${req.user.name} submitted work for order ${order.orderNumber}. Please review.`,
      });
      io.to(`user-${admin._id}`).emit('newNotification', notification);
      io.to(`user-${admin._id}`).emit('adminOrderUpdate', order);
    }

    console.log(`✅ Employee ${req.user.name} submitted work for order ${order.orderNumber}`);

    res.json({
      success: true,
      message: 'Work submitted for admin review',
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        employeePendingWork: order.employeePendingWork
      }
    });
  } catch (error) {
    console.error('❌ Failed to submit employee work:', error);
    res.status(500).json({ success: false, message: 'Failed to submit work', error: error.message });
  }
});

/* ================================
   ADMIN APPROVE EMPLOYEE WORK
================================ */
router.post('/:id/admin-approve-work', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admin can approve work' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (!order.employeePendingWork?.hasPendingWork) {
      return res.status(400).json({ success: false, message: 'No pending work to approve' });
    }

    const pending = order.employeePendingWork;

    // Move pending files to sampleImages
    if (pending.pendingFiles && pending.pendingFiles.length > 0) {
      pending.pendingFiles.forEach(file => {
        order.sampleImages.push({
          url: file.url,
          filename: file.filename,
          type: 'initial',
          comments: file.comments || pending.pendingReport || '',
          uploadedAt: file.uploadedAt || new Date()
        });
      });
    }

    // Update order status from pending status
    if (pending.pendingStatus) {
      order.status = pending.pendingStatus;
    }

    // Update report if provided
    if (pending.pendingReport) {
      order.report = pending.pendingReport;
    }

    // Clear pending work
    order.employeePendingWork = {
      hasPendingWork: false,
      pendingStatus: '',
      pendingFiles: [],
      pendingReport: '',
      submittedAt: null,
      submittedBy: null,
      rejectionReason: '',
      wasRejected: false
    };

    await order.save();

    const io = req.app.get('io');

    // NOW notify customer (only after admin approval)
    const notification = await Notification.create({
      userId: order.customerId,
      orderId: order._id,
      type: 'sample_uploaded',
      title: 'Sample Uploaded',
      message: `A sample has been uploaded for order ${order.orderNumber}. Approve or Request Revision.`,
    });

    io.to(`user-${order.customerId}`).emit('newNotification', notification);
    io.to(`user-${order.customerId}`).emit('orderUpdate', order);

    // Notify employee that work was approved
    if (pending.submittedBy) {
      const empNotification = await Notification.create({
        userId: pending.submittedBy,
        orderId: order._id,
        type: 'work_approved',
        title: '✅ Work Approved',
        message: `Your work for order ${order.orderNumber} has been approved by admin.`,
      });
      io.to(`user-${pending.submittedBy}`).emit('newNotification', empNotification);
    }

    console.log(`✅ Admin approved work for order ${order.orderNumber}`);

    res.json({ success: true, message: 'Work approved and sent to customer', order });
  } catch (error) {
    console.error('❌ Failed to approve employee work:', error);
    res.status(500).json({ success: false, message: 'Failed to approve work', error: error.message });
  }
});

/* ================================
   ADMIN REJECT EMPLOYEE WORK
================================ */
router.post('/:id/admin-reject-work', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admin can reject work' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (!order.employeePendingWork?.hasPendingWork) {
      return res.status(400).json({ success: false, message: 'No pending work to reject' });
    }

    const { rejectionReason } = req.body;
    const submittedBy = order.employeePendingWork.submittedBy;

    // Mark as rejected but keep files so employee can see what was rejected
    order.employeePendingWork = {
      hasPendingWork: false,
      pendingStatus: order.employeePendingWork.pendingStatus,
      pendingFiles: order.employeePendingWork.pendingFiles,
      pendingReport: order.employeePendingWork.pendingReport,
      submittedAt: order.employeePendingWork.submittedAt,
      submittedBy: submittedBy,
      rejectionReason: rejectionReason || 'Work needs revision',
      wasRejected: true
    };

    await order.save();

    const io = req.app.get('io');

    // Notify employee about rejection
    if (submittedBy) {
      const notification = await Notification.create({
        userId: submittedBy,
        orderId: order._id,
        type: 'work_rejected',
        title: '❌ Work Rejected',
        message: `Your work for order ${order.orderNumber} was rejected. Reason: ${rejectionReason || 'Work needs revision'}`,
      });
      io.to(`user-${submittedBy}`).emit('newNotification', notification);
      io.to(`user-${submittedBy}`).emit('orderUpdate', order);
    }

    console.log(`❌ Admin rejected work for order ${order.orderNumber}`);

    res.json({ success: true, message: 'Work rejected. Employee has been notified.', order });
  } catch (error) {
    console.error('❌ Failed to reject employee work:', error);
    res.status(500).json({ success: false, message: 'Failed to reject work', error: error.message });
  }
});

/* ================================
   GET ORDERS WITH PENDING WORK (Admin)
================================ */
router.get('/pending-employee-work', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only admin can view pending work' });
    }

    const orders = await Order.find({ 'employeePendingWork.hasPendingWork': true })
      .sort({ 'employeePendingWork.submittedAt': -1 })
      .populate('customerId', 'name email')
      .populate('assignedTo', 'name email employeeRole')
      .populate('employeePendingWork.submittedBy', 'name email');

    res.json({ success: true, count: orders.length, orders });
  } catch (error) {
    console.error('❌ Failed to fetch pending work:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pending work', error: error.message });
  }
});

module.exports = router;
