const jwt = require("jsonwebtoken");
const User = require("../models/User");
const OTP = require("../models/OTP");
const { generateOTP, sendSMSOTP } = require("../utils/sms");
const { sendOTPEmail } = require("../utils/email");
const { getFileUrl } = require("../utils/fileHelper");

const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

const userPayload = (user) => ({
  id: user._id,
  email: user.email,
  mobile: user.mobile,
  role: user.role,
  firstName: user.firstName,
  lastName: user.lastName,
  firstLoginComplete: user.firstLoginComplete,
  approvalStatus: user.approvalStatus,
  adminDetailsComplete: user.adminDetailsComplete,
});

// ── Login ──────────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password, loginAs } = req.body;
    if (!email || !password)
      return res
        .status(400)
        .json({ success: false, message: "Email and password required" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.password)
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });

    const isMatch = await user.comparePassword(password);
    if (!isMatch)
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });

    if (!user.isRegistrationComplete)
      return res
        .status(400)
        .json({
          success: false,
          message: "Please complete registration first",
        });

    // Role mismatch check
    if (loginAs === "employee" && user.role !== "employee")
      return res
        .status(403)
        .json({ success: false, message: "Please use the Admin login page" });
    if (loginAs === "so_admin" && user.role !== "so_admin")
      return res
        .status(403)
        .json({ success: false, message: "Invalid credentials for SO Admin" });
    if (loginAs === "ds_admin" && user.role !== "ds_admin")
      return res
        .status(403)
        .json({ success: false, message: "Invalid credentials for DS Admin" });
    if (loginAs === "super_admin" && user.role !== "super_admin")
      return res
        .status(403)
        .json({
          success: false,
          message: "Invalid credentials for Super Admin",
        });

    // Admins — direct login, no OTP
    if (["super_admin", "so_admin", "ds_admin"].includes(user.role)) {
      const token = generateToken(user._id);
      return res.json({ success: true, token, user: userPayload(user) });
    }

    // ── Employee — send OTP to BOTH mobile AND email ──────────────────────────
    // Invalidate previous OTPs
    if (user.mobile)
      await OTP.updateMany(
        { mobile: user.mobile, purpose: "login", isUsed: false },
        { isUsed: true },
      );
    if (user.email)
      await OTP.updateMany(
        { email: user.email, purpose: "login", isUsed: false },
        { isUsed: true },
      );

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Save ONE record with both mobile + email so either can verify
    await OTP.create({
      mobile: user.mobile || null,
      email: user.email || null,
      otp,
      purpose: "login",
      expiresAt,
    });

    // Send to both channels (don't block if one fails)
    const sent = { mobile: false, email: false };
    const promises = [];

    // Use NODE_ENV to check for production
    const isProd = process.env.NODE_ENV === "production";

    if (user.mobile) {
      promises.push(
        sendSMSOTP(user.mobile, otp, "login")
          .then(() => {
            sent.mobile = true;
          })
          .catch((e) => console.error("SMS failed:", e.message)),
      );
    }
    if (user.email) {
      promises.push(
        sendOTPEmail(user.email, otp, "login")
          .then(() => {
            sent.email = true;
          })
          .catch((e) => console.error("Email OTP failed:", e.message)),
      );
    }
    // Wait with a reasonable timeout (e.g., 5 seconds) to prevent hanging
    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 5000));
    
    if (promises.length > 0) {
      await Promise.race([
        Promise.allSettled(promises),
        timeoutPromise
      ]);
    }

    // Log OTP to console so you can see it in Render logs while debugging
    console.log(`🔑 DEBUG OTP for ${user.email || user.mobile}: [ ${otp} ]`);

    res.json({
      success: true,
      otpSent: true,
      mobile: user.mobile,
      email: user.email,
      sent, // tells frontend which channels worked (might be false if timed out)
      message: "OTP sent to your registered mobile and email",
    });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ── Login OTP — accepts mobile OR email ───────────────────────────────────────
