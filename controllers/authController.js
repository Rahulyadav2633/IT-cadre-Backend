const jwt = require("jsonwebtoken");
const User = require("../models/User");
const OTP = require("../models/OTP");
const { generateOTP, sendSMSOTP } = require("../utils/sms");
const { sendOTPEmail } = require("../utils/email");

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
      photograph: req.file ? `/uploads/${req.file.filename}` : undefined,
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













































// const jwt = require("jsonwebtoken");
// const User = require("../models/User");
// const OTP = require("../models/OTP");
// const { generateOTP, sendSMSOTP } = require("../utils/sms");
// const { sendOTPEmail } = require("../utils/email");

// /* ─────────────────────────────────────────────────────────────────────────────
//    TOKEN HELPERS
//    • Access token  → 15 min, signed with JWT_SECRET
//    • Refresh token → 7 days, signed with REFRESH_TOKEN_SECRET
//    Both are set as httpOnly, Secure, SameSite=Strict cookies — never in JS land.
// ───────────────────────────────────────────────────────────────────────────── */

// const generateAccessToken = (id) =>
//   jwt.sign({ id }, process.env.JWT_SECRET, {
//     expiresIn: "15m",
//   });

// const generateRefreshToken = (id) =>
//   jwt.sign({ id }, process.env.REFRESH_TOKEN_SECRET, {
//     expiresIn: "7d",
//   });

// /**
//  * generateToken — kept as a named export so any other file that does
//  * const { generateToken } = require('../controllers/authController')
//  * continues to work without changes.
//  * Internally it produces a short-lived access token (15 min).
//  */
// const generateToken = generateAccessToken;
// exports.generateToken = generateToken;

// /**
//  * Sets both tokens as httpOnly cookies on the response.
//  * Access  → short-lived (15 min)
//  * Refresh → long-lived  (7 days), stored under a different cookie name
//  */
// const setTokenCookies = (res, userId) => {
//   const accessToken = generateAccessToken(userId);
//   const refreshToken = generateRefreshToken(userId);

//   const isProd = process.env.NODE_ENV === "production";

//   // ── Access-token cookie ────────────────────────────────────────────────────
//   res.cookie("access_token", accessToken, {
//     httpOnly: true, // JS cannot read — prevents XSS theft
//     secure: isProd, // HTTPS only in production
//     sameSite: "strict", // CSRF mitigation
//     maxAge: 15 * 60 * 1000, // 15 minutes in ms
//   });

//   // ── Refresh-token cookie ───────────────────────────────────────────────────
//   res.cookie("refresh_token", refreshToken, {
//     httpOnly: true,
//     secure: isProd,
//     sameSite: "strict",
//     maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
//     path: "/api/auth/refresh", // Only sent to the refresh endpoint
//   });

//   return { accessToken, refreshToken };
// };

// /**
//  * Clears both auth cookies (used on logout).
//  */
// const clearTokenCookies = (res) => {
//   res.clearCookie("access_token", { httpOnly: true, sameSite: "strict" });
//   res.clearCookie("refresh_token", {
//     httpOnly: true,
//     sameSite: "strict",
//     path: "/api/auth/refresh",
//   });
// };

// /* ─────────────────────────────────────────────────────────────────────────────
//    USER PAYLOAD  (what we send to the client — no sensitive fields)
// ───────────────────────────────────────────────────────────────────────────── */

// const userPayload = (user) => ({
//   id: user._id,
//   email: user.email,
//   mobile: user.mobile,
//   role: user.role,
//   firstName: user.firstName,
//   lastName: user.lastName,
//   firstLoginComplete: user.firstLoginComplete,
//   approvalStatus: user.approvalStatus,
//   adminDetailsComplete: user.adminDetailsComplete,
// });

// /* ─────────────────────────────────────────────────────────────────────────────
//    REFRESH TOKEN ENDPOINT
//    POST /api/auth/refresh
//    Reads `refresh_token` cookie → issues a new access token (+ rotates refresh)
// ───────────────────────────────────────────────────────────────────────────── */

// exports.refresh = async (req, res) => {
//   try {
//     const token = req.cookies?.refresh_token;
//     if (!token)
//       return res
//         .status(401)
//         .json({ success: false, message: "No refresh token" });

//     // Verify
//     let decoded;
//     try {
//       decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
//     } catch {
//       clearTokenCookies(res);
//       return res
//         .status(401)
//         .json({
//           success: false,
//           message: "Refresh token expired or invalid. Please login again.",
//         });
//     }

//     // Make sure user still exists and the stored token matches (rotation guard)
//     const user = await User.findById(decoded.id).select("-password");
//     if (!user)
//       return res
//         .status(401)
//         .json({ success: false, message: "User not found" });

//     if (user.refreshToken !== token) {
//       // Possible token reuse attack — invalidate everything
//       user.refreshToken = null;
//       await user.save();
//       clearTokenCookies(res);
//       return res
//         .status(401)
//         .json({
//           success: false,
//           message: "Token reuse detected. Please login again.",
//         });
//     }

//     // Issue new pair (refresh-token rotation)
//     const { refreshToken: newRefresh } = setTokenCookies(res, user._id);
//     user.refreshToken = newRefresh;
//     await user.save();

//     res.json({ success: true, user: userPayload(user) });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// /* ─────────────────────────────────────────────────────────────────────────────
//    LOGIN
//    POST /api/auth/login
// ───────────────────────────────────────────────────────────────────────────── */

// exports.login = async (req, res) => {
//   try {
//     const { email, password, loginAs } = req.body;
//     if (!email || !password)
//       return res
//         .status(400)
//         .json({ success: false, message: "Email and password required" });

//     const user = await User.findOne({ email: email.toLowerCase() });
//     if (!user || !user.password)
//       return res
//         .status(401)
//         .json({ success: false, message: "Invalid credentials" });

//     const isMatch = await user.comparePassword(password);
//     if (!isMatch)
//       return res
//         .status(401)
//         .json({ success: false, message: "Invalid credentials" });

//     if (!user.isRegistrationComplete)
//       return res
//         .status(400)
//         .json({
//           success: false,
//           message: "Please complete registration first",
//         });

//     // Role-mismatch guards
//     const roleMismatch = {
//       employee: "employee",
//       so_admin: "so_admin",
//       ds_admin: "ds_admin",
//       super_admin: "super_admin",
//     };
//     if (loginAs && roleMismatch[loginAs] && user.role !== roleMismatch[loginAs])
//       return res
//         .status(403)
//         .json({
//           success: false,
//           message: "Role mismatch for the selected login page",
//         });

//     // ── Admin roles → direct login, set cookies ────────────────────────────
//     if (["super_admin", "so_admin", "ds_admin"].includes(user.role)) {
//       const { refreshToken } = setTokenCookies(res, user._id);
//       user.refreshToken = refreshToken;
//       await user.save();
//       return res.json({ success: true, user: userPayload(user) });
//     }

//     // ── Employee → OTP flow (no tokens yet) ──────────────────────────────────
//     if (user.mobile)
//       await OTP.updateMany(
//         { mobile: user.mobile, purpose: "login", isUsed: false },
//         { isUsed: true },
//       );
//     if (user.email)
//       await OTP.updateMany(
//         { email: user.email, purpose: "login", isUsed: false },
//         { isUsed: true },
//       );

//     const otp = generateOTP();
//     const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

//     await OTP.create({
//       mobile: user.mobile || null,
//       email: user.email || null,
//       otp,
//       purpose: "login",
//       expiresAt,
//     });

//     const sent = { mobile: false, email: false };
//     const promises = [];
//     if (user.mobile)
//       promises.push(
//         sendSMSOTP(user.mobile, otp, "login")
//           .then(() => {
//             sent.mobile = true;
//           })
//           .catch((e) => console.error("SMS failed:", e.message)),
//       );
//     if (user.email)
//       promises.push(
//         sendOTPEmail(user.email, otp, "login")
//           .then(() => {
//             sent.email = true;
//           })
//           .catch((e) => console.error("Email OTP failed:", e.message)),
//       );
//     await Promise.allSettled(promises);

//     if (process.env.NODE_ENV !== "production")
//       console.log(`🔐 DEV LOGIN OTP for ${user.email}: ${otp}`);

//     res.json({
//       success: true,
//       otpSent: true,
//       mobile: user.mobile,
//       email: user.email,
//       sent,
//       message: "OTP sent to your registered mobile and email",
//     });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// /* ─────────────────────────────────────────────────────────────────────────────
//    LOGIN OTP VERIFY
//    POST /api/auth/login-otp
// ───────────────────────────────────────────────────────────────────────────── */

// exports.loginOtp = async (req, res) => {
//   try {
//     const { mobile, email, otp } = req.body;
//     if (!otp)
//       return res.status(400).json({ success: false, message: "OTP required" });
//     if (!mobile && !email)
//       return res
//         .status(400)
//         .json({ success: false, message: "Mobile or email required" });

//     let user = null;
//     if (mobile) user = await User.findOne({ mobile });
//     if (!user && email)
//       user = await User.findOne({ email: email.toLowerCase() });
//     if (!user)
//       return res
//         .status(404)
//         .json({ success: false, message: "No account found" });

//     if (!user.isRegistrationComplete)
//       return res
//         .status(400)
//         .json({
//           success: false,
//           message: "Please complete registration first",
//         });

//     const conditions = [];
//     if (mobile)
//       conditions.push({
//         mobile,
//         otp,
//         purpose: "login",
//         isUsed: false,
//         expiresAt: { $gt: new Date() },
//       });
//     if (email)
//       conditions.push({
//         email: email.toLowerCase(),
//         otp,
//         purpose: "login",
//         isUsed: false,
//         expiresAt: { $gt: new Date() },
//       });

//     const record = await OTP.findOne(
//       conditions.length === 1 ? conditions[0] : { $or: conditions },
//     );
//     if (!record)
//       return res
//         .status(400)
//         .json({ success: false, message: "Invalid or expired OTP" });

//     record.isUsed = true;
//     await record.save();

//     // Issue tokens via cookies
//     const { refreshToken } = setTokenCookies(res, user._id);
//     user.refreshToken = refreshToken;
//     await user.save();

//     res.json({ success: true, user: userPayload(user) });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// /* ─────────────────────────────────────────────────────────────────────────────
//    REGISTER — Basic, Password, Complete  (unchanged flow, no token changes)
// ───────────────────────────────────────────────────────────────────────────── */

// exports.registerBasic = async (req, res) => {
//   try {
//     const body = req.body;
//     const email = body.email?.toLowerCase();
//     const mobile = body.mobile;

//     if (!mobile || mobile.length !== 10)
//       return res
//         .status(400)
//         .json({ success: false, message: "Valid 10-digit mobile required" });

//     let user = await User.findOne({ email });
//     if (user && user.isRegistrationComplete)
//       return res
//         .status(400)
//         .json({ success: false, message: "Email already registered" });

//     const permanentAddress = buildAddress(body, "permanentAddress");
//     const correspondenceAddress = buildAddress(body, "correspondenceAddress");

//     const data = {
//       employeeCode: body.employeeCode,
//       firstName: body.firstName,
//       middleName: body.middleName,
//       lastName: body.lastName,
//       fatherName: body.fatherName,
//       motherName: body.motherName,
//       gender: body.gender,
//       dob: body.dob,
//       maritalStatus: body.maritalStatus,
//       aadhaar: body.aadhaar,
//       pan: body.pan,
//       email,
//       mobile,
//       category: body.category,
//       bloodGroup: body.bloodGroup,
//       disability: body.disability,
//       permanentAddress,
//       correspondenceAddress,
//       isEmailVerified: true,
//       basicDetailsComplete: true,
//       photograph: req.file ? `/uploads/${req.file.filename}` : undefined,
//     };

//     if (user) {
//       Object.assign(user, data);
//       await user.save();
//     } else user = await User.create(data);

//     res.json({
//       success: true,
//       message: "Basic details saved",
//       userId: user._id,
//     });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// exports.registerPassword = async (req, res) => {
//   try {
//     const { userId, password } = req.body;
//     const user = await User.findById(userId);
//     if (!user)
//       return res
//         .status(404)
//         .json({ success: false, message: "User not found" });
//     user.password = password;
//     await user.save();
//     res.json({ success: true, message: "Password set" });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// exports.registerComplete = async (req, res) => {
//   try {
//     const { userId } = req.body;
//     const user = await User.findById(userId);
//     if (!user)
//       return res
//         .status(404)
//         .json({ success: false, message: "User not found" });

//     user.isRegistrationComplete = true;

//     const { refreshToken } = setTokenCookies(res, user._id);
//     user.refreshToken = refreshToken;
//     await user.save();

//     res.json({
//       success: true,
//       message: "Registration complete",
//       user: userPayload(user),
//     });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// /* ─────────────────────────────────────────────────────────────────────────────
//    GET ME
//    GET /api/auth/me   (protected)
// ───────────────────────────────────────────────────────────────────────────── */

// exports.getMe = async (req, res) => {
//   try {
//     const user = await User.findById(req.user._id).select(
//       "-password -refreshToken",
//     );
//     res.json({ success: true, user });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// /* ─────────────────────────────────────────────────────────────────────────────
//    RESET PASSWORD
// ───────────────────────────────────────────────────────────────────────────── */

// exports.resetPassword = async (req, res) => {
//   try {
//     const { mobile, email, password } = req.body;
//     if (!mobile && !email)
//       return res
//         .status(400)
//         .json({ success: false, message: "Mobile or email required" });
//     if (!password)
//       return res
//         .status(400)
//         .json({ success: false, message: "Password required" });
//     if (password.length < 6)
//       return res
//         .status(400)
//         .json({ success: false, message: "Min 6 characters" });

//     let user = null;
//     if (mobile) user = await User.findOne({ mobile });
//     if (!user && email)
//       user = await User.findOne({ email: email.toLowerCase() });
//     if (!user)
//       return res
//         .status(404)
//         .json({ success: false, message: "No account found" });

//     user.password = password;
//     await user.save();
//     res.json({ success: true, message: "Password reset successfully" });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// /* ─────────────────────────────────────────────────────────────────────────────
//    LOGOUT
//    POST /api/auth/logout
// ───────────────────────────────────────────────────────────────────────────── */

// exports.logout = async (req, res) => {
//   try {
//     // Invalidate the refresh token stored in DB
//     if (req.user) {
//       await User.findByIdAndUpdate(req.user._id, { refreshToken: null });
//     }
//     clearTokenCookies(res);
//     res.json({ success: true, message: "Logged out" });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

// /* ─────────────────────────────────────────────────────────────────────────────
//    INTERNAL HELPER
// ───────────────────────────────────────────────────────────────────────────── */

// const buildAddress = (body, prefix) => ({
//   house: body[`${prefix}.house`],
//   street: body[`${prefix}.street`],
//   landmark: body[`${prefix}.landmark`],
//   locality: body[`${prefix}.locality`],
//   city: body[`${prefix}.city`],
//   district: body[`${prefix}.district`],
//   state: body[`${prefix}.state`],
//   pin: body[`${prefix}.pin`],
// });
