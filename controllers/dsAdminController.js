const User = require('../models/User');
const { sendRejectionEmail } = require('../utils/email');

// ── Helper: check 4+ years in working dept ───────────────────────────────────
const getDeptYears = (employee) => {
  if (!employee.workingDepartmentSince) return null;
  const ms    = Date.now() - new Date(employee.workingDepartmentSince).getTime();
  const years = ms / (1000 * 60 * 60 * 24 * 365.25);
  return Math.round(years * 10) / 10;
};

// ── Dashboard ─────────────────────────────────────────────────────────────────
exports.getDashboard = async (req, res) => {
  try {
    // DS Admin only sees employees that SO has verified
    const total    = await User.countDocuments({ role: 'employee', soStatus: 'verified' });
    const pending  = await User.countDocuments({ role: 'employee', soStatus: 'verified', dsStatus: 'pending' });
    const approved = await User.countDocuments({ role: 'employee', dsStatus: 'approved' });
    const rejected = await User.countDocuments({ role: 'employee', dsStatus: 'rejected' });
    const hold     = await User.countDocuments({ role: 'employee', dsStatus: 'hold' });

    // 4+ year alerts
    const allVerified = await User.find({ role: 'employee', soStatus: 'verified' })
      .select('firstName lastName workingDepartment workingDepartmentSince');
    const alerts = allVerified.filter(e => getDeptYears(e) > 4);

    const recentEmployees = await User.find({ role: 'employee', soStatus: 'verified' })
      .select('firstName lastName email employeeCode dsStatus approvalStatus workingDepartment workingDepartmentSince createdAt')
      .sort({ createdAt: -1 }).limit(10);

    res.json({
      success: true,
      stats: { total, pending, approved, rejected, hold, alertCount: alerts.length },
      recentEmployees,
      alerts: alerts.map(e => ({
        id: e._id, name: `${e.firstName} ${e.lastName}`,
        department: e.workingDepartment,
        years: getDeptYears(e)
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Get All Employees (SO-verified only) ──────────────────────────────────────
exports.getAllEmployees = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 500 } = req.query;
    let query = { role: 'employee', soStatus: 'verified' };

    if (status && status !== 'all') query.dsStatus = status;
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

    // Add dept years to each employee
    const enriched = employees.map(e => {
      const obj       = e.toObject();
      obj.deptYears   = getDeptYears(e);
      obj.deptAlert   = obj.deptYears > 4;
      return obj;
    });

    res.json({ success: true, employees: enriched, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Get Single Employee ───────────────────────────────────────────────────────
exports.getEmployee = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id).select('-password');
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    const obj     = employee.toObject();
    obj.deptYears = getDeptYears(employee);
    obj.deptAlert = obj.deptYears > 4;
    res.json({ success: true, employee: obj });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Approve ───────────────────────────────────────────────────────────────────
exports.approveEmployee = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    if (employee.soStatus !== 'verified')
      return res.status(400).json({ success: false, message: 'Employee not yet verified by SO Admin' });

    employee.dsStatus       = 'approved';
    employee.dsNote         = req.body.note || 'Approved by DS Admin';
    employee.dsActionBy     = req.user._id;
    employee.dsActionAt     = new Date();
    employee.approvalStatus = 'approved';

    employee.notifications.push({
      from: 'ds_admin', fromName: `${req.user.firstName} ${req.user.lastName}`,
      type: 'approve',
      message: '🎉 Congratulations! Your profile has been approved by DS Admin.'
    });

    await employee.save();
    res.json({ success: true, message: 'Employee approved successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Reject ────────────────────────────────────────────────────────────────────
exports.rejectEmployee = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ success: false, message: 'Reason required' });

    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    employee.dsStatus       = 'rejected';
    employee.dsNote         = message;
    employee.dsActionBy     = req.user._id;
    employee.dsActionAt     = new Date();
    employee.approvalStatus = 'rejected';

    employee.notifications.push({
      from: 'ds_admin', fromName: `${req.user.firstName} ${req.user.lastName}`,
      type: 'reject',
      message: `Your profile has been rejected by DS Admin.\n\nReason: ${message}`
    });

    await employee.save();

    try {
      await sendRejectionEmail(employee.email, employee.firstName, message, 'reject', 'DS Admin');
    } catch (e) { console.error('Email failed:', e.message); }

    res.json({ success: true, message: 'Employee rejected. Notification sent.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Hold ──────────────────────────────────────────────────────────────────────
exports.holdEmployee = async (req, res) => {
  try {
    const { message } = req.body;
    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    employee.dsStatus       = 'hold';
    employee.dsNote         = message || 'Profile put on hold by DS Admin';
    employee.dsActionBy     = req.user._id;
    employee.dsActionAt     = new Date();
    employee.approvalStatus = 'hold';

    employee.notifications.push({
      from: 'ds_admin', fromName: `${req.user.firstName} ${req.user.lastName}`,
      type: 'info',
      message: `Your profile has been put on hold by DS Admin.\n\n${message || 'Further review required.'}`
    });

    await employee.save();
    res.json({ success: true, message: 'Employee profile put on hold' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── DS Admin Setup ────────────────────────────────────────────────────────────
exports.setupAdmin = async (req, res) => {
  try {
    const admin = await User.findById(req.user._id);
    admin.adminDetails         = req.body;
    admin.adminDetailsComplete = true;
    admin.firstLoginComplete   = true;
    await admin.save();
    res.json({ success: true, message: 'DS Admin profile saved' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Transfer management ───────────────────────────────────────────────────────
exports.addTransfer = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Not found' });
    const transfer = { ...req.body, addedByAdmin: true, addedAt: new Date() };
    if (req.file) transfer.orderUpload = `/uploads/${req.file.filename}`;
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
    if (!employee) return res.status(404).json({ success: false, message: 'Not found' });
    const transfer = employee.transfers.id(req.params.transferId);
    if (!transfer) return res.status(404).json({ success: false, message: 'Transfer not found' });
    Object.assign(transfer, req.body);
    if (req.file) transfer.orderUpload = `/uploads/${req.file.filename}`;
    await employee.save();
    res.json({ success: true, message: 'Transfer updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteTransfer = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Not found' });
    employee.transfers.pull(req.params.transferId);
    await employee.save();
    res.json({ success: true, message: 'Transfer deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Send message to employee ──────────────────────────────────────────────────
exports.sendMessage = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ success: false, message: 'Message required' });
    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Not found' });

    employee.notifications.push({
      from: 'ds_admin', fromName: `${req.user.firstName} ${req.user.lastName}`,
      type: 'info', message
    });
    await employee.save();

    try {
      await sendRejectionEmail(employee.email, employee.firstName, message, 'info', 'DS Admin');
    } catch (e) { console.error('Email failed:', e.message); }

    res.json({ success: true, message: 'Message sent to employee' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
