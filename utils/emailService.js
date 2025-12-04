const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const streamBuffers = require('stream-buffers');

/* ===============================
   SETUP EMAIL TRANSPORTER
=============================== */
let transporter = null;

if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
} else {
  console.warn('⚠️ Email credentials not configured. Emails will not be sent.');
}

/* ===============================
   GENERAL EMAIL FUNCTION
=============================== */
exports.sendEmail = async ({ email, subject, html, attachments }) => {
  if (!transporter) {
    console.warn('⚠️ Email service not configured. Skipping sendEmail.');
    return null;
  }

  try {
    const mailOptions = {
      from: `Swiss Project <${process.env.EMAIL_USER}>`,
      to: email,
      subject,
      html,
      attachments: attachments || [],
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${email}: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`❌ Failed to send email to ${email}:`, error);
    return null;
  }
};

/* ===============================
   ORDER NOTIFICATIONS
=============================== */
exports.sendOrderNotification = async (adminEmail, orderNumber, customerName) => {
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #FFDD00; background: #000; padding: 15px; text-align: center;">
        New Order Received
      </h2>
      <div style="padding: 20px; background: #f9f9f9; border-radius: 5px; margin-top: 20px;">
        <p><strong>Order Number:</strong> ${orderNumber}</p>
        <p><strong>Customer:</strong> ${customerName}</p>
        <p>A new order has been placed and is awaiting your review.</p>
        <p style="margin-top: 20px;">
          <a href="${process.env.FRONTEND_URL}/admin/orders" 
             style="background: #FFDD00; color: #000; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
            View Orders
          </a>
        </p>
      </div>
    </div>
  `;

  return await exports.sendEmail({
    email: adminEmail,
    subject: `New Order: ${orderNumber}`,
    html,
  });
};

exports.sendOrderStatusUpdate = async (customerEmail, orderNumber, status) => {
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #FFDD00; background: #000; padding: 15px; text-align: center;">
        Order Status Update
      </h2>
      <div style="padding: 20px; background: #f9f9f9; border-radius: 5px; margin-top: 20px;">
        <p><strong>Order Number:</strong> ${orderNumber}</p>
        <p><strong>New Status:</strong> ${status}</p>
        <p>Your order status has been updated.</p>
        <p style="margin-top: 20px;">
          <a href="${process.env.FRONTEND_URL}/customer/orders" 
             style="background: #FFDD00; color: #000; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
            View Order
          </a>
        </p>
      </div>
    </div>
  `;

  return await exports.sendEmail({
    email: customerEmail,
    subject: `Order ${orderNumber} Status Update`,
    html,
  });
};

/* ===============================
   GENERATE PDF INVOICE
=============================== */
const generateInvoicePDF = async (invoice, customer) => {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const bufferStream = new streamBuffers.WritableStreamBuffer();

  doc.pipe(bufferStream);

  // Header
  doc.fontSize(20).text('Swiss Project', { align: 'center' });
  doc.moveDown();
  doc.fontSize(16).text(`Invoice: ${invoice.invoiceNumber}`, { align: 'center' });
  doc.moveDown(2);

  // Customer Info
  doc.fontSize(12).text(`Billed To: ${customer.name}`);
  if (customer.address) {
    doc.text(`${customer.address.street}, ${customer.address.city}, ${customer.address.state}, ${customer.address.zipCode}`);
  }
  doc.moveDown();

  // Table Header
  doc.fontSize(12).text('Items:', { underline: true });
  invoice.items.forEach((item, i) => {
    doc.text(`${i + 1}. ${item.description} - ${item.quantity} × $${item.price.toFixed(2)} = $${(item.quantity * item.price).toFixed(2)}`);
  });

  doc.moveDown();
  doc.text(`Subtotal: $${invoice.subtotal.toFixed(2)}`);
  doc.text(`Tax: $${invoice.tax.toFixed(2)}`);
  doc.text(`Total: $${invoice.total.toFixed(2)}`);
  doc.moveDown();
  doc.text(`Notes: ${invoice.notes || 'N/A'}`);
  if (invoice.dueDate) doc.text(`Due Date: ${invoice.dueDate.toDateString()}`);

  doc.end();

  return new Promise((resolve, reject) => {
    bufferStream.on('finish', () => resolve(bufferStream.getContents()));
    bufferStream.on('error', reject);
  });
};

