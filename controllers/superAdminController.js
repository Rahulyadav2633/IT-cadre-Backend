const User         = require('../models/User');
const Announcement = require('../models/Announcement');
const { getFileUrl } = require('../utils/fileHelper');

// ── Helper ─────────────────────────────────────────────────────────────────────
const safeUser = (u) => ({
  _id: u._id, firstName: u.firstName, lastName: u.lastName,
  email: u.email, mobile: u.mobile, role: u.role,
  employeeCode: u.employeeCode, designation: u.designation,
  workingDepartment: u.workingDepartment,
  approvalStatus: u.approvalStatus,
  soStatus: u.soStatus, dsStatus: u.dsStatus,
  adminDetailsComplete: u.adminDetailsComplete,
  isRegistrationComplete: u.isRegistrationComplete,
  createdAt: u.createdAt,
});

const calcYearsInDept = (employee) => {
  const since = employee.workingDepartmentSince || employee.createdAt;
  if (!since) return 0;
  return (Date.now() - new Date(since)) / (1000 * 60 * 60 * 24 * 365);
};

// ── Dashboard Stats ────────────────────────────────────────────────────────────
exports.getDashboard = async (req, res) => {
  try {
    const [total, approved, pending, rejected, hold, soAdmins, dsAdmins] = await Promise.all([
      User.countDocuments({ role: 'employee' }),
      User.countDocuments({ role: 'employee', approvalStatus: 'approved' }),
      User.countDocuments({ role: 'employee', approvalStatus: 'pending' }),
      User.countDocuments({ role: 'employee', approvalStatus: 'rejected' }),
      User.countDocuments({ role: 'employee', approvalStatus: 'hold' }),
      User.find({ role: 'so_admin' }).select('-password'),
      User.find({ role: 'ds_admin' }).select('-password'),
    ]);

    const recent = await User.find({ role: 'employee' })
      .select('firstName lastName email employeeCode approvalStatus createdAt')
      .sort({ createdAt: -1 }).limit(10);

    res.json({ success: true, stats: { total, approved, pending, rejected, hold },
      soAdmins, dsAdmins, recentEmployees: recent });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Get All Users ──────────────────────────────────────────────────────────────
exports.getAllUsers = async (req, res) => {
  try {
    const { role, search } = req.query;
    let query = {};
    if (role) query.role = role;
    if (search) {
      query.$or = [
        { firstName:    { $regex: search, $options: 'i' } },
        { lastName:     { $regex: search, $options: 'i' } },
        { email:        { $regex: search, $options: 'i' } },
        { mobile:       { $regex: search, $options: 'i' } },
        { employeeCode: { $regex: search, $options: 'i' } },
      ];
    }
    const users = await User.find(query).select('-password').sort({ createdAt: -1 }).limit(500);
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


// ── Get Single Employee ───────────────────────────────────────────────────────
exports.getEmployee = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id).select('-password');
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    const obj = employee.toObject();
    const yearsInDept = calcYearsInDept(employee);
    obj.deptYears = Math.round(yearsInDept * 10) / 10;
    obj.deptAlert = yearsInDept >= 4;
    res.json({ success: true, employee: obj });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Create SO Admin ────────────────────────────────────────────────────────────
exports.createSOAdmin = async (req, res) => {
  try {
    const { firstName, lastName, email, mobile, password } = req.body;
    if (!firstName || !email || !mobile || !password)
      return res.status(400).json({ success: false, message: 'All fields required' });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing)
      return res.status(400).json({ success: false, message: 'Email already registered' });

    const admin = await User.create({
      firstName, lastName, email: email.toLowerCase(), mobile,
      password, role: 'so_admin',
      isEmailVerified: true, isRegistrationComplete: true,
      firstLoginComplete: true, adminDetailsComplete: true,
    });
    res.json({ success: true, message: 'SO Admin created!', user: safeUser(admin) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Create DS Admin ────────────────────────────────────────────────────────────
exports.createDSAdmin = async (req, res) => {
  try {
    const { firstName, lastName, email, mobile, password } = req.body;
    if (!firstName || !email || !mobile || !password)
      return res.status(400).json({ success: false, message: 'All fields required' });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing)
      return res.status(400).json({ success: false, message: 'Email already registered' });

    const admin = await User.create({
      firstName, lastName, email: email.toLowerCase(), mobile,
      password, role: 'ds_admin',
      isEmailVerified: true, isRegistrationComplete: true,
      firstLoginComplete: true, adminDetailsComplete: true,
    });
    res.json({ success: true, message: 'DS Admin created!', user: safeUser(admin) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Promote Employee to Admin ──────────────────────────────────────────────────
exports.promoteToAdmin = async (req, res) => {
  try {
    const { userId, adminRole, adminEmail, adminMobile, adminPassword } = req.body;
    if (!['so_admin','ds_admin'].includes(adminRole))
      return res.status(400).json({ success: false, message: 'Invalid admin role' });

    const employee = await User.findById(userId);
    if (!employee || employee.role !== 'employee')
      return res.status(404).json({ success: false, message: 'Employee not found' });

    const existing = await User.findOne({ email: adminEmail.toLowerCase() });
    if (existing)
      return res.status(400).json({ success: false, message: 'Admin email already in use' });

    const adminAccount = await User.create({
      firstName: employee.firstName, lastName: employee.lastName,
      email: adminEmail.toLowerCase(), mobile: adminMobile || employee.mobile,
      password: adminPassword, role: adminRole,
      isEmailVerified: true, isRegistrationComplete: true,
      firstLoginComplete: true, adminDetailsComplete: true,
      linkedEmployeeId: employee._id,
    });

    res.json({ success: true, message: `Promoted to ${adminRole}!`, adminAccount: safeUser(adminAccount) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Revoke Admin ───────────────────────────────────────────────────────────────
exports.revokeAdmin = async (req, res) => {
  try {
    const admin = await User.findById(req.params.id);
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
    if (admin.role === 'super_admin')
      return res.status(403).json({ success: false, message: 'Cannot revoke super admin' });
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: `${admin.firstName}'s admin access revoked` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Change Role ────────────────────────────────────────────────────────────────
exports.changeRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!['employee','so_admin','ds_admin'].includes(role))
      return res.status(400).json({ success: false, message: 'Invalid role' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role === 'super_admin')
      return res.status(403).json({ success: false, message: 'Cannot change super admin role' });

    user.role = role;
    if (['so_admin','ds_admin'].includes(role)) {
      user.adminDetailsComplete = true;
      user.firstLoginComplete = true;
      user.isRegistrationComplete = true;
    }
    await user.save();
    res.json({ success: true, message: `Role changed to ${role}`, user: safeUser(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Delete User ────────────────────────────────────────────────────────────────
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role === 'super_admin')
      return res.status(403).json({ success: false, message: 'Cannot delete super admin' });
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: `${user.firstName} deleted` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// ── SUPER ADMIN: SO Admin Powers ──────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// ── Get All Employees (SO view) ────────────────────────────────────────────────
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
      deptAlert: calcYearsInDept(emp) >= 4,
    }));
    res.json({ success: true, employees: result, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Verify Employee (SO action) ────────────────────────────────────────────────
exports.soVerifyEmployee = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    employee.soStatus       = 'verified';
    employee.soNote         = req.body.note || 'Verified by Super Admin';
    employee.soActionBy     = req.user._id;
    employee.soActionAt     = new Date();
    employee.approvalStatus = 'so_verified';

    if (!employee.notifications) employee.notifications = [];
    employee.notifications.push({
      from: 'so_admin', fromName: req.user.firstName + ' (Super Admin)',
      type: 'info',
      message: `Your profile has been verified and forwarded to DS for approval.${req.body.note ? ' Note: ' + req.body.note : ''}`
    });

    await employee.save();
    res.json({ success: true, message: 'Employee verified and forwarded to DS' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Revert Employee (SO action) ────────────────────────────────────────────────
exports.soRevertEmployee = async (req, res) => {
  try {
    const { note } = req.body;
    if (!note) return res.status(400).json({ success: false, message: 'Reason required' });

    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    employee.soStatus       = 'reverted';
    employee.soNote         = note;
    employee.soActionBy     = req.user._id;
    employee.soActionAt     = new Date();
    employee.approvalStatus = 'reverted';

    if (!employee.notifications) employee.notifications = [];
    employee.notifications.push({
      from: 'so_admin', fromName: req.user.firstName + ' (Super Admin)',
      type: 'revert',
      message: `Your profile has been reverted for corrections. Reason: ${note}`
    });

    await employee.save();
    res.json({ success: true, message: 'Employee reverted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// ── SUPER ADMIN: DS Admin Powers ──────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// ── Get DS Employees (SO-verified only) ───────────────────────────────────────
exports.getDSEmployees = async (req, res) => {
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
    const employees = await User.find(query).select('-password')
      .sort({ createdAt: -1 }).skip((page-1)*limit).limit(parseInt(limit));
    const total = await User.countDocuments(query);

    const result = employees.map(emp => ({
      ...emp.toObject(),
      yearsInDept: calcYearsInDept(emp),
      deptAlert: calcYearsInDept(emp) >= 4,
    }));
    res.json({ success: true, employees: result, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Approve Employee (DS action) ───────────────────────────────────────────────
exports.dsApproveEmployee = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    employee.dsStatus       = 'approved';
    employee.dsNote         = req.body.note || 'Approved by Super Admin';
    employee.dsActionBy     = req.user._id;
    employee.dsActionAt     = new Date();
    employee.approvalStatus = 'approved';

    if (!employee.notifications) employee.notifications = [];
    employee.notifications.push({
      from: 'ds_admin', fromName: req.user.firstName + ' (Super Admin)',
      type: 'approve',
      message: `🎉 Congratulations! Your profile has been approved.`
    });

    await employee.save();
    res.json({ success: true, message: 'Employee approved' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Reject Employee (DS action) ────────────────────────────────────────────────
exports.dsRejectEmployee = async (req, res) => {
  try {
    const { note } = req.body;
    if (!note) return res.status(400).json({ success: false, message: 'Reason required' });

    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    employee.dsStatus       = 'rejected';
    employee.dsNote         = note;
    employee.dsActionBy     = req.user._id;
    employee.dsActionAt     = new Date();
    employee.approvalStatus = 'rejected';

    if (!employee.notifications) employee.notifications = [];
    employee.notifications.push({
      from: 'ds_admin', fromName: req.user.firstName + ' (Super Admin)',
      type: 'reject',
      message: `Your profile has been rejected. Reason: ${note}`
    });

    await employee.save();
    res.json({ success: true, message: 'Employee rejected' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Hold Employee (DS action) ──────────────────────────────────────────────────
exports.dsHoldEmployee = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    employee.dsStatus       = 'hold';
    employee.dsNote         = req.body.note || 'Put on hold by Super Admin';
    employee.dsActionBy     = req.user._id;
    employee.dsActionAt     = new Date();
    employee.approvalStatus = 'hold';

    if (!employee.notifications) employee.notifications = [];
    employee.notifications.push({
      from: 'ds_admin', fromName: req.user.firstName + ' (Super Admin)',
      type: 'hold',
      message: `Your profile has been put on hold.${req.body.note ? ' Reason: ' + req.body.note : ''}`
    });

    await employee.save();
    res.json({ success: true, message: 'Employee put on hold' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Transfer Management (Admin) ────────────────────────────────────────────────
exports.addTransfer = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Not found' });
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
    res.json({ success: true, message: 'Transfer added' });
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

// ── Approval (legacy route — direct approve any employee) ─────────────────────
exports.approveEmployee = async (req, res) => {
  try {
    const { status, note } = req.body;
    const allowed = ['pending','approved','rejected','hold'];
    if (!allowed.includes(status))
      return res.status(400).json({ success: false, message: 'Invalid status' });

    const employee = await User.findById(req.params.id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    employee.approvalStatus = status;
    employee.approvalNote   = note || '';
    if (status === 'approved') {
      employee.soStatus = 'verified';
      employee.dsStatus = 'approved';
    }
    await employee.save();
    res.json({ success: true, message: `Employee status set to ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Dept Matrix ────────────────────────────────────────────────────────────────
exports.getDeptMatrix = async (req, res) => {
  try {
    const employees = await User.find({ role:'employee', isRegistrationComplete:true })
      .select('workingDepartment designation post appointment');

    const deptSet = new Set();
    const postSet = new Set();
    const matrix  = {};

    employees.forEach(emp => {
      const dept = emp.workingDepartment || emp.appointment?.department || 'Unassigned';
      const post = emp.post || emp.designation || emp.appointment?.postDesignation || 'Unassigned';
      deptSet.add(dept);
      postSet.add(post);
      if (!matrix[dept]) matrix[dept] = {};
      matrix[dept][post] = (matrix[dept][post] || 0) + 1;
    });

    res.json({ success: true,
      departments: Array.from(deptSet).sort(),
      posts: Array.from(postSet).sort(),
      matrix
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateMatrixCell = async (req, res) => {
  res.json({ success: true, message: 'Matrix updated' });
};

// ── Announcements ──────────────────────────────────────────────────────────────
exports.getAnnouncements = async (req, res) => {
  try {
    const announcements = await Announcement.find().sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, announcements });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.deleteAnnouncement = async (req, res) => {
  try {
    await Announcement.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Create Announcement ────────────────────────────────────────────────────────
exports.createAnnouncement = async (req, res) => {
  try {
    const { title, message, priority } = req.body;
    if (!title || !message)
      return res.status(400).json({ success: false, message: 'Title and message required' });
    const ann = await Announcement.create({
      title, message, priority: priority || 'normal',
      createdBy: req.user._id,
      createdByName: `${req.user.firstName} ${req.user.lastName}`,
    });
    res.json({ success: true, announcement: ann });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
