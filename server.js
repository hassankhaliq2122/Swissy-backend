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
  console.warn("⚠️ JWT_SECRET not set, using temporary dev secret.");
  process.env.JWT_SECRET = "default_jwt_secret_" + Date.now();
}

// ============================
// 🚀 App & HTTP Server
// ============================
const app = express();
const server = http.createServer(app);

// ============================
// 🌐 Allowed Origins for CORS
// ============================
const allowedOrigins = ["http://localhost:3001", "http://localhost:3000","https://swissy-customer.netlify.app","https://swissy-admin.netlify.app/"]; // add more if needed

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // allow server-to-server requests
      if (allowedOrigins.indexOf(origin) === -1) {
        return callback(new Error("CORS policy: This origin is not allowed"));
      }
      return callback(null, true);
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
    origin: allowedOrigins,
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
  app.use("/api/auth", require("./routes/auth"));
  app.use("/api/orders", require("./routes/orders"));
  app.use("/api/invoices", require("./routes/invoiceRoutes"));
  app.use("/api/payments", require("./routes/payments"));
  app.use("/api/employees", require("./routes/employees"));
  app.use("/api/users", require("./routes/users"));
  app.use("/api/notifications", require("./routes/notifications"));
  app.use("/api/upload", require("./routes/upload"));
} catch (err) {
  console.log("error", err);
  console.error("❌ Error loading routes:", err.message);
}

// ============================
// ❤️ Health Check
// ============================
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Server is running" });
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