exports.loginOtp = async (req, res) => {
  try {
    const { mobile, email, otp } = req.body;
    if (!otp)
      return res.status(400).json({ success: false, message: "OTP required" });
    if (!mobile && !email)
      return res
        .status(400)
        .json({ success: false, message: "Mobile or email required" });

    // Find user
    let user = null;
    if (mobile) user = await User.findOne({ mobile });
    if (!user && email)
      user = await User.findOne({ email: email.toLowerCase() });
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "No account found" });

    if (!user.isRegistrationComplete)
      return res
        .status(400)
        .json({
          success: false,
          message: "Please complete registration first",
        });

    // Check OTP — match by mobile OR email
    const conditions = [];
    if (mobile)
      conditions.push({
        mobile,
        otp,
        purpose: "login",
        isUsed: false,
        expiresAt: { $gt: new Date() },
      });
    if (email)
      conditions.push({
        email: email.toLowerCase(),
        otp,
        purpose: "login",
        isUsed: false,
        expiresAt: { $gt: new Date() },
      });

    const record = await OTP.findOne(
      conditions.length === 1 ? conditions[0] : { $or: conditions },
    );
    if (!record)
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired OTP" });

    record.isUsed = true;
    await record.save();

    const token = generateToken(user._id);
    res.json({ success: true, token, user: userPayload(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Register Basic ────────────────────────────────────────────────────────────
exports.registerBasic = async (req, res) => {
  try {
    const body = req.body;
    const email = body.email?.toLowerCase();
    const mobile = body.mobile;

    if (!mobile || mobile.length !== 10)
      return res
        .status(400)
        .json({ success: false, message: "Valid 10-digit mobile required" });

    // ── Employee Code validation ───────────────────────────────────────────────
    if (body.employeeCode) {
      const code = body.employeeCode.trim().toUpperCase();
      if (!/^[A-Z0-9]{1,6}$/.test(code))
        return res.status(400).json({
          success: false,
          message: "Employee code must be up to 6 alphanumeric characters (A–Z, 0–9)",
        });
    }

    let user = await User.findOne({ email });
    if (user && user.isRegistrationComplete)
      return res
        .status(400)
        .json({ success: false, message: "Email already registered" });

    const permanentAddress = {
      house: body["permanentAddress.house"],
      street: body["permanentAddress.street"],
      landmark: body["permanentAddress.landmark"],
      locality: body["permanentAddress.locality"],
      city: body["permanentAddress.city"],
      district: body["permanentAddress.district"],
      state: body["permanentAddress.state"],
      pin: body["permanentAddress.pin"],
    };
    const correspondenceAddress = {
      house: body["correspondenceAddress.house"],
      street: body["correspondenceAddress.street"],
      landmark: body["correspondenceAddress.landmark"],
      locality: body["correspondenceAddress.locality"],
      city: body["correspondenceAddress.city"],
      district: body["correspondenceAddress.district"],
      state: body["correspondenceAddress.state"],
      pin: body["correspondenceAddress.pin"],
    };

    const data = {
      employeeCode: body.employeeCode,
      firstName: body.firstName,
      middleName: body.middleName,
      lastName: body.lastName,
      fatherName: body.fatherName,
      motherName: body.motherName,
      gender: body.gender,
      dob: body.dob,
      maritalStatus: body.maritalStatus,
      aadhaar: body.aadhaar,
      pan: body.pan,
      email,
      mobile,
      category: body.category,
      bloodGroup: body.bloodGroup,
      disability: body.disability,
      permanentAddress,
      correspondenceAddress,
      isEmailVerified: true,
      basicDetailsComplete: true,
      photograph: req.file ? (() => {
        const url = getFileUrl(req.file);
        console.log('📸 req.file:', JSON.stringify(req.file, null, 2));
        console.log('📸 Resolved photograph URL:', url);
        return url;
      })() : undefined,
    };

    if (user) {
      Object.assign(user, data);
      await user.save();
    } else {
      user = await User.create(data);
    }

    res.json({
      success: true,
      message: "Basic details saved",
      userId: user._id,
    });
  } catch (err) {
    // Surface Mongoose validation errors as 400
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ success: false, message: messages[0] });
    }
    // Duplicate key (e.g. employeeCode already taken)
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || "field";
      return res.status(400).json({
        success: false,
        message:
          field === "employeeCode"
            ? "Employee code already exists"
            : field === "email"
            ? "Email already registered"
            : `${field} already exists`,
      });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Register Password ─────────────────────────────────────────────────────────
exports.registerPassword = async (req, res) => {
  try {
    const { userId, password } = req.body;
    const user = await User.findById(userId);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    user.password = password;
    await user.save();
    res.json({ success: true, message: "Password set" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Register Complete ─────────────────────────────────────────────────────────
exports.registerComplete = async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    user.isRegistrationComplete = true;
    await user.save();
    const token = generateToken(user._id);
    res.json({
      success: true,
      message: "Registration complete",
      token,
      user: userPayload(user),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Get Me ────────────────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Reset Password — by mobile OR email ───────────────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { mobile, email, password } = req.body;
    if (!mobile && !email)
      return res
        .status(400)
        .json({ success: false, message: "Mobile or email required" });
    if (!password)
      return res
        .status(400)
        .json({ success: false, message: "Password required" });
    if (password.length < 6)
      return res
        .status(400)
        .json({ success: false, message: "Min 6 characters" });

    let user = null;
    if (mobile) user = await User.findOne({ mobile });
    if (!user && email)
      user = await User.findOne({ email: email.toLowerCase() });
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "No account found" });

    user.password = password;
    await user.save();
    res.json({ success: true, message: "Password reset successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Logout ────────────────────────────────────────────────────────────────────
exports.logout = async (req, res) => {
  try {
    const { blacklistToken } = require("../middleware/auth_middleware");
    if (req.token) blacklistToken(req.token);
    res.json({ success: true, message: "Logged out" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

