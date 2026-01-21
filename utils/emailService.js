const { Resend } = require("resend");
const PDFDocument = require("pdfkit");
const streamBuffers = require("stream-buffers");
const path = require("path");
const fs = require("fs");

/* ===============================
   SETUP RESEND CLIENT
=============================== */
let resend = null;

if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
} else {
  console.warn("⚠️ Resend API Key not configured. Emails will not be sent.");
}

/* ===============================
   GENERAL EMAIL FUNCTION
=============================== */
exports.sendEmail = async ({ email, subject, html, attachments, bcc }) => {
  if (!resend) {
    console.warn("⚠️ Email service not configured. Skipping sendEmail.");
    return null;
  }

  try {
    const fromEmail = process.env.EMAIL_FROM || "onboarding@resend.dev";

    const emailOptions = {
      from: `Swissembro Patches <${fromEmail}>`,
      to: email,
      subject,
      html,
    };

    if (bcc) {
      emailOptions.bcc = bcc;
    }

    if (attachments && attachments.length > 0) {
      emailOptions.attachments = attachments.map((att) => ({
        filename: att.filename,
        content: att.content, // Resend expects Buffer or string content
      }));
    }

    const data = await resend.emails.send(emailOptions);

    if (data.error) {
      console.error(`❌ Failed to send email to ${email}:`, data.error);
      return null;
    }

    console.log(`✅ Email sent to ${email}: ${data.id}`);
    return data;
  } catch (error) {
    console.error(`❌ Failed to send email to ${email}:`, error);
    return null;
  }
};

