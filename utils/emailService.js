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
    bufferStream.on('finish', () => resolve(bufferStream.getBuffer()));
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
