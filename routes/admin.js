
const express = require("express");
const router = express.Router();
const { protect, adminOnly, soOnly, dsOnly } = require("../middleware/auth_middleware");
const upload = require("../middleware/upload");
const Announcement = require("../models/Announcement");
const User = require("../models/User");
const {
  setupAdmin,
  getSODashboard,
  getDSDashboard,
  getSOEmployees,
  getDSEmployees,
  getEmployee,
  soVerify,
  soRevert,
  dsApprove,
  dsReject,
  dsHold,
  addTransfer,
  editTransfer,
  deleteTransfer,
  handleEditRequest,
  downloadEmployee,
} = require("../controllers/adminController");

// ── Public Stats (no auth — for homepage) ─────────────────────────────────────
router.get("/public-stats", async (req, res) => {
  try {
    const total = await User.countDocuments({
      role: "employee",
      isRegistrationComplete: true,
    });
    const approved = await User.countDocuments({
      role: "employee",
      approvalStatus: "approved",
    });

    const approvedUsers = await User.find({
      role: "employee",
      approvalStatus: "approved",
      dsActionAt: { $exists: true },
    }).select("createdAt dsActionAt");

    let avgHours = 24;
    if (approvedUsers.length > 0) {
      const totalMs = approvedUsers.reduce(
        (sum, u) => sum + (new Date(u.dsActionAt) - new Date(u.createdAt)),
        0,
      );
      avgHours = Math.round(totalMs / approvedUsers.length / (1000 * 60 * 60));
      if (avgHours < 1) avgHours = 1;
    }

    res.json({ success: true, total, approved, avgHours });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Admin Setup ───────────────────────────────────────────────────────────────
router.post("/setup", protect, adminOnly, setupAdmin);

// ── SO Routes ─────────────────────────────────────────────────────────────────
router.get("/so/dashboard", protect, soOnly, getSODashboard);
router.get("/so/employees", protect, soOnly, getSOEmployees);
router.put("/so/employee/:id/verify", protect, soOnly, soVerify);
router.put("/so/employee/:id/revert", protect, soOnly, soRevert);

// ── DS Routes ─────────────────────────────────────────────────────────────────
router.get("/ds/dashboard", protect, dsOnly, getDSDashboard);
router.get("/ds/employees", protect, dsOnly, getDSEmployees);
router.put("/ds/employee/:id/approve", protect, dsOnly, dsApprove);
router.put("/ds/employee/:id/reject", protect, dsOnly, dsReject);
router.put("/ds/employee/:id/hold", protect, dsOnly, dsHold);

// ── Shared Routes (both SO and DS) ────────────────────────────────────────────
router.get("/employee/:id", protect, adminOnly, getEmployee);
router.get("/employee/:id/download", protect, adminOnly, downloadEmployee);
router.post(
  "/employee/:id/transfer",
  protect,
  adminOnly,
  upload.single("orderUpload"),
  addTransfer,
);
router.put(
  "/employee/:id/transfer/:transferId",
  protect,
  adminOnly,
  upload.single("orderUpload"),
  editTransfer,
);
router.delete(
  "/employee/:id/transfer/:transferId",
  protect,
  adminOnly,
  deleteTransfer,
);
router.put(
  "/employee/:id/edit-request/:reqId",
  protect,
  adminOnly,
  handleEditRequest,
);

// ── Announcement Routes ───────────────────────────────────────────────────────
router.post("/announcements", protect, dsOnly, async (req, res) => {
  try {
    const { title, message, priority } = req.body;
    if (!title || !message)
      return res
        .status(400)
        .json({ success: false, message: "Title and message required" });
    const ann = await Announcement.create({
      title,
      message,
      priority: priority || "normal",
      createdBy: req.user._id,
      createdByName: `${req.user.firstName} ${req.user.lastName}`,
    });
    res.json({
      success: true,
      announcement: ann,
      message: "Announcement sent!",
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/announcements", protect, async (req, res) => {
  try {
    const announcements = await Announcement.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(20);
    res.json({ success: true, announcements });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete("/announcements/:id", protect, dsOnly, async (req, res) => {
  try {
    await Announcement.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: "Announcement removed" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

// ── SO Admin — Send Notification to Employee ──────────────────────────────────
router.post("/notify-employee/:id", protect, soOnly, async (req, res) => {
  try {
    const { message, type } = req.body;
    if (!message)
      return res
        .status(400)
        .json({ success: false, message: "Message required" });
    const User = require("../models/User");
    const employee = await User.findById(req.params.id);
    if (!employee)
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });
    if (!employee.notifications) employee.notifications = [];
    employee.notifications.push({
      from: "so_admin",
      fromName: `${req.user.firstName} ${req.user.lastName}`,
      type: type || "info",
      message,
    });
    await employee.save();
    res.json({ success: true, message: "Notification sent!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