/* ===============================
   ORDER NOTIFICATIONS
=============================== */
exports.sendOrderNotification = async (
  adminEmail,
  orderNumber,
  customerName
) => {
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
          <a href="${process.env.CUSTOMER_URL || "https://swissembropatches.org"
    }/orders" 
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
          <a href="https://swissembropatches.org/dashboard" 
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
exports.generateInvoicePDF = async (invoice, customer) => {
  const doc = new PDFDocument({ size: "A4", margin: 30 });
  const bufferStream = new streamBuffers.WritableStreamBuffer();

  doc.pipe(bufferStream);

  const logoPath = path.join(__dirname, "..", "assets", "logo.png");

  // Colors
  const black = "#000000";
  const yellowTheme = "#FFDD00";
  const pureWhite = "#FFFFFF";
  const lightGrey = "#F2F2F2";
  const darkGrey = "#333333";

  // Helper for currency
  const formatMoney = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount || 0);
  };

  // Header Section
  // Full-width black header
  doc.rect(0, 0, doc.page.width, 120).fill(black);

  const headerY = 25;
  
  // Large INVOICE on the right
  doc
    .fillColor(yellowTheme)
    .font("Helvetica-Bold")
    .fontSize(40)
    .text("INVOICE", 50, headerY, { align: "right" });

  // Company Name/Logo in Header
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 50, headerY - 5, { width: 130 });
  } else {
    doc.fillColor(yellowTheme).font("Helvetica-Bold").fontSize(26).text("Swissembro Patches", 50, headerY);
  }

  // Company Info in Header
  const companyInfoY = headerY + 40;
  doc
    .fontSize(10)
    .font("Helvetica")
    .fillColor(yellowTheme)
    .text("www.swissembropatches.org", 50, companyInfoY)
    .text("accounts@swissembropatches.com", 50, companyInfoY + 15);

  // Invoice Details below INVOICE title
  const detailsY_adj = headerY + 50;
  const rightColumnX = 350;
  
  doc
    .fillColor(pureWhite)
    .fontSize(9)
    .font("Helvetica-Bold").text("Invoice #:", rightColumnX, detailsY_adj)
    .font("Helvetica").text(invoice.orderId?.orderNumber || invoice.invoiceNumber, rightColumnX + 80, detailsY_adj, { align: "right", width: 115 })
    
    .font("Helvetica-Bold").text("Date:", rightColumnX, detailsY_adj + 15)
    .font("Helvetica").text(new Date().toLocaleDateString(), rightColumnX + 80, detailsY_adj + 15, { align: "right", width: 115 })

    .font("Helvetica-Bold").text("Due date:", rightColumnX, detailsY_adj + 30)
    .font("Helvetica").text(invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "Upon Receipt", rightColumnX + 80, detailsY_adj + 30, { align: "right", width: 115 })
    
    .font("Helvetica-Bold").text("Currency:", rightColumnX, detailsY_adj + 45)
    .font("Helvetica").text(`${invoice.currency || "USD"}`, rightColumnX + 80, detailsY_adj + 45, { align: "right", width: 115 });

  // Bill To section
  const billToY = 140;
  doc
    .fillColor(black)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("Bill to:", 50, billToY)
    .font("Helvetica")
    .fontSize(10)
    .text(customer.name, 50, billToY + 13)
    .text(customer.email, 50, billToY + 25);

  // Table Section
  let tableTop = billToY + 45;

  // Table Header
  doc.rect(50, tableTop - 5, 495, 25).fill(black);
  
  doc.fillColor(yellowTheme).font("Helvetica-Bold").fontSize(10);
  doc.text("DESCRIPTION", 65, tableTop + 2);
  doc.text("QTY", 310, tableTop + 2, { width: 70, align: "center" });
  doc.text("PRICE", 380, tableTop + 2, { width: 80, align: "right" });
  doc.text("AMOUNT", 465, tableTop + 2, { width: 70, align: "right" });

  let currentY = tableTop + 25;
  invoice.items.forEach((item, index) => {
    if (index % 2 === 1) {
        doc.rect(50, currentY - 5, 495, 20).fill(lightGrey);
    }

    doc.fillColor(black).font("Helvetica").fontSize(10);
    doc.text(item.description, 65, currentY);
    doc.text(item.quantity.toString(), 310, currentY, { width: 70, align: "center" });
    doc.text(formatMoney(item.price, invoice.currency), 380, currentY, { width: 80, align: "right" });
    doc.text(formatMoney(item.quantity * item.price, invoice.currency), 465, currentY, { width: 70, align: "right" });
    
    currentY += 20;
  });

  // Summary Totals
  const footerX = 350;
  let summaryY = currentY + 15;

  doc.fillColor(black).font("Helvetica-Bold").fontSize(10).text("Subtotal", footerX, summaryY);
  doc.font("Helvetica").text(formatMoney(invoice.subtotal || invoice.total, invoice.currency), 465, summaryY, { width: 70, align: "right" });
  
  summaryY += 15;
  doc.fillColor(black).font("Helvetica-Bold").text("Shipping", footerX, summaryY);
  doc.font("Helvetica").text(formatMoney(0, invoice.currency), 465, summaryY, { width: 70, align: "right" });

  summaryY += 15;
  
  // Total Box
  doc.rect(348, summaryY, 197, 35).fill(yellowTheme);
  
  doc.fillColor(black).font("Helvetica-Bold").fontSize(11);
  doc.text("TOTAL DUE", footerX, summaryY + 10);
  doc.fontSize(13).text(`${formatMoney(invoice.total, invoice.currency)} ${invoice.currency || "USD"}`, 420, summaryY + 10, { width: 115, align: "right" });

  // combined Notes & Instructions
  currentY = summaryY + 40;
  
  doc.rect(50, currentY, 495, 18).fill(black);
  doc.fillColor(yellowTheme).font("Helvetica-Bold").fontSize(9).text("IMPORTANT INSTRUCTIONS:", 65, currentY + 4);
  
  doc.fillColor(black).font("Helvetica").fontSize(8)
    .text("Once you have paid the invoice kindly email the proof of payment at accounts@swissembropatches.com OR whatsapp us at (+44 7782294364)", 50, currentY + 22, { width: 495 });

  if (invoice.notes) {
    doc.moveDown(0.5);
    doc.fillColor(black).font("Helvetica-Bold").text("NOTES:");
    doc.font("Helvetica").text(invoice.notes, { width: 495 });
  }

  // Final Footer
  const pageHeight = doc.page.height;
  doc.rect(0, pageHeight - 45, doc.page.width, 45).fill(black);
  doc.fontSize(10).font("Helvetica-Bold").fillColor(yellowTheme)
    .text("THANK YOU FOR CHOOSING SWISSEMBRO PATCHES!", 0, pageHeight - 30, { align: "center", width: doc.page.width });
  
  doc.fontSize(8).font("Helvetica").fillColor(pureWhite)
    .text("Swiss Quality Embroidery | Premium Designs", 0, pageHeight - 15, { align: "center", width: doc.page.width });

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

  // Ensure orderId is populated to get orderNumber
  if (invoice.populate && (!invoice.orderId || !invoice.orderId.orderNumber)) {
    try {
      await invoice.populate('orderId');
    } catch (err) {
      console.warn("⚠️ Could not populate orderId in sendInvoiceEmail:", err.message);
    }
  }

  const paymentLink = `${process.env.FRONTEND_URL || "https://swissembropatches.org"
    }/invoices/pay/${invoice._id}`;
  const pdfBuffer = await exports.generateInvoicePDF(invoice, customer);

  // Helper
  const formatMoney = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: invoice.currency || 'USD' }).format(amount || 0);
  };

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #FFDD00; background: #000; padding: 15px; text-align: center;">
        Invoice for Order: ${invoice.orderId?.orderNumber || invoice.invoiceNumber}
      </h2>
      <div style="padding: 20px; background: #f9f9f9; border-radius: 5px; margin-top: 20px;">
        <p>Hello <strong>${customer.name}</strong>,</p>
        <p>You have a new invoice from <strong>Swissembro Patches</strong>.</p>
        <p><strong>Total Amount:</strong> ${formatMoney(invoice.total)}</p>
        <p style="margin-top: 20px;">
          <a href="${paymentLink}" 
             style="background: #FFDD00; color: #000; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Pay Invoice
          </a>
        </p>
        <p>Attached is a PDF copy of your invoice.</p>
        <hr style="border: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 14px; color: #555;">
          <strong>Important:</strong> Once you have paid the invoice kindly email the proof of payment at <a href="mailto:accounts@swissembropatches.com">accounts@swissembropatches.com</a> OR WhatsApp us at <strong>(+44 7782294364)</strong>.
        </p>
      </div>
    </div>
  `;

  return await exports.sendEmail({
    email: customer.email,
    subject: `Invoice ${invoice.invoiceNumber} - Swissembro Patches`,
    html,
    attachments: [
      {
        filename: `${invoice.invoiceNumber}.pdf`,
        content: pdfBuffer,
      },
    ],
    bcc: "accounts@swissembropatches.com",
  });
};

/* ===============================
   ORDER ASSIGNMENT EMAIL (Single)
=============================== */
exports.sendOrderAssignmentEmail = async (
  employee,
  order,
  assignedBy = "Admin"
) => {
  if (!employee.email) {
    console.warn("⚠️ Employee has no email. Skipping assignment email.");
    return null;
  }

  const orderLink = `${process.env.FRONTEND_URL || "http://localhost:3000"
    }/employee/orders`;

  // Get design name based on order type
  const designName =
    order.orderType === "patches"
      ? order.patchDesignName || "N/A"
      : order.designName || "N/A";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #fff;">
      <!-- Header -->
      <div style="background: #000; padding: 30px; text-align: center;">
        <h1 style="color: #FFDD00; margin: 0; font-size: 28px;">Swissembro Patches</h1>
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
              <td style="padding: 8px 0; color: #333; font-weight: bold;">${order.orderNumber
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
              <td style="padding: 8px 0; color: #666; font-weight: 600;">Customer:</td>
              <td style="padding: 8px 0; color: #333;">${order.customerId?.name || "N/A"
    }</td>
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
              <td style="padding: 8px 0; color: #333;">${new Date().toLocaleDateString(
      "en-US",
      { year: "numeric", month: "long", day: "numeric" }
    )}</td>
            </tr>
          </table>
        </div>

        ${order.notes
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
          Please log in to your employee portal to view the complete order details and manage this assignment.
        </p>
      </div>

      <!-- Footer -->
      <div style="background: #000; padding: 20px 30px; text-align: center; color: #999; font-size: 13px;">
        <p style="margin: 5px 0;">© ${new Date().getFullYear()} Swissembro Patches. All rights reserved.</p>
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
exports.sendBulkOrderAssignmentEmail = async (
  employee,
  orders,
  assignedBy = "Admin"
) => {
  if (!employee.email) {
    console.warn("⚠️ Employee has no email. Skipping bulk assignment email.");
    return null;
  }

  const orderLink = `${process.env.FRONTEND_URL || "http://localhost:3000"
    }/employee/orders`;
  const orderCount = orders.length;

  // Create order rows for the table
  const orderRows = orders
    .map((order, index) => {
      const designName =
        order.orderType === "patches"
          ? order.patchDesignName || "N/A"
          : order.designName || "N/A";

      return `
      <tr style="${index % 2 === 0 ? "background: #f9f9f9;" : "background: #fff;"
        }">
        <td style="padding: 12px 8px; border-bottom: 1px solid #e0e0e0; text-align: center;">${index + 1
        }</td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #e0e0e0; font-weight: 600; color: #333;">${order.orderNumber
        }</td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #e0e0e0;">
          <span style="background: #FFDD00; color: #000; padding: 3px 10px; border-radius: 10px; font-size: 12px; font-weight: 600;">
            ${order.orderType.toUpperCase()}
          </span>
        </td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #e0e0e0; color: #555;">${designName}</td>
        <td style="padding: 12px 8px; border-bottom: 1px solid #e0e0e0; color: #555;">${order.customerId?.name || "N/A"
        }</td>
      </tr>
    `;
    })
    .join("");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 750px; margin: 0 auto; background: #fff;">
      <!-- Header -->
      <div style="background: #000; padding: 30px; text-align: center;">
        <h1 style="color: #FFDD00; margin: 0; font-size: 28px;">Swissembro Patches</h1>
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
          <p style="color: #333; margin: 15px 0 0 0; font-size: 14px;">Assigned on ${new Date().toLocaleDateString(
    "en-US",
    { year: "numeric", month: "long", day: "numeric" }
  )}</p>
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
        <p style="margin: 5px 0;">© ${new Date().getFullYear()} Swissembro Patches. All rights reserved.</p>
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
   CUSTOM ORDER EMAIL (Admin to Customer)
=============================== */
exports.sendCustomOrderEmail = async (customerEmail, orderNumber, message, attachments = []) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #fff;">
      <div style="background: #000; padding: 20px; text-align: center;">
        <h1 style="color: #FFDD00; margin: 0; font-size: 24px;">Swissembro Patches</h1>
      </div>
      
      <div style="padding: 30px 20px; background: #f9f9f9;">
        <h2 style="color: #333; margin-top: 0; font-size: 20px;">Message regarding Order #${orderNumber}</h2>
        
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          ${message ? message.replace(/\n/g, '<br>') : 'Please find the attached files regarding your order.'}
        </p>
        
        <div style="margin-top: 30px; padding: 15px; background: #fff; border-radius: 5px; border-left: 4px solid #FFDD00;">
          <p style="margin: 0; color: #666; font-size: 14px;"><strong>Note:</strong> ${attachments.length} file(s) attached.</p>
        </div>
        
        <div style="text-align: center; margin-top: 30px;">
           <a href="${process.env.FRONTEND_URL || 'https://swissembropatches.org'}/dashboard" 
             style="background: #000; color: #FFDD00; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            View Order
          </a>
        </div>
      </div>
      
      <div style="background: #eee; padding: 15px; text-align: center; color: #888; font-size: 12px;">
        &copy; ${new Date().getFullYear()} Swissembro Patches. All rights reserved.
      </div>
    </div>
  `;

  return await exports.sendEmail({
    email: customerEmail,
    subject: `Update for Order #${orderNumber}`,
    html,
    attachments
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

  const orderLink = "https://swissembropatches.org/dashboard";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #fff;">
      <!-- Header -->
      <div style="background: #000; padding: 30px; text-align: center;">
        <h1 style="color: #FFDD00; margin: 0; font-size: 28px;">Swissembro Patches</h1>
        <p style="color: #fff; margin: 10px 0 0 0; font-size: 14px;">Order Management System</p>
      </div>

      <!-- Main Content -->
      <div style="padding: 40px 30px; background: #f9f9f9;">
        <h2 style="color: #333; margin-top: 0; font-size: 24px;">✅ Order Placed Successfully!</h2>
        
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Hello <strong>${customer.name}</strong>,
        </p>
        
    

        <!-- Order Details Card -->
        <div style="background: #fff; border-left: 4px solid #FFDD00; padding: 20px; margin: 25px 0; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h3 style="color: #000; margin-top: 0; font-size: 18px;">📋 Order Details</h3>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: 600; width: 40%;">Order Number:</td>
              <td style="padding: 8px 0; color: #333; font-weight: bold;">${order.orderNumber
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

        ${order.notes
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
        <p style="margin: 5px 0;">© ${new Date().getFullYear()} Swissembro Patches. All rights reserved.</p>
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

  const orderLink = `${process.env.CUSTOMER_URL || "https://swissembropatches.org"
    }/orders`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #fff;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #000 0%, #1a1a1a 100%); padding: 30px; text-align: center;">
        <h1 style="color: #FFDD00; margin: 0; font-size: 28px;">Swissembro Patches</h1>
        <p style="color: #fff; margin: 10px 0 0 0; font-size: 14px;">Swissembro Patches - Admin Notification</p>
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
              <td style="padding: 10px 0; color: #333; font-weight: bold; border-bottom: 1px solid #eee;">${order.orderNumber
    }</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #666; font-weight: 600; border-bottom: 1px solid #eee;">Customer:</td>
              <td style="padding: 10px 0; color: #333; border-bottom: 1px solid #eee;">
                <strong>${customer?.name || "N/A"}</strong><br>
                <span style="color: #666; font-size: 13px;">${customer?.email || ""
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

        ${order.notes
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
        <p style="margin: 5px 0;">© ${new Date().getFullYear()} Swissembro Patches. All rights reserved.</p>
        <p style="margin: 5px 0;">This is an automated notification. Please do not reply to this email.</p>
      </div>
    </div>
  `;

  return await exports.sendEmail({
    email: adminEmail,
    subject: `🆕 New Order: ${order.orderNumber} from ${customer?.name || "Customer"
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

  const orderLink = "https://swissembropatches.org/dashboard";

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
        <p style="color: #fff; margin: 10px 0 0 0; font-size: 14px;">Swissembro Patches - Order Notification</p>
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
            <span style="background: ${statusStyle.bg}; color: ${statusStyle.text
    }; padding: 12px 25px; border-radius: 25px; font-weight: 700; font-size: 18px; border: 2px solid ${statusStyle.text
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
              <td style="padding: 8px 0; color: #333; font-weight: bold;">${order.orderNumber
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

        ${order.rejectedReason
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
          Thank you for choosing Swissembro Patches. We're committed to delivering quality work.
        </p>
      </div>

      <!-- Footer -->
      <div style="background: #000; padding: 20px 30px; text-align: center; color: #999; font-size: 13px;">
        <p style="margin: 5px 0;">© ${new Date().getFullYear()} Swissembro Patches. All rights reserved.</p>
        <p style="margin: 5px 0;">Questions? Contact us at support@swissembropatches.com</p>
      </div>
    </div>
  `;

  return await exports.sendEmail({
    email: customer.email,
    subject: `📦 Order ${order.orderNumber} - Status: ${order.status}`,
    html,
  });
};

/* ===============================
   CUSTOMER TRACKING NUMBER UPDATE
=============================== */
exports.sendTrackingNumberEmail = async (customer, order, trackingNumber) => {
  if (!customer?.email) {
    console.warn("⚠️ Customer has no email. Skipping tracking number email.");
    return null;
  }

  const orderLink = "https://swissembropatches.org/dashboard";

  // Get design name based on order  type
  const designName =
    order.orderType === "patches"
      ? order.patchDesignName || "N/A"
      : order.designName || "N/A";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #fff;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #000 0%, #1a1a1a 100%); padding: 30px; text-align: center;">
        <h1 style="color: #FFDD00; margin: 0; font-size: 28px;">🚚 Your Order is On The Way!</h1>
        <p style="color: #fff; margin: 10px 0 0 0; font-size: 14px;">Swissembro Patches - Tracking Number Added</p>
      </div>

      <!-- Main Content -->
      <div style="padding: 40px 30px; background: #f9f9f9;">
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Hello <strong>${customer.name}</strong>,
        </p>
        
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Great news! Your order has been shipped and we've added a tracking number to your order. You can now track your shipment in real-time.
        </p>

        <!-- Tracking Number Card -->
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; margin: 25px 0; border-radius: 12px; text-align: center; box-shadow: 0 6px 12px rgba(16, 185, 129, 0.3);">
          <p style="color: #fff; margin: 0 0 10px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 2px;">Your Tracking Number</p>
          <div style="background: #fff; padding: 20px; border-radius: 8px; margin: 15px 0;">
            <p style="color: #000; margin: 0; font-size: 32px; font-weight: bold; font-family: 'Courier New', monospace; letter-spacing: 2px;">
              ${trackingNumber}
            </p>
          </div>
          <p style="color: #fff; margin: 15px 0 0 0; font-size: 14px; opacity: 0.9;">
            Use this number to track your shipment with your courier service
          </p>
        </div>

        <!-- Order Details Card -->
        <div style="background: #fff; border-left: 4px solid #FFDD00; padding: 20px; margin: 25px 0; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h3 style="color: #000; margin-top: 0; font-size: 18px;">📋 Order Details</h3>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: 600; width: 40%;">Order Number:</td>
              <td style="padding: 8px 0; color: #333; font-weight: bold;">${order.orderNumber
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
            ${order.patchAddress
      ? `
            <tr>
              <td style="padding: 8px 0; color: #666; font-weight: 600;">Delivery Address:</td>
              <td style="padding: 8px 0; color: #333;">${order.patchAddress}</td>
            </tr>
            `
      : ""
    }
          </table>
        </div>

        <!-- Info Box -->
        <div style="background: #e0f2fe; border-left: 4px solid #0284c7; padding: 15px; margin: 20px 0; border-radius: 5px;">
          <p style="margin: 0; color: #075985; font-size: 14px;">
            <strong>💡 Tip:</strong> You can track your order using this tracking number on your courier's website (DHL, UPS, FedEx, etc.)
          </p>
        </div>

        <!-- Action Button -->
        <div style="text-align: center; margin: 35px 0 25px 0;">
          <a href="${orderLink}" 
             style="background: #FFDD00; color: #000; padding: 14px 35px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px; box-shadow: 0 3px 6px rgba(0,0,0,0.16);">
            View Order Details →
          </a>
        </div>

        <p style="color: #666; font-size: 14px; line-height: 1.6; margin-top: 30px; text-align: center;">
          Thank you for choosing SwissEmbro. Your order is on its way to you!
        </p>
      </div>

      <!-- Footer -->
      <div style="background: #000; padding: 20px 30px; text-align: center; color: #999; font-size: 13px;">
        <p style="margin: 5px 0;">© ${new Date().getFullYear()} SwissEmbro. All rights reserved.</p>
        <p style="margin: 5px 0;">Questions? Contact us at support@swissembro.com</p>
      </div>
    </div>
  `;

  return await exports.sendEmail({
    email: customer.email,
    subject: `🚚 Tracking Number Added: ${order.orderNumber}`,
    html,
  });
};