/* ===============================
   INVOICE EMAIL WITH PDF
=============================== */
exports.sendInvoiceEmail = async (customer, invoice) => {
  if (!customer.email) {
    console.warn('⚠️ Customer has no email. Skipping invoice email.');
    return null;
  }

  const paymentLink = `${process.env.FRONTEND_URL}/invoices/pay/${invoice._id}`;
  const pdfBuffer = await generateInvoicePDF(invoice, customer);

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #FFDD00; background: #000; padding: 15px; text-align: center;">
        New Invoice: ${invoice.invoiceNumber}
      </h2>
      <div style="padding: 20px; background: #f9f9f9; border-radius: 5px; margin-top: 20px;">
        <p>Hello <strong>${customer.name}</strong>,</p>
        <p>You have a new invoice from Swiss Project.</p>
        <p><strong>Total:</strong> $${invoice.total.toFixed(2)}</p>
        <p style="margin-top: 20px;">
          <a href="${paymentLink}" 
             style="background: #FFDD00; color: #000; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Pay Invoice
          </a>
        </p>
        <p>Attached is a PDF copy of your invoice.</p>
      </div>
    </div>
  `;

  return await exports.sendEmail({
    email: customer.email,
    subject: `Invoice ${invoice.invoiceNumber} - Swiss Project`,
    html,
    attachments: [
      {
        filename: `${invoice.invoiceNumber}.pdf`,
        content: pdfBuffer,
      },
    ],
  });
};

/* ===============================
   ORDER ASSIGNMENT EMAIL (Single)
=============================== */
exports.sendOrderAssignmentEmail = async (employee, order, assignedBy = 'Admin') => {
  if (!employee.email) {
    console.warn('⚠️ Employee has no email. Skipping assignment email.');
    return null;
  }

  const orderLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/employee/orders`;

  // Get design name based on order type
  const designName = order.orderType === 'patches'
    ? (order.patchDesignName || 'N/A')
    : (order.designName || 'N/A');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #fff;">
      <!-- Header -->
      <div style="background: #000; padding: 30px; text-align: center;">
        <h1 style="color: #FFDD00; margin: 0; font-size: 28px;">Swiss Project</h1>
        <p style="color: #fff; margin: 10px 0 0 0; font-size: 14px;">Order Management System</p>
      </div>

      <!-- Main Content -->
      <div style="padding: 40px 30px; background: #f9f9f9;">
        <h2 style="color: #333; margin-top: 0; font-size: 24px;">🎯 New Order Assigned to You</h2>
        
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Hello <strong>${employee.name}</strong>,
        </p>
        
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          You have been assigned a new order by <strong>${assignedBy}</strong>. Please review the details below:
        </p>

        <!-- Order Details Card -->
        <div style="background: #fff; border-left: 4px solid #FFDD00; padding: 20px; margin: 25px 0; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h3 style="color: #000; margin-top: 0; font-size: 18px;">📋 Order Details</h3>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: 600; width: 40%;">Order Number:</td>
              <td style="padding: 8px 0; color: #333; font-weight: bold;">${order.orderNumber}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: 600;">Order Type:</td>
              <td style="padding: 8px 0; color: #333;">
                <span style="background: #FFDD00; color: #000; padding: 4px 12px; border-radius: 12px; font-weight: 600; font-size: 14px;">
                  ${order.orderType.toUpperCase()}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: 600;">Design Name:</td>
              <td style="padding: 8px 0; color: #333;">${designName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: 600;">Customer:</td>
              <td style="padding: 8px 0; color: #333;">${order.customerId?.name || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: 600;">Current Status:</td>
              <td style="padding: 8px 0; color: #333;">
                <span style="background: #e3f2fd; color: #1976d2; padding: 4px 12px; border-radius: 12px; font-weight: 600; font-size: 14px;">
                  ${order.status}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: 600;">Assigned Date:</td>
              <td style="padding: 8px 0; color: #333;">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
            </tr>
          </table>
        </div>

        ${order.notes ? `
        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <p style="margin: 0; color: #856404; font-size: 14px;">
            <strong>📝 Notes:</strong> ${order.notes}
          </p>
        </div>
        ` : ''}

        <!-- Action Button -->
        <div style="text-align: center; margin: 35px 0 25px 0;">
          <a href="${orderLink}" 
             style="background: #FFDD00; color: #000; padding: 14px 35px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px; box-shadow: 0 3px 6px rgba(0,0,0,0.16);">
            View My Orders →
          </a>
        </div>

        <p style="color: #666; font-size: 14px; line-height: 1.6; margin-top: 30px;">
          Please log in to your employee portal to view the complete order details and manage this assignment.
        </p>
      </div>

      <!-- Footer -->
      <div style="background: #000; padding: 20px 30px; text-align: center; color: #999; font-size: 13px;">
        <p style="margin: 5px 0;">© ${new Date().getFullYear()} Swiss Project. All rights reserved.</p>
        <p style="margin: 5px 0;">This is an automated notification. Please do not reply to this email.</p>
      </div>
    </div>
  `;

  return await exports.sendEmail({
    email: employee.email,
    subject: `🎯 New Order Assigned: ${order.orderNumber}`,
    html,
  });
};

/* ===============================
   BULK ORDER ASSIGNMENT EMAIL
=============================== */
exports.sendBulkOrderAssignmentEmail = async (employee, orders, assignedBy = 'Admin') => {
  if (!employee.email) {
    console.warn('⚠️ Employee has no email. Skipping bulk assignment email.');
    return null;
  }

  const orderLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/employee/orders`;
  const orderCount = orders.length;

  // Create order rows for the table
  const orderRows = orders.map((order, index) => {
    const designName = order.orderType === 'patches'
      ? (order.patchDesignName || 'N/A')
      : (order.designName || 'N/A');

    return `
      <tr style="${index % 2 === 0 ? 'background: #f9f9f9;' : 'background: #fff;'}">
        <td style="padding: 12px 8px; border-bottom: 1px solid #e0e0e0; text-align: center;">${index + 1}</td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #e0e0e0; font-weight: 600; color: #333;">${order.orderNumber}</td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #e0e0e0;">
          <span style="background: #FFDD00; color: #000; padding: 3px 10px; border-radius: 10px; font-size: 12px; font-weight: 600;">
            ${order.orderType.toUpperCase()}
          </span>
        </td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #e0e0e0; color: #555;">${designName}</td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #e0e0e0; color: #555;">${order.customerId?.name || 'N/A'}</td>
      </tr>
    `;
  }).join('');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 750px; margin: 0 auto; background: #fff;">
      <!-- Header -->
      <div style="background: #000; padding: 30px; text-align: center;">
        <h1 style="color: #FFDD00; margin: 0; font-size: 28px;">Swiss Project</h1>
        <p style="color: #fff; margin: 10px 0 0 0; font-size: 14px;">Order Management System</p>
      </div>

      <!-- Main Content -->
      <div style="padding: 40px 30px; background: #f9f9f9;">
        <h2 style="color: #333; margin-top: 0; font-size: 24px;">🎯 Multiple Orders Assigned to You</h2>
        
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Hello <strong>${employee.name}</strong>,
        </p>
        
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          You have been assigned <strong style="color: #FFDD00; background: #000; padding: 3px 10px; border-radius: 4px;">${orderCount}</strong> new orders by <strong>${assignedBy}</strong>.
        </p>

        <!-- Summary Card -->
        <div style="background: linear-gradient(135deg, #FFDD00 0%, #FFC700 100%); padding: 25px; margin: 25px 0; border-radius: 8px; text-align: center; box-shadow: 0 4px 8px rgba(0,0,0,0.15);">
          <h3 style="color: #000; margin: 0 0 10px 0; font-size: 20px;">📦 Assignment Summary</h3>
          <p style="color: #000; margin: 0; font-size: 36px; font-weight: bold;">${orderCount}</p>
          <p style="color: #000; margin: 5px 0 0 0; font-size: 16px;">New Orders</p>
          <p style="color: #333; margin: 15px 0 0 0; font-size: 14px;">Assigned on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        <!-- Orders Table -->
        <div style="background: #fff; padding: 20px; margin: 25px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow-x: auto;">
          <h3 style="color: #000; margin-top: 0; font-size: 18px; border-bottom: 3px solid #FFDD00; padding-bottom: 10px;">📋 Order Details</h3>
          
          <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
            <thead>
              <tr style="background: #000; color: #FFDD00;">
                <th style="padding: 12px 8px; text-align: center; font-weight: 600;">#</th>
                <th style="padding: 12px 8px; text-align: left; font-weight: 600;">Order Number</th>
                <th style="padding: 12px 8px; text-align: left; font-weight: 600;">Type</th>
                <th style="padding: 12px 8px; text-align: left; font-weight: 600;">Design Name</th>
                <th style="padding: 12px 8px; text-align: left; font-weight: 600;">Customer</th>
              </tr>
            </thead>
            <tbody>
              ${orderRows}
            </tbody>
          </table>
        </div>

        <!-- Action Button -->
        <div style="text-align: center; margin: 35px 0 25px 0;">
          <a href="${orderLink}" 
             style="background: #FFDD00; color: #000; padding: 14px 35px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px; box-shadow: 0 3px 6px rgba(0,0,0,0.16);">
            View All My Orders →
          </a>
        </div>

        <p style="color: #666; font-size: 14px; line-height: 1.6; margin-top: 30px; text-align: center;">
          Please log in to your employee portal to view complete details and manage these assignments.
        </p>
      </div>

      <!-- Footer -->
      <div style="background: #000; padding: 20px 30px; text-align: center; color: #999; font-size: 13px;">
        <p style="margin: 5px 0;">© ${new Date().getFullYear()} Swiss Project. All rights reserved.</p>
        <p style="margin: 5px 0;">This is an automated notification. Please do not reply to this email.</p>
      </div>
    </div>
  `;

  return await exports.sendEmail({
    email: employee.email,
    subject: `🎯 ${orderCount} New Orders Assigned to You`,
    html,
  });
};

/* ===============================
   CUSTOMER ORDER CONFIRMATION
=============================== */
exports.sendCustomerOrderConfirmation = async (customer, order) => {
  if (!customer.email) {
    console.warn('⚠️ Customer has no email. Skipping order confirmation email.');
    return null;
  }

  // Get design name based on order type
  const designName = order.orderType === 'patches'
    ? (order.patchDesignName || 'N/A')
    : (order.designName || 'N/A');

  const orderLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/customer/orders`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #fff;">
      <!-- Header -->
      <div style="background: #000; padding: 30px; text-align: center;">
        <h1 style="color: #FFDD00; margin: 0; font-size: 28px;">Swiss Project</h1>
        <p style="color: #fff; margin: 10px 0 0 0; font-size: 14px;">Order Management System</p>
      </div>

      <!-- Main Content -->
      <div style="padding: 40px 30px; background: #f9f9f9;">
        <h2 style="color: #333; margin-top: 0; font-size: 24px;">✅ Order Placed Successfully!</h2>
        
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Hello <strong>${customer.name}</strong>,
        </p>
        
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Thank you for placing your order with Swiss Project! Your order has been received and is being processed.
        </p>

        <!-- Order Details Card -->
        <div style="background: #fff; border-left: 4px solid #FFDD00; padding: 20px; margin: 25px 0; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h3 style="color: #000; margin-top: 0; font-size: 18px;">📋 Order Details</h3>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: 600; width: 40%;">Order Number:</td>
              <td style="padding: 8px 0; color: #333; font-weight: bold;">${order.orderNumber}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: 600;">Order Type:</td>
              <td style="padding: 8px 0; color: #333;">
                <span style="background: #FFDD00; color: #000; padding: 4px 12px; border-radius: 12px; font-weight: 600; font-size: 14px;">
                  ${order.orderType.toUpperCase()}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: 600;">Design Name:</td>
              <td style="padding: 8px 0; color: #333;">${designName}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: 600;">Status:</td>
              <td style="padding: 8px 0; color: #333;">
                <span style="background: #e3f2fd; color: #1976d2; padding: 4px 12px; border-radius: 12px; font-weight: 600; font-size: 14px;">
                  ${order.status}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: 600;">Order Date:</td>
              <td style="padding: 8px 0; color: #333;">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
            </tr>
          </table>
        </div>

        ${order.notes ? `
        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <p style="margin: 0; color: #856404; font-size: 14px;">
            <strong>📝 Notes:</strong> ${order.notes}
          </p>
        </div>
        ` : ''}

        <!-- Action Button -->
        <div style="text-align: center; margin: 35px 0 25px 0;">
          <a href="${orderLink}" 
             style="background: #FFDD00; color: #000; padding: 14px 35px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px; box-shadow: 0 3px 6px rgba(0,0,0,0.16);">
            View My Orders →
          </a>
        </div>

        <p style="color: #666; font-size: 14px; line-height: 1.6; margin-top: 30px;">
          We will keep you updated via email as your order progresses. You can also track your order status anytime by logging into your customer portal.
        </p>
      </div>

      <!-- Footer -->
      <div style="background: #000; padding: 20px 30px; text-align: center; color: #999; font-size: 13px;">
        <p style="margin: 5px 0;">© ${new Date().getFullYear()} Swiss Project. All rights reserved.</p>
        <p style="margin: 5px 0;">This is an automated notification. Please do not reply to this email.</p>
      </div>
    </div>
  `;

  return await exports.sendEmail({
    email: customer.email,
    subject: `✅ Order Confirmed: ${order.orderNumber}`,
    html,
  });
};


