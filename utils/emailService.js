const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const streamBuffers = require("stream-buffers");

/* ===============================
   SETUP EMAIL TRANSPORTER
=============================== */

/* ===============================
   GENERAL EMAIL FUNCTION
=============================== */
const Resend = require("resend").Resend;

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async ({ email, subject, html }) => {
  try {
    const res = await resend.emails.send({
      from: "SwissEmbro <no-reply@swissembropatches.org>",
      to: [email],
      subject,
      html,
    });

    console.log(`✅ Email sent to ${email}`, res);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send email to ${email}:`, error);
    return null;
  }
};

exports.sendEmail = sendEmail;

/* ===============================
   GENERATE PDF INVOICE
=============================== */
const generateInvoicePDF = async (invoice, customer) => {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const bufferStream = new streamBuffers.WritableStreamBuffer();

  doc.pipe(bufferStream);

  // Header
  doc.fontSize(20).text("SwissEmbro", { align: "center" });
  doc.moveDown();
  doc
    .fontSize(16)
    .text(`Invoice: ${invoice.invoiceNumber}`, { align: "center" });
  doc.moveDown(2);

  // Customer Info
  doc.fontSize(12).text(`Billed To: ${customer.name}`);
  if (customer.address) {
    doc.text(
      `${customer.address.street}, ${customer.address.city}, ${customer.address.state}, ${customer.address.zipCode}`
    );
  }
  doc.moveDown();

  // Table Header
  doc.fontSize(12).text("Items:", { underline: true });
  invoice.items.forEach((item, i) => {
    doc.text(
      `${i + 1}. ${item.description} - ${item.quantity} × $${item.price.toFixed(
        2
      )} = $${(item.quantity * item.price).toFixed(2)}`
    );
  });

  doc.moveDown();
  doc.text(`Subtotal: $${invoice.subtotal.toFixed(2)}`);
  doc.text(`Tax: $${invoice.tax.toFixed(2)}`);
  doc.text(`Total: $${invoice.total.toFixed(2)}`);
  doc.moveDown();
  doc.text(`Notes: ${invoice.notes || "N/A"}`);
  if (invoice.dueDate) doc.text(`Due Date: ${invoice.dueDate.toDateString()}`);

  doc.end();

  return new Promise((resolve, reject) => {
    bufferStream.on("finish", () => resolve(bufferStream.getContents()));
    bufferStream.on("error", reject);
  });
};

/* ===============================
   INVOICE EMAIL WITH PDF
=============================== */
exports.sendInvoiceEmail = async (customer, invoice) => {
  if (!customer.email) {
    console.warn("⚠️ Customer has no email. Skipping invoice email.");
    return null;
  }

  const paymentLink = `${
    process.env.FRONTEND_URL || "http://localhost:5173"
  }/invoices/pay/${invoice._id}`;
  const pdfBuffer = await generateInvoicePDF(invoice, customer);

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #FFDD00; background: #000; padding: 15px; text-align: center;">
        New Invoice: ${invoice.invoiceNumber}
      </h2>
      <div style="padding: 20px; background: #f9f9f9; border-radius: 5px; margin-top: 20px;">
        <p>Hello <strong>${customer.name}</strong>,</p>
        <p>You have a new invoice from SwissEmbro.</p>
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

  return sendEmail({
    email: customer.email,
    subject: `Invoice ${invoice.invoiceNumber} - SwissEmbro`,
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
   CUSTOMER ORDER CONFIRMATION
=============================== */
exports.sendCustomerOrderConfirmation = async (customer, order) => {
  if (!customer.email) {
    console.warn(
      "⚠️ Customer has no email. Skipping order confirmation email."
    );
    return null;
  }

  // Get design name based on order type
  const designName =
    order.orderType === "patches"
      ? order.patchDesignName || "N/A"
      : order.designName || "N/A";

  const orderLink = `${
    process.env.FRONTEND_URL || "https://swissembropatches.org/dashboard"
  }/customer/orders`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #fff;">
      <!-- Header -->
      <div style="background: #000; padding: 30px; text-align: center;">
        <h1 style="color: #FFDD00; margin: 0; font-size: 28px;">SwissEmbro</h1>
        <p style="color: #fff; margin: 10px 0 0 0; font-size: 14px;">Order Management System</p>
      </div>

      <!-- Main Content -->
      <div style="padding: 40px 30px; background: #f9f9f9;">
        <h2 style="color: #333; margin-top: 0; font-size: 24px;">✅ Order Placed Successfully!</h2>
        
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Hello <strong>${customer.name}</strong>,
        </p>
        
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Thank you for placing your order with SwissEmbro! Your order has been received and is being processed.
        </p>

        <!-- Order Details Card -->
        <div style="background: #fff; border-left: 4px solid #FFDD00; padding: 20px; margin: 25px 0; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h3 style="color: #000; margin-top: 0; font-size: 18px;">📋 Order Details</h3>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: 600; width: 40%;">Order Number:</td>
              <td style="padding: 8px 0; color: #333; font-weight: bold;">${
                order.orderNumber
              }</td>
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
              <td style="padding: 8px 0; color: #333;">${new Date().toLocaleDateString(
                "en-US",
                { year: "numeric", month: "long", day: "numeric" }
              )}</td>
            </tr>
          </table>
        </div>

        ${
          order.notes
            ? `
        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <p style="margin: 0; color: #856404; font-size: 14px;">
            <strong>📝 Notes:</strong> ${order.notes}
          </p>
        </div>
        `
            : ""
        }

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
        <p style="margin: 5px 0;">© ${new Date().getFullYear()} SwissEmbro. All rights reserved.</p>
        <p style="margin: 5px 0;">This is an automated notification. Please do not reply to this email.</p>
      </div>
    </div>
  `;

  return sendEmail({
    email: customer.email,
    subject: `✅ Order Confirmed: ${order.orderNumber}`,
    html,
  });
};

/* ===============================
   ADMIN NEW ORDER NOTIFICATION
=============================== */
exports.sendAdminNewOrderEmail = async (adminEmail, order, customer) => {
  if (!adminEmail) {
    console.warn("⚠️ Admin has no email. Skipping new order email.");
    return null;
  }

  // Get design name based on order type
  const designName =
    order.orderType === "patches"
      ? order.patchDesignName || "N/A"
      : order.designName || "N/A";

  const orderLink = `${
    process.env.ADMIN_URL || "http://localhost:5174"
  }/orders`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #fff;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #000 0%, #1a1a1a 100%); padding: 30px; text-align: center;">
        <h1 style="color: #FFDD00; margin: 0; font-size: 28px;">SwissEmbro</h1>
        <p style="color: #fff; margin: 10px 0 0 0; font-size: 14px;">SwissEmbro - Admin Notification</p>
      </div>

      <!-- Main Content -->
      <div style="padding: 40px 30px; background: #f9f9f9;">
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          A new order has been placed and is awaiting your review.
        </p>

        <!-- Order Details Card -->
        <div style="background: #fff; border-left: 4px solid #FFDD00; padding: 20px; margin: 25px 0; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h3 style="color: #000; margin-top: 0; font-size: 18px;">📋 Order Details</h3>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 10px 0; color: #666; font-weight: 600; width: 40%; border-bottom: 1px solid #eee;">Order Number:</td>
              <td style="padding: 10px 0; color: #333; font-weight: bold; border-bottom: 1px solid #eee;">${
                order.orderNumber
              }</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #666; font-weight: 600; border-bottom: 1px solid #eee;">Customer:</td>
              <td style="padding: 10px 0; color: #333; border-bottom: 1px solid #eee;">
                <strong>${customer?.name || "N/A"}</strong><br>
                <span style="color: #666; font-size: 13px;">${
                  customer?.email || ""
                }</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #666; font-weight: 600; border-bottom: 1px solid #eee;">Order Type:</td>
              <td style="padding: 10px 0; color: #333; border-bottom: 1px solid #eee;">
                <span style="background: #FFDD00; color: #000; padding: 4px 12px; border-radius: 12px; font-weight: 600; font-size: 14px;">
                  ${(order.orderType || "N/A").toUpperCase()}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #666; font-weight: 600; border-bottom: 1px solid #eee;">Design Name:</td>
              <td style="padding: 10px 0; color: #333; border-bottom: 1px solid #eee;">${designName}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #666; font-weight: 600;">Order Date:</td>
              <td style="padding: 10px 0; color: #333;">${new Date().toLocaleDateString(
                "en-US",
                {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }
              )}</td>
            </tr>
          </table>
        </div>

        ${
          order.notes
            ? `
        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <p style="margin: 0; color: #856404; font-size: 14px;">
            <strong>📝 Customer Notes:</strong> ${order.notes}
          </p>
        </div>
        `
            : ""
        }

        <!-- Action Button -->
        <div style="text-align: center; margin: 35px 0 25px 0;">
          <a href="${orderLink}" 
             style="background: #FFDD00; color: #000; padding: 14px 35px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px; box-shadow: 0 3px 6px rgba(0,0,0,0.16);">
            View Order in Dashboard →
          </a>
        </div>

        <p style="color: #888; font-size: 13px; line-height: 1.6; margin-top: 30px; text-align: center;">
          This order requires your attention. Please review and process it at your earliest convenience.
        </p>
      </div>

      <!-- Footer -->
      <div style="background: #000; padding: 20px 30px; text-align: center; color: #999; font-size: 13px;">
        <p style="margin: 5px 0;">© ${new Date().getFullYear()} SwissEmbro. All rights reserved.</p>
        <p style="margin: 5px 0;">This is an automated notification. Please do not reply to this email.</p>
      </div>
    </div>
  `;

  return sendEmail({
    email: adminEmail,
    subject: `🆕 New Order: ${order.orderNumber} from ${
      customer?.name || "Customer"
    }`,
    html,
  });
};

/* ===============================
   CUSTOMER ORDER STATUS UPDATE
=============================== */
exports.sendCustomerStatusUpdateEmail = async (
  customer,
  order,
  previousStatus
) => {
  if (!customer?.email) {
    console.warn("⚠️ Customer has no email. Skipping status update email.");
    return null;
  }

  const orderLink = `${
    process.env.FRONTEND_URL || "http://localhost:3000"
  }/customer/orders`;

  // Status color mapping
  const statusColors = {
    Pending: { bg: "#fff3cd", text: "#856404" },
    "In Progress": { bg: "#cce5ff", text: "#004085" },
    "Waiting for Approval": { bg: "#d4edda", text: "#155724" },
    Completed: { bg: "#d4edda", text: "#155724" },
    Delivered: { bg: "#d4edda", text: "#155724" },
    "Revision Ready": { bg: "#e2e3e5", text: "#383d41" },
    Rejected: { bg: "#f8d7da", text: "#721c24" },
    Cancelled: { bg: "#f8d7da", text: "#721c24" },
  };

  const statusStyle = statusColors[order.status] || {
    bg: "#e2e3e5",
    text: "#383d41",
  };

  // Get design name based on order type
  const designName =
    order.orderType === "patches"
      ? order.patchDesignName || "N/A"
      : order.designName || "N/A";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #fff;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #000 0%, #1a1a1a 100%); padding: 30px; text-align: center;">
        <h1 style="color: #FFDD00; margin: 0; font-size: 28px;">📦 Order Status Updated</h1>
        <p style="color: #fff; margin: 10px 0 0 0; font-size: 14px;">SwissEmbro - Order Notification</p>
      </div>

      <!-- Main Content -->
      <div style="padding: 40px 30px; background: #f9f9f9;">
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Hello <strong>${customer.name}</strong>,
        </p>
        
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Great news! Your order status has been updated.
        </p>

        <!-- Status Change Card -->
        <div style="background: #fff; padding: 25px; margin: 25px 0; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); text-align: center;">
          <p style="color: #666; margin: 0 0 15px 0; font-size: 14px;">Status Changed From</p>
          <div style="display: inline-block; margin-bottom: 15px;">
            <span style="background: #e2e3e5; color: #383d41; padding: 8px 20px; border-radius: 20px; font-weight: 600; font-size: 16px; text-decoration: line-through;">
              ${previousStatus || "Previous"}
            </span>
          </div>
          <p style="color: #666; margin: 10px 0; font-size: 20px;">↓</p>
          <div style="display: inline-block;">
            <span style="background: ${statusStyle.bg}; color: ${
    statusStyle.text
  }; padding: 12px 25px; border-radius: 25px; font-weight: 700; font-size: 18px; border: 2px solid ${
    statusStyle.text
  };">
              ${order.status}
            </span>
          </div>
        </div>

        <!-- Order Details Card -->
        <div style="background: #fff; border-left: 4px solid #FFDD00; padding: 20px; margin: 25px 0; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h3 style="color: #000; margin-top: 0; font-size: 18px;">📋 Order Details</h3>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: 600; width: 40%;">Order Number:</td>
              <td style="padding: 8px 0; color: #333; font-weight: bold;">${
                order.orderNumber
              }</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: 600;">Order Type:</td>
              <td style="padding: 8px 0; color: #333;">
                <span style="background: #FFDD00; color: #000; padding: 4px 12px; border-radius: 12px; font-weight: 600; font-size: 14px;">
                  ${(order.orderType || "N/A").toUpperCase()}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: 600;">Design Name:</td>
              <td style="padding: 8px 0; color: #333;">${designName}</td>
            </tr>
          </table>
        </div>

        ${
          order.rejectedReason
            ? `
        <div style="background: #f8d7da; border-left: 4px solid #721c24; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <p style="margin: 0; color: #721c24; font-size: 14px;">
            <strong>❌ Reason:</strong> ${order.rejectedReason}
          </p>
        </div>
        `
            : ""
        }

        <!-- Action Button -->
        <div style="text-align: center; margin: 35px 0 25px 0;">
          <a href="${orderLink}" 
             style="background: #FFDD00; color: #000; padding: 14px 35px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px; box-shadow: 0 3px 6px rgba(0,0,0,0.16);">
            View Order Details →
          </a>
        </div>

        <p style="color: #666; font-size: 14px; line-height: 1.6; margin-top: 30px; text-align: center;">
          Thank you for choosing SwissEmbro. We're committed to delivering quality work.
        </p>
      </div>

      <!-- Footer -->
      <div style="background: #000; padding: 20px 30px; text-align: center; color: #999; font-size: 13px;">
        <p style="margin: 5px 0;">© ${new Date().getFullYear()} SwissEmbro. All rights reserved.</p>
        <p style="margin: 5px 0;">Questions? Contact us at support@SwissEmbro.com</p>
      </div>
    </div>
  `;

  return sendEmail({
    email: customer.email,
    subject: `📦 Order ${order.orderNumber} - Status: ${order.status}`,
    html,
  });
};
