const User = require('../models/User');
const { sendRejectionEmail } = require('../utils/email');
const { getFileUrl } = require('../utils/fileHelper');

// ── Dashboard Stats ───────────────────────────────────────────────────────────
exports.getDashboard = async (req, res) => {
  try {
    const total      = await User.countDocuments({ role: 'employee' });
    const pending    = await User.countDocuments({ role: 'employee', soStatus: 'pending' });
    const verified   = await User.countDocuments({ role: 'employee', soStatus: 'verified' });
    const reverted   = await User.countDocuments({ role: 'employee', soStatus: 'reverted' });
    const rejected   = await User.countDocuments({ role: 'employee', soStatus: 'rejected' });

    const recentEmployees = await User.find({ role: 'employee' })
      .select('firstName lastName email employeeCode soStatus approvalStatus createdAt')
      .sort({ createdAt: -1 }).limit(10);

    res.json({ success: true, stats: { total, pending, verified, reverted, rejected }, recentEmployees });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Get All Employees (for SO Admin) ─────────────────────────────────────────
exports.getAllEmployees = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 500 } = req.query;
    let query = { role: 'employee' };

    if (status && status !== 'all') query.soStatus = status;
    if (search) {
      query.$or = [
        { firstName:    { $regex: search, $options: 'i' } },
        { lastName:     { $regex: search, $options: 'i' } },
        { email:        { $regex: search, $options: 'i' } },
        { employeeCode: { $regex: search, $options: 'i' } },
      ];
    }

    const employees = await User.find(query).select('-password').sort({ createdAt: -1 })
      .skip((page - 1) * limit).limit(parseInt(limit));
    const total = await User.countDocuments(query);
    res.json({ success: true, employees, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Get Single Employee ───────────────────────────────────────────────────────
exports.getEmployee = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id).select('-password');
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    res.json({ success: true, employee });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Verify → Forward to DS Admin ─────────────────────────────────────────────
exports.verifyEmployee = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    employee.soStatus     = 'verified';
    employee.soNote       = req.body.note || 'Details verified by SO Admin';
    employee.soActionBy   = req.user._id;
    employee.soActionAt   = new Date();
    employee.approvalStatus = 'so_verified';  // now visible to DS Admin

    employee.notifications.push({
      from: 'so_admin', fromName: `${req.user.firstName} ${req.user.lastName}`,
      type: 'info',
      message: 'Your profile has been verified by SO Admin and forwarded to DS Admin for final approval.'
    });

    await employee.save();
    res.json({ success: true, message: 'Employee verified and forwarded to DS Admin' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Revert with Message ───────────────────────────────────────────────────────
exports.revertEmployee = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ success: false, message: 'Revert message required' });

    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    employee.soStatus       = 'reverted';
    employee.soNote         = message;
    employee.soActionBy     = req.user._id;
    employee.soActionAt     = new Date();
    employee.approvalStatus = 'reverted';

    // Notify employee on dashboard
    employee.notifications.push({
      from: 'so_admin', fromName: `${req.user.firstName} ${req.user.lastName}`,
      type: 'revert',
      message: `Your profile has been reverted by SO Admin. Please make corrections.\n\nReason: ${message}`
    });

    await employee.save();

    // Send email notification
    try {
      await sendRejectionEmail(employee.email, employee.firstName, message, 'revert', 'SO Admin');
    } catch (emailErr) {
      console.error('Email failed:', emailErr.message);
    }

    res.json({ success: true, message: 'Profile reverted with message. Employee notified.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Reject with Message ───────────────────────────────────────────────────────
exports.rejectEmployee = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ success: false, message: 'Rejection reason required' });

    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    employee.soStatus       = 'rejected';
    employee.soNote         = message;
    employee.soActionBy     = req.user._id;
    employee.soActionAt     = new Date();
    employee.approvalStatus = 'rejected';

    employee.notifications.push({
      from: 'so_admin', fromName: `${req.user.firstName} ${req.user.lastName}`,
      type: 'reject',
      message: `Your profile has been rejected by SO Admin.\n\nReason: ${message}`
    });

    await employee.save();

    try {
      await sendRejectionEmail(employee.email, employee.firstName, message, 'reject', 'SO Admin');
    } catch (emailErr) {
      console.error('Email failed:', emailErr.message);
    }

    res.json({ success: true, message: 'Employee rejected. Notification sent.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── SO Admin Setup ────────────────────────────────────────────────────────────
exports.setupAdmin = async (req, res) => {
  try {
    const admin = await User.findById(req.user._id);
    admin.adminDetails         = req.body;
    admin.adminDetailsComplete = true;
    admin.firstLoginComplete   = true;
    await admin.save();
    res.json({ success: true, message: 'SO Admin profile saved' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Transfer management (same as before) ─────────────────────────────────────
exports.addTransfer = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    const transfer = { ...req.body, addedByAdmin: true, addedAt: new Date() };
    if (req.file) transfer.orderUpload = getFileUrl(req.file);
    employee.transfers.push(transfer);
    await employee.save();
    res.json({ success: true, message: 'Transfer added' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.editTransfer = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    const transfer = employee.transfers.id(req.params.transferId);
    if (!transfer) return res.status(404).json({ success: false, message: 'Transfer not found' });
    Object.assign(transfer, req.body);
    if (req.file) transfer.orderUpload = getFileUrl(req.file);
    await employee.save();
    res.json({ success: true, message: 'Transfer updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteTransfer = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    employee.transfers.pull(req.params.transferId);
    await employee.save();
    res.json({ success: true, message: 'Transfer deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Mark notifications read ───────────────────────────────────────────────────
exports.markRead = async (req, res) => {
  try {
    await User.updateOne(
      { _id: req.params.id, 'notifications._id': req.params.notifId },
      { $set: { 'notifications.$.isRead': true } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
