const User = require('../models/User');
const { getFileUrl } = require('../utils/fileHelper');

// ── Helper: calc years in current department ──────────────────────────────────
const calcYearsInDept = (employee) => {
  const currentTransfer = employee.transfers?.find(t => t.noTransferTillDate || t.joiningDate);
  const since = employee.workingDepartmentSince || currentTransfer?.joiningDate || employee.createdAt;
  if (!since) return 0;
  return (Date.now() - new Date(since)) / (1000 * 60 * 60 * 24 * 365);
};

const userPayload = (user) => ({
  id: user._id, email: user.email, role: user.role,
  firstName: user.firstName, lastName: user.lastName,
  firstLoginComplete: user.firstLoginComplete,
  approvalStatus: user.approvalStatus,
  adminDetailsComplete: user.adminDetailsComplete,
});

// ── Admin Setup ───────────────────────────────────────────────────────────────
exports.setupAdmin = async (req, res) => {
  try {
    const admin = await User.findById(req.user._id);
    admin.adminDetails        = req.body;
    admin.adminDetailsComplete = true;
    admin.firstLoginComplete  = true;
    await admin.save();
    res.json({ success: true, message: 'Admin profile saved' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── SO Dashboard ──────────────────────────────────────────────────────────────
exports.getSODashboard = async (req, res) => {
  try {
    const total    = await User.countDocuments({ role: 'employee' });
    const pending  = await User.countDocuments({ role: 'employee', soStatus: 'pending' });
    const verified = await User.countDocuments({ role: 'employee', soStatus: 'verified' });
    const reverted = await User.countDocuments({ role: 'employee', soStatus: 'reverted' });
    const approved = await User.countDocuments({ role: 'employee', approvalStatus: 'approved' });
    const deptAlertCount = await User.countDocuments({ role: 'employee', workingDepartmentSince: { $lte: new Date(Date.now() - 4*365*24*60*60*1000) } });

    // Avg response time (days between createdAt and soActionAt)
    const respondedEmps = await User.find({ role:'employee', soActionAt:{ $exists:true } }).select('createdAt soActionAt');
    let avgResponse = 0;
    if (respondedEmps.length > 0) {
      const totalHours = respondedEmps.reduce((acc, e) => {
        return acc + (new Date(e.soActionAt) - new Date(e.createdAt)) / (1000*60*60);
      }, 0);
      avgResponse = Math.round(totalHours / respondedEmps.length);
    }

    const recentEmployees = await User.find({ role: 'employee' })
      .select('firstName lastName email employeeCode soStatus approvalStatus createdAt workingDepartmentSince transfers')
      .sort({ createdAt: -1 }).limit(10);

    const employeesWithAlert = recentEmployees.map(emp => ({
      ...emp.toObject(),
      yearsInDept: calcYearsInDept(emp),
      deptAlert: calcYearsInDept(emp) >= 4
    }));

    res.json({
      success: true,
      stats: { total, pending, verified, reverted, approved, deptAlertCount, avgResponseHours: avgResponse },
      recentEmployees: employeesWithAlert
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── DS Dashboard ──────────────────────────────────────────────────────────────
exports.getDSDashboard = async (req, res) => {
  try {
    const total    = await User.countDocuments({ role: 'employee', soStatus: 'verified' });
    const pending  = await User.countDocuments({ role: 'employee', soStatus: 'verified', dsStatus: 'pending' });
    const approved = await User.countDocuments({ role: 'employee', soStatus: 'verified', dsStatus: 'approved' });
    const rejected = await User.countDocuments({ role: 'employee', soStatus: 'verified', dsStatus: 'rejected' });
    const hold     = await User.countDocuments({ role: 'employee', soStatus: 'verified', dsStatus: 'hold' });
    const totalAllEmployees = await User.countDocuments({ role: 'employee' });

    // Avg response time (hours between soActionAt and dsActionAt)
    const respondedEmps = await User.find({ role:'employee', dsActionAt:{ $exists:true }, soActionAt:{ $exists:true } }).select('soActionAt dsActionAt');
    let avgResponse = 0;
    if (respondedEmps.length > 0) {
      const totalHours = respondedEmps.reduce((acc, e) => {
        return acc + (new Date(e.dsActionAt) - new Date(e.soActionAt)) / (1000*60*60);
      }, 0);
      avgResponse = Math.round(totalHours / respondedEmps.length);
    }

    const recentEmployees = await User.find({ role: 'employee', soStatus: 'verified' })
      .select('firstName lastName email employeeCode dsStatus approvalStatus createdAt workingDepartmentSince transfers')
      .sort({ createdAt: -1 }).limit(10);

    const employeesWithAlert = recentEmployees.map(emp => ({
      ...emp.toObject(),
      yearsInDept: calcYearsInDept(emp),
      deptAlert: calcYearsInDept(emp) >= 4
    }));

    res.json({
      success: true,
      stats: { total, pending, approved, rejected, hold, totalAllEmployees, avgResponseHours: avgResponse },
      recentEmployees: employeesWithAlert
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── SO: Get All Employees ─────────────────────────────────────────────────────
exports.getSOEmployees = async (req, res) => {
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
    const employees = await User.find(query).select('-password')
      .sort({ createdAt: -1 }).skip((page-1)*limit).limit(parseInt(limit));
    const total = await User.countDocuments(query);

    const result = employees.map(emp => ({
      ...emp.toObject(),
      yearsInDept: calcYearsInDept(emp),
      deptAlert:   calcYearsInDept(emp) >= 4
    }));

    res.json({ success: true, employees: result, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── DS: Get Forwarded Employees ───────────────────────────────────────────────
exports.getDSEmployees = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 500 } = req.query;
    let query = { role: 'employee', soStatus: 'verified' }; // DS only sees SO-verified
    if (status && status !== 'all') query.dsStatus = status;
    if (search) {
      query.$or = [
        { firstName:    { $regex: search, $options: 'i' } },
        { lastName:     { $regex: search, $options: 'i' } },
        { email:        { $regex: search, $options: 'i' } },
        { employeeCode: { $regex: search, $options: 'i' } },
      ];
    }
    const employees = await User.find(query).select('-password')
      .sort({ createdAt: -1 }).skip((page-1)*limit).limit(parseInt(limit));
    const total = await User.countDocuments(query);

    const result = employees.map(emp => ({
      ...emp.toObject(),
      yearsInDept: calcYearsInDept(emp),
      deptAlert:   calcYearsInDept(emp) >= 4
    }));

    res.json({ success: true, employees: result, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Get Single Employee ───────────────────────────────────────────────────────
exports.getEmployee = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id).select('-password');
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    const yearsInDept = calcYearsInDept(employee);
    res.json({ success: true, employee: { ...employee.toObject(), yearsInDept, deptAlert: yearsInDept >= 4 } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── SO: Verify & Forward to DS ────────────────────────────────────────────────
exports.soVerify = async (req, res) => {
  try {
    const { note } = req.body;
    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    employee.soStatus    = 'verified';
    employee.soNote      = note || '';
    employee.soActionBy  = req.user._id;
    employee.soActionAt  = new Date();
    employee.approvalStatus = 'so_verified';

    // Notify employee
    if (!employee.notifications) employee.notifications = [];
    employee.notifications.push({
      from: 'so_admin', fromName: req.user.firstName,
      type: 'info',
      message: `Your profile has been verified by SO and forwarded to DS for approval.${note ? ' Note: ' + note : ''}`
    });

    await employee.save();
    res.json({ success: true, message: 'Employee verified and forwarded to DS' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── SO: Revert to Employee ────────────────────────────────────────────────────
exports.soRevert = async (req, res) => {
  try {
    const { note } = req.body;
    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    employee.soStatus    = 'reverted';
    employee.soNote      = note || '';
    employee.soActionBy  = req.user._id;
    employee.soActionAt  = new Date();
    employee.approvalStatus = 'reverted';

    if (!employee.notifications) employee.notifications = [];
    employee.notifications.push({
      from: 'so_admin', fromName: req.user.firstName,
      type: 'revert',
      message: `Your profile has been reverted for corrections.${note ? ' Reason: ' + note : ''}`
    });

    await employee.save();
    res.json({ success: true, message: 'Employee profile reverted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── DS: Approve ───────────────────────────────────────────────────────────────
exports.dsApprove = async (req, res) => {
  try {
    const { note } = req.body;
    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    if (employee.soStatus !== 'verified')
      return res.status(400).json({ success: false, message: 'Employee must be verified by SO first' });

    employee.dsStatus    = 'approved';
    employee.dsNote      = note || '';
    employee.dsActionBy  = req.user._id;
    employee.dsActionAt  = new Date();
    employee.approvalStatus = 'approved';

    if (!employee.notifications) employee.notifications = [];
    employee.notifications.push({
      from: 'ds_admin', fromName: req.user.firstName,
      type: 'approve',
      message: `Congratulations! Your profile has been approved by DS.${note ? ' Note: ' + note : ''}`
    });

    await employee.save();
    res.json({ success: true, message: 'Employee approved' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── DS: Reject ────────────────────────────────────────────────────────────────
exports.dsReject = async (req, res) => {
  try {
    const { note } = req.body;
    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    if (employee.soStatus !== 'verified')
      return res.status(400).json({ success: false, message: 'Employee must be verified by SO first' });

    employee.dsStatus    = 'rejected';
    employee.dsNote      = note || '';
    employee.dsActionBy  = req.user._id;
    employee.dsActionAt  = new Date();
    employee.approvalStatus = 'rejected';

    if (!employee.notifications) employee.notifications = [];
    employee.notifications.push({
      from: 'ds_admin', fromName: req.user.firstName,
      type: 'reject',
      message: `Your profile has been rejected.${note ? ' Reason: ' + note : ''}`
    });

    await employee.save();
    res.json({ success: true, message: 'Employee rejected' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── DS: Hold ──────────────────────────────────────────────────────────────────
exports.dsHold = async (req, res) => {
  try {
    const { note } = req.body;
    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    if (employee.soStatus !== 'verified')
      return res.status(400).json({ success: false, message: 'Employee must be verified by SO first' });

    employee.dsStatus    = 'hold';
    employee.dsNote      = note || '';
    employee.dsActionBy  = req.user._id;
    employee.dsActionAt  = new Date();
    employee.approvalStatus = 'hold';

    if (!employee.notifications) employee.notifications = [];
    employee.notifications.push({
      from: 'ds_admin', fromName: req.user.firstName,
      type: 'hold',
      message: `Your profile has been put on hold.${note ? ' Reason: ' + note : ''}`
    });

    await employee.save();
    res.json({ success: true, message: 'Employee put on hold' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Add Transfer (Admin) ──────────────────────────────────────────────────────
exports.addTransfer = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    const transfer = {
      postHeld: req.body.postHeld, departmentName: req.body.departmentName,
      joiningDate: req.body.joiningDate || null, relievingDate: req.body.relievingDate || null,
      noTransferTillDate: req.body.noTransferTillDate === 'true' || req.body.noTransferTillDate === true,
      previousDepartment: req.body.previousDepartment, currentDepartment: req.body.currentDepartment,
      orderNo: req.body.orderNo, orderDate: req.body.orderDate || null,
      addressOfOrganisation: req.body.addressOfOrganisation, remarks: req.body.remarks,
      addedByAdmin: true, addedAt: new Date(),
    };
    if (req.file) transfer.orderUpload = getFileUrl(req.file);
    employee.transfers.push(transfer);
    await employee.save();
    res.json({ success: true, message: 'Transfer added successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Edit Transfer ─────────────────────────────────────────────────────────────
exports.editTransfer = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    const transfer = employee.transfers.id(req.params.transferId);
    if (!transfer) return res.status(404).json({ success: false, message: 'Transfer not found' });
    if (!transfer.addedByAdmin)
      return res.status(403).json({ success: false, message: 'Can only edit admin-added transfers' });
    Object.assign(transfer, {
      postHeld: req.body.postHeld || transfer.postHeld,
      departmentName: req.body.departmentName || transfer.departmentName,
      joiningDate: req.body.joiningDate || transfer.joiningDate,
      relievingDate: req.body.relievingDate || transfer.relievingDate,
      orderNo: req.body.orderNo || transfer.orderNo,
      orderDate: req.body.orderDate || transfer.orderDate,
      remarks: req.body.remarks !== undefined ? req.body.remarks : transfer.remarks,
    });
    if (req.file) transfer.orderUpload = getFileUrl(req.file);
    await employee.save();
    res.json({ success: true, message: 'Transfer updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Delete Transfer ───────────────────────────────────────────────────────────
exports.deleteTransfer = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    const transfer = employee.transfers.id(req.params.transferId);
    if (!transfer) return res.status(404).json({ success: false, message: 'Transfer not found' });
    if (!transfer.addedByAdmin)
      return res.status(403).json({ success: false, message: 'Can only delete admin-added transfers' });
    employee.transfers.pull(req.params.transferId);
    await employee.save();
    res.json({ success: true, message: 'Transfer deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Download Employee ─────────────────────────────────────────────────────────
exports.downloadEmployee = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id).select('-password');
    res.json({ success: true, employee });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Handle Edit Request ───────────────────────────────────────────────────────
exports.handleEditRequest = async (req, res) => {
  try {
    const { action } = req.body;
    const employee = await User.findById(req.params.id);
    const editReq  = employee.editRequests.id(req.params.reqId);
    if (!editReq) return res.status(404).json({ success: false, message: 'Edit request not found' });
    editReq.status = action === 'approve' ? 'approved' : 'rejected';
    if (action === 'approve' && editReq.newValue) Object.assign(employee, editReq.newValue);
    await employee.save();
    res.json({ success: true, message: `Edit request ${editReq.status}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Public Stats (no auth) ────────────────────────────────────────────────────
exports.getPublicStats = async (req, res) => {
  try {
    const total    = await User.countDocuments({ role: 'employee', isRegistrationComplete: true });
    const approved = await User.countDocuments({ role: 'employee', approvalStatus: 'approved' });

    // Avg response time: avg days between createdAt and approvedAt for approved employees
    const approvedEmps = await User.find({
      role: 'employee', approvalStatus: 'approved', approvedAt: { $exists: true }
    }).select('createdAt approvedAt');

    let avgHours = 24; // default
    if (approvedEmps.length > 0) {
      const totalHours = approvedEmps.reduce((sum, e) => {
        const diff = new Date(e.approvedAt) - new Date(e.createdAt);
        return sum + diff / (1000 * 60 * 60);
      }, 0);
      avgHours = Math.round(totalHours / approvedEmps.length);
    }

    res.json({ success: true, stats: { total, approved, avgHours } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Public Stats (no auth required) ──────────────────────────────────────────
exports.getPublicStats = async (req, res) => {
  try {
    const total    = await User.countDocuments({ role: 'employee' });
    const approved = await User.countDocuments({ role: 'employee', approvalStatus: 'approved' });

    // Avg response time — avg days between createdAt and dsActionAt for approved employees
    const approvedEmps = await User.find({
      role: 'employee', approvalStatus: 'approved', dsActionAt: { $exists: true }
    }).select('createdAt dsActionAt');

    let avgHours = 24; // default
    if (approvedEmps.length > 0) {
      const totalHours = approvedEmps.reduce((acc, e) => {
        return acc + (new Date(e.dsActionAt) - new Date(e.createdAt)) / (1000 * 60 * 60);
      }, 0);
      avgHours = Math.round(totalHours / approvedEmps.length);
    }

    res.json({ success: true, stats: { total, approved, avgResponseHours: avgHours } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
