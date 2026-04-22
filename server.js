const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

dotenv.config();

// ============================
// 🔐 JWT Secret Check
// ============================
if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET is not set in environment variables!");
  process.exit(1); // Stop server if secret is missing for security
}

// ============================
// 🚀 App & HTTP Server
// ============================
const app = express();
const server = http.createServer(app);
const helmet = require("helmet");
app.use(helmet());

// ============================
// 🌐 CORS Configuration
// ============================
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.CUSTOMER_URL,
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174"
].filter(Boolean);

console.log("🛠️ Allowed Origins:", allowedOrigins);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        console.error(`❌ CORS blocked for origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ============================
// 🧩 Body Parsers
// ============================
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ============================
// 🗄️ MongoDB Connection
// ============================
const mongoUri =
  process.env.MONGODB_URI || "mongodb://localhost:27017/swissproject";
mongoose
  .connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB Connected:", mongoose.connection.name))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err.message));

// ============================
// 🔌 Socket.IO Setup
// ============================
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => callback(null, true),
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log("🟢 Client connected:", socket.id);

  socket.on("join-room", (userId) => {
    if (userId) {
      socket.join(`user-${userId}`);
      console.log(`User ${userId} joined room`);
    }
  });

  socket.on("disconnect", () => {
    console.log("🔴 Client disconnected:", socket.id);
  });
});

// Make io accessible in routes
app.set("io", io);

// ============================
// 📁 Static Uploads
// ============================
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ============================
// 🛣️ API Routes
// ============================
try {
  const routes = [
    { path: "/api/auth", route: "./routes/auth" },
    { path: "/api/orders", route: "./routes/orders" },
    { path: "/api/invoices", route: "./routes/invoiceRoutes" },
    { path: "/api/payments", route: "./routes/payments" },
    { path: "/api/employees", route: "./routes/employees" },
    { path: "/api/users", route: "./routes/users" },
    { path: "/api/notifications", route: "./routes/notifications" },
    { path: "/api/upload", route: "./routes/upload" },
    { path: "/api/activity", require: "./routes/activity" },
    { path: "/api/cloudinary", route: "./routes/cloudinary" },
    { path: "/api/webhooks", route: "./routes/webhookRoutes" },
  ];

  routes.forEach((r) => {
    try {
      app.use(r.path, require(r.route || r.require));
    } catch (err) {
      console.error(`❌ Error loading route ${r.path}:`, err);
    }
  });
} catch (err) {
  console.error("❌ Critical Error in API Routes setup:", err);
}

// ============================
// ❤️ Health Check
// ============================
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Server is running and UPDATED" });
});

// ============================
// ❌ 404 Handler
// ============================
// app.use((req, res) => {
//   res.status(404).json({ error: 'Route not found' });
// });

// ============================
// 🔥 Global Error Handler
// ============================
app.use((err, req, res, next) => {
  console.error("Error:", err.message || err);
  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error",
  });
});

// ============================
// 🌐 Global Fallbacks
// ============================
process.on("unhandledRejection", (err) =>
  console.error("Unhandled Promise Rejection:", err)
);
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

// ============================
// 🚀 Start Server
// ============================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
});
