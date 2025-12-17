const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    // 🔥 Extended Notification Types
    type: {
      type: String,
      enum: [
        "order_created", // customer
        "order_status_changed", // customer
        "order_completed", // customer
        "order_rejected", // customer
        "order_assigned", // employee
        "order_reassigned", // employee
        "employee_order_updated", // admin
        "admin_note_added", // customer + employee
        "employee_performance", // admin (report)
        "sample_uploaded", // customer (admin uploaded sample)
        "revision_uploaded", // customer (admin uploaded revision)
        "revision_requested", // admin (customer requested revision)
        "tracking_number_added", // customer (tracking number added)
        // Employee Work Approval Workflow
        "employee_work_pending", // admin (employee submitted work for review)
        "work_approved", // employee (admin approved work)
        "work_rejected", // employee (admin rejected work)
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    // For Admin → Employee / Customer targeting info
    senderRole: {
      type: String,
      enum: ["admin", "customer", "employee"],
      default: "admin",
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    //  If order reassigned → who was old employee?
    previousAssignedEmployee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    //  If assigned → which employee?
    assignedEmployee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);
