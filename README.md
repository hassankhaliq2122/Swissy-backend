# ⚙️ Swissy Backend

### A Robust RESTful API Server Powering the Swissembro Patches Order Management Ecosystem

![Node.js](https://img.shields.io/badge/Node.js-18.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.21-000000?style=for-the-badge&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-7.0-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![Mongoose](https://img.shields.io/badge/Mongoose-7.8.7-880000?style=for-the-badge&logo=mongoose&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-Auth-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8.1-010101?style=for-the-badge&logo=socketdotio&logoColor=white)
![PayPal](https://img.shields.io/badge/PayPal-SDK-00457C?style=for-the-badge&logo=paypal&logoColor=white)
![Cloudinary](https://img.shields.io/badge/Cloudinary-1.40-3448C5?style=for-the-badge&logo=cloudinary&logoColor=white)

---

_The Node.js/Express backend that powers both the Customer Portal and Admin Dashboard for **Swissembro Patches** — handling authentication, order management, real-time notifications, email services, PDF invoice generation, payments, and file uploads._

</div>

---

## 📸 Overview

The **Swissy Backend** is a production-grade REST API built with Express.js and MongoDB. It serves as the single source of truth for the entire order management ecosystem — processing customer orders (Digitizing, Vector, Patches), managing employees, generating PDF invoices, sending branded emails, processing PayPal payments, and pushing real-time updates via Socket.IO to both customer and admin frontends.

---

## ✨ Features

### 🔐 Authentication & Authorization

- **JWT-based Authentication** with configurable secret and expiry
- **Bcrypt Password Hashing** with salt rounds via `bcryptjs`
- **Google OAuth Integration** using `google-auth-library` for social login
- **Three-Tier Role System:**
  - `customer` — order placement, invoice management
  - `employee` — order processing, work submission
  - `admin` — full system control
- **Middleware Stack:**
  - `protect` — JWT verification & user loading
  - `authorize` — role-based access control
  - `checkEmployeePermission` — granular employee permission checks (viewer/editor/full_access)

### 📦 Order Management

- **Three Order Types** with type-specific schemas and auto-generated order numbers:
  - 🧵 **Digitizing** — placement, custom measurements, dimensions
  - 🎨 **Vector** — file format selection, design instructions
  - 🏷️ **Patches** — 10 patch styles, backing options, dimensions, quantity, shipping
- **Complete Order Lifecycle:**
  - `In Progress` → `Assigned` → `Sample Sent` → `Completed` / `Delivered` / `Rejected`
  - Revision workflow: `Revision Requested` → `Revision in Progress` → `Revision Completed`
  - Employee workflow: `Work Pending` → `Approved` / `Rejected`
- **Revision System** — tracks parent order, revision number, and reason
- **Employee Assignment** — assign orders based on employee specialization
- **Bulk Operations** — bulk assign, bulk status update
- **57K+ bytes** of comprehensive route logic handling all edge cases

### 💰 Invoicing & Payments

- **Invoice Generation** with auto-generated invoice numbers
- **Consolidated Invoices** — combine multiple orders into a single invoice
- **PayPal Checkout Server SDK** — server-side payment processing and webhooks
- **Multi-Currency Support** (USD default)
- **Payment Status Tracking** — Unpaid, Paid, Refunded, Cancelled
- **PayPal Transaction Details** storage (transaction ID, payer email, payment method)

### 📄 PDF Invoice Generation (PDFKit)

- **Professional A4 PDF Invoices** generated server-side with `pdfkit`
- **Two Layout Modes:**
  - **Single Order** — company info left, invoice details right
  - **Consolidated Order** — Bill To left, Service Provider with logo right
- **Branded Design** — black & yellow theme with company logo
- **Dynamic Elements:**
  - Auto-calculated totals and line items
  - Currency-aware formatting
  - Country-based phone number display (US vs international)
  - Due date and payment instructions
- **Stream-based Generation** using `stream-buffers` for memory efficiency

### 📧 Email Service (Resend API)

- **Resend API Integration** for transactional emails
- **Email Types:**
  - 📬 Order notifications (new order, status update)
  - 🧾 Invoice emails with PDF attachments
  - 🎯 Order assignment emails (single & bulk)
  - 📧 Custom order emails with file attachments & CC support
  - ✅ Customer order confirmation
- **Professional HTML Email Templates** with branded styling
- **BCC Support** — auto-BCC to accounts email
- **File Attachments** — including `.pes` embroidery machine files

### ☁️ File Management

- **Cloudinary Integration** — image upload, transformation, and CDN delivery
- **UploadThing** — large file uploads with progress tracking
- **Multer** — local file upload middleware for temporary storage
- **Static File Serving** — `/uploads` directory for uploaded assets

### 🔔 Real-Time Notifications (Socket.IO)

- **Socket.IO Server** with room-based architecture
- **User Rooms** — each user joins `user-{userId}` for targeted notifications
- **16 Notification Types:**
  - `order_created`, `order_status_changed`, `order_completed`, `order_rejected`
  - `order_assigned`, `order_reassigned`
  - `employee_order_updated`, `admin_note_added`
  - `employee_performance`
  - `sample_uploaded`, `revision_uploaded`, `revision_requested`
  - `tracking_number_added`
  - `employee_work_pending`, `work_approved`, `work_rejected`
- **Cross-Origin Support** — Socket.IO CORS configured for multiple frontend origins

### 👥 User Management

- **Customer Profiles** — name, email, phone, company, address, country, invoicing email, area of interest
- **Employee Profiles** — specialization role, performance metrics, assigned orders, activity tracking
- **Customer Numbering** — auto-generated unique customer numbers
- **Account Activation/Deactivation**
- **Admin Notes** on user profiles

### 📊 Activity Logging

- **Employee Activity Tracking** — login, logout, order views, order updates, page views
- **Heartbeat System** — periodic session pings for real-time presence
- **Session Duration Calculation**
- **Indexed Queries** — MongoDB compound indexes for fast activity lookups

### 🔒 Security

- **Helmet.js** — HTTP security headers
- **CORS Configuration** — configurable origin whitelist
- **Express Validator** — request validation and sanitization
- **Password Hashing** — bcrypt with 10 salt rounds
- **JSON Size Limits** — 10MB request body limit
- **Global Error Handling** — centralized error handler with unhandled rejection/exception catchers

---

## 🏗️ Tech Stack

| Category           | Technologies                                        |
| ------------------ | --------------------------------------------------- |
| **Runtime**        | Node.js 18.x                                        |
| **Framework**      | Express.js 4.21                                     |
| **Database**       | MongoDB 7.0 + Mongoose 7.8                          |
| **Authentication** | JWT (`jsonwebtoken`) + Bcrypt + Google Auth Library |
| **Real-Time**      | Socket.IO 4.8 Server                                |
| **Payments**       | PayPal Checkout Server SDK                          |
| **Email**          | Resend API                                          |
| **PDF Generation** | PDFKit + Stream Buffers                             |
| **File Upload**    | Multer + Cloudinary + UploadThing                   |
| **Security**       | Helmet + CORS + Express Validator                   |
| **SMS (Optional)** | Twilio                                              |
| **Crypto**         | Node.js `crypto` module                             |
| **Dev Tools**      | Nodemon + Concurrently                              |

---

## 📁 Project Structure

```
Swissy-backend/
├── server.js                    # Express app, Socket.IO, MongoDB, route mounting
├── models/
│   ├── User.js                  # User schema (customer/admin/employee)
│   ├── Order.js                 # Order schema (digitizing/vector/patches)
│   ├── Invoice.js               # Invoice schema with PayPal payment details
│   ├── Notification.js          # 16-type notification schema
│   └── ActivityLog.js           # Employee activity tracking schema
├── routes/
│   ├── auth.js                  # Login, register, Google OAuth, load user
│   ├── orders.js                # Full order CRUD, status management, revisions
│   ├── invoiceRoutes.js         # Invoice generation, consolidated invoices
│   ├── payments.js              # PayPal payment processing
│   ├── employees.js             # Employee CRUD and management
│   ├── users.js                 # Customer management (admin)
│   ├── adminUsers.js            # Admin user operations
│   ├── notifications.js         # Notification CRUD
│   ├── activity.js              # Activity logging endpoints
│   ├── upload.js                # UploadThing file uploads
│   ├── cloudinary.js            # Cloudinary upload routes
│   └── webhookRoutes.js         # PayPal webhook handlers
├── middleware/
│   ├── auth.js                  # protect, authorize, checkEmployeePermission
│   └── upload.js                # Multer file upload configuration
├── utils/
│   ├── emailService.js          # Resend emails + PDF invoice generation (52K+)
│   ├── pdfService.js            # Additional PDF utilities
│   ├── cloudinaryService.js     # Cloudinary upload/delete helpers
│   └── loadPayPalScript.js      # PayPal SDK loader
├── scripts/
│   ├── seedAdmin.js             # Admin account seeder
│   └── test_pdf.js              # PDF generation testing
├── assets/
│   └── logo.png                 # Company logo for PDF branding
├── uploads/                     # Local file uploads directory
├── createAdmin.js               # Admin creation utility
├── debug_admin_user.js          # Admin debugging utility
├── fix_admin_account.js         # Admin account recovery
├── paypalClient.js              # PayPal SDK client configuration
├── TROUBLESHOOTING.md           # Common issues & solutions
├── package.json
└── .env
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 16.x
- **MongoDB** (local or Atlas)
- **npm** or **yarn**

### Environment Variables

NODE_ENV=development

# MongoDB

MONGODB_URI=mongodb+srv://your-connection-string

# JWT

JWT_SECRET=your_jwt_secret_key
JWT_EXPIRE=7d

# Email (Resend)

RESEND_API_KEY=your_resend_api_key
EMAIL_FROM=noreply@yourdomain.com

# PayPal

PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret

# Cloudinary

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# UploadThing

UPLOADTHING_SECRET=your_uploadthing_secret
UPLOADTHING_APP_ID=your_app_id

# Twilio (Optional)

TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token

````

### Running the Server

```bash
# Development (with hot reload via Nodemon)
npm run dev

# Production
npm start

# Seed admin account
npm run seed:admin
````

---

## 📡 API Routes

| Route                        | Method         | Description                 |
| ---------------------------- | -------------- | --------------------------- |
| `/api/auth/register`         | POST           | Customer registration       |
| `/api/auth/login`            | POST           | JWT login                   |
| `/api/auth/google`           | POST           | Google OAuth login          |
| `/api/auth/me`               | GET            | Load authenticated user     |
| `/api/orders`                | GET/POST       | List/create orders          |
| `/api/orders/:id`            | GET/PUT/DELETE | Single order CRUD           |
| `/api/orders/:id/assign`     | PUT            | Assign order to employee    |
| `/api/orders/:id/status`     | PUT            | Update order status         |
| `/api/invoices`              | GET/POST       | List/create invoices        |
| `/api/invoices/consolidated` | POST           | Create consolidated invoice |
| `/api/invoices/:id/send`     | POST           | Send invoice email with PDF |
| `/api/payments/paypal`       | POST           | Process PayPal payment      |
| `/api/employees`             | GET/POST/PUT   | Employee management         |
| `/api/users`                 | GET            | List customers              |
| `/api/users/:id`             | GET/PUT        | Customer details            |
| `/api/notifications`         | GET/PUT        | Notification management     |
| `/api/activity`              | GET/POST       | Activity logging            |
| `/api/upload`                | POST           | File uploads                |
| `/api/cloudinary/upload`     | POST           | Cloudinary uploads          |
| `/api/webhooks/paypal`       | POST           | PayPal webhooks             |
| `/api/health`                | GET            | Health check                |

---

## 🔧 Challenges Faced

### 1. 📦 Complex Order Schema Design

**Problem:** A single `Order` model needed to handle three fundamentally different order types (digitizing, vector, patches) with vastly different fields. Patches alone has 10 styles, backing options, dimensions, quantity, and shipping — while digitizing has placement, measurements, and design specifics.
**Solution:** Used a single flexible Mongoose schema with type-specific fields and conditional `required` validators that only enforce field requirements based on `orderType`. Sub-schemas were used for custom sizes and file attachments.

### 2. 📄 Server-Side PDF Invoice Generation

**Problem:** Generating professional PDF invoices directly from the backend with exact pixel positioning, company branding, and two different layouts (single vs consolidated) was incredibly challenging with PDFKit's low-level API.
**Solution:** Built a comprehensive `generateInvoicePDF` function (400+ lines) with precise coordinate math, conditional layouts, stream-based generation, dynamic currency formatting, and country-based phone number selection.

### 3. 📧 Email Service Reliability

**Problem:** The email service handles 6+ different email types (order notifications, invoices with PDF, assignment emails, bulk assignments, custom emails with attachments). Each type has unique HTML templates, attachment handling, and recipient logic. Failures had to be graceful.
**Solution:** Built a centralized `sendEmail` function with error catching that returns `null` on failure instead of throwing. Each email type builds its own HTML template and delegates to the core function. PDF buffers are generated and attached inline.

### 4. 🔌 Socket.IO Multi-Client Architecture

**Problem:** Both the Customer Portal and Admin Dashboard connect to the same Socket.IO server. Notifications needed to be targeted — a customer should only see their notifications, while admins see system-wide events.
**Solution:** Implemented a room-based architecture where each user joins `user-{userId}`. When notifications are created, they're emitted to specific user rooms. The `io` instance is stored on the Express app (`app.set('io', io)`) so all routes can emit events.

### 5. 🔐 Three-Tier Authorization

**Problem:** Admin, employee, and customer roles have overlapping but distinct permissions. Employees can only view/update orders assigned to them, admins have full access, and certain operations (like invoice generation) are admin-only.
**Solution:** Built a middleware chain: `protect` (JWT verification) → `authorize` (role check) → `checkEmployeePermission` (granular permissions). The employee permission middleware maps roles to permission levels (viewer → read, editor → read+update, full_access → all).

### 6. 🔄 Order Revision System

**Problem:** When customers request revisions, the system needed to track the original order, create a linked revision with incremented revision numbers, carry forward all relevant data, and maintain the revision chain.
**Solution:** Implemented `parentOrderId`, `isRevision`, `revisionNumber`, and `revisionReason` fields on the Order schema. Revision creation copies the original order data, increments the revision number, and links back to the parent.

### 7. 💳 PayPal Integration & Webhooks

**Problem:** PayPal's server-side SDK required careful handling of payment capture, transaction verification, and webhook event processing. Edge cases like partial payments, refunds, and duplicate webhook deliveries needed handling.
**Solution:** Used `@paypal/checkout-server-sdk` with dedicated `paypalClient.js` configuration. Webhook routes verify PayPal event signatures and update invoice payment status atomically.

### 8. 🏗️ Admin Account Recovery

**Problem:** During development, admin accounts sometimes got into broken states (locked out, corrupted passwords, missing fields). Needed quick recovery tools.
**Solution:** Created standalone utility scripts (`createAdmin.js`, `debug_admin_user.js`, `fix_admin_account.js`) that connect directly to MongoDB and fix admin account issues without the need for the full server.

---

## 🚢 Deployment

The backend can be deployed to any Node.js hosting platform:

- **Railway** / **Render** / **Heroku** — set environment variables and use `npm start`
- **AWS EC2** / **DigitalOcean** — run with process manager (PM2)
- Ensure MongoDB Atlas connection string is configured
- Set `NODE_ENV=production` for production optimizations

---

**Built with ❤️ for Swissembro Patches**

![MERN Stack](https://img.shields.io/badge/MERN-Stack-47A248?style=flat-square)
![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-brightgreen?style=flat-square)

Developed by [HassanKhaliqDev](https://github.com/HassanKhaliqDev)
