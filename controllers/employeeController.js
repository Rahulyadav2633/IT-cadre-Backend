const User = require('../models/User');

// ── Get Profile ───────────────────────────────────────────────────────────────
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Save Basic Extra Details (designation, working dept, salaried dept) ───────
exports.saveBasicExtra = async (req, res) => {
  try {
    const { designation, workingDepartment, salariedDepartment } = req.body;
    const user = await User.findById(req.user._id);
    user.designation        = designation;
    user.workingDepartment  = workingDepartment;
    user.salariedDepartment = salariedDepartment;
    await user.save();
    res.json({ success: true, message: 'Basic extra details saved' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Save Appointment Details ──────────────────────────────────────────────────
exports.saveAppointment = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.appointment              = req.body;
    user.appointmentDetailsComplete = true;
    await user.save();
    res.json({ success: true, message: 'Appointment details saved' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Save Education Details ────────────────────────────────────────────────────
exports.saveEducation = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.education              = Array.isArray(req.body.education) ? req.body.education : [req.body];
    user.educationDetailsComplete = true;
    await user.save();
    res.json({ success: true, message: 'Education details saved' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Save Experience Details ───────────────────────────────────────────────────
exports.saveExperience = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    let experiences = JSON.parse(req.body.experiences || '[]');
    experiences = experiences.map((exp, i) => {
      if (req.files && req.files[`experienceCertificate_${i}`]) {
        exp.experienceCertificate = `/uploads/${req.files[`experienceCertificate_${i}`][0].filename}`;
      }
      return exp;
    });
    user.experience              = experiences;
    user.experienceDetailsComplete = true;
    await user.save();
    res.json({ success: true, message: 'Experience details saved' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Save Transfer Details ─────────────────────────────────────────────────────
exports.saveTransfers = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    let transfers = JSON.parse(req.body.transfers || '[]');
    transfers = transfers.map((t, i) => {
      if (req.files && req.files[`orderUpload_${i}`]) {
        t.orderUpload = `/uploads/${req.files[`orderUpload_${i}`][0].filename}`;
      }
      return t;
    });
    user.transfers       = transfers;
    user.transfersComplete = true;
    await user.save();
    res.json({ success: true, message: 'Transfer details saved' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Save Training Details ─────────────────────────────────────────────────────
exports.saveTraining = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    let trainings = JSON.parse(req.body.trainings || '[]');
    trainings = trainings.map((t, i) => {
      if (req.files && req.files[`trainingCertificate_${i}`]) {
        t.trainingCertificate = `/uploads/${req.files[`trainingCertificate_${i}`][0].filename}`;
      }
      return t;
    });
    user.training          = trainings;
    user.trainingComplete  = true;
    user.firstLoginComplete = true;
    await user.save();
    res.json({ success: true, message: 'Training details saved. Profile submitted for admin approval.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Edit Profile Request ──────────────────────────────────────────────────────
exports.editProfile = async (req, res) => {
  try {
    const user    = await User.findById(req.user._id);
    const updates = req.body;
    user.editRequests.push({ field: 'profile', newValue: updates, status: 'pending' });
    await user.save();
    res.json({ success: true, message: 'Edit request submitted for admin approval' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Full Profile Edit ─────────────────────────────────────────────────────────
exports.editFull = async (req, res) => {
  try {
    const user    = await User.findById(req.user._id);
    const body    = req.body;

    // Parse JSON strings for nested objects/arrays
    const parseField = (val) => {
      if (typeof val === 'string') {
        try { return JSON.parse(val); } catch { return val; }
      }
      return val;
    };

    // Basic fields
    const basicFields = [
      'firstName','middleName','lastName','fatherName','motherName',
      'gender','dob','maritalStatus','aadhaar','pan','mobile',
      'category','bloodGroup','disability','designation',
      'workingDepartment','salariedDepartment'
    ];
    basicFields.forEach(f => { if (body[f] !== undefined) user[f] = body[f]; });

    // Address fields
    if (body.permanentAddress)     user.permanentAddress     = parseField(body.permanentAddress);
    if (body.correspondenceAddress) user.correspondenceAddress = parseField(body.correspondenceAddress);

    // Nested objects/arrays — parse from JSON string if needed
    if (body.appointment) user.appointment = parseField(body.appointment);
    if (body.education)   user.education   = parseField(body.education);
    if (body.experience)  user.experience  = parseField(body.experience);
    if (body.training)    user.training    = parseField(body.training);

    // Transfers — keep admin-added, replace employee ones
    if (body.transfers) {
      const parsed = parseField(body.transfers);
      const adminTransfers = user.transfers.filter(t => t.addedByAdmin);
      user.transfers = [...adminTransfers, ...parsed.filter(t => !t.addedByAdmin)];
    }

    // Reset approval workflow — employee edited so needs re-review
    user.approvalStatus = 'pending';
    user.soStatus       = 'pending';
    user.dsStatus       = 'pending';
    user.soNote         = '';
    user.dsNote         = '';
    user.soActionBy     = undefined;
    user.dsActionBy     = undefined;
    user.soActionAt     = undefined;
    user.dsActionAt     = undefined;

    if (req.file) user.photograph = `/uploads/${req.file.filename}`;
    await user.save();
    res.json({ success: true, message: 'Profile updated. Pending SO review.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};