const OTP = require("../models/OTP");
const User = require("../models/User");
const { sendOTPEmail, generateOTP } = require("../utils/email");

// ── Send OTP ──────────────────────────────────────────────────────────────────
exports.sendOTP = async (req, res) => {
  try {
    const { email, purpose } = req.body;
    if (!email)
      return res
        .status(400)
        .json({ success: false, message: "Email required" });

    if (purpose === "registration") {
      const existing = await User.findOne({
        email: email.toLowerCase(),
        isRegistrationComplete: true,
      });
      if (existing)
        return res
          .status(400)
          .json({ success: false, message: "Email already registered" });
    }

    if (purpose === "reset") {
      const existing = await User.findOne({ email: email.toLowerCase() });
      if (!existing)
        return res
          .status(404)
          .json({
            success: false,
            message: "No account found with this email",
          });
    }

    // Invalidate previous OTPs for same email + purpose
    await OTP.updateMany(
      { email: email.toLowerCase(), purpose, isUsed: false },
      { isUsed: true },
    );

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    await OTP.create({ email: email.toLowerCase(), otp, purpose, expiresAt });
    await sendOTPEmail(email, otp, purpose);

    res.json({ success: true, message: "OTP sent to your email" });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to send OTP. Check email configuration.",
      });
  }
};

// ── Verify OTP ────────────────────────────────────────────────────────────────
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp, purpose } = req.body;

    const record = await OTP.findOne({
      email: email.toLowerCase(),
      otp,
      purpose,
      isUsed: false,
      expiresAt: { $gt: new Date() },
    });

    if (!record)
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired OTP" });

    record.isUsed = true;
    await record.save();

    res.json({ success: true, message: "OTP verified successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
