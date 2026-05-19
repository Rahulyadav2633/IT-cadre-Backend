const express = require("express");
const router = express.Router();
const User = require("../models/User");
const OTP = require("../models/OTP");
const { generateOTP, sendSMSOTP } = require("../utils/sms");
const { sendOTPEmail } = require("../utils/email");

// ── Helper: send OTP to mobile and/or email ───────────────────────────────────
async function sendOTPToUser(user, purpose) {
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  // Invalidate old OTPs for this user
  if (user.mobile)
    await OTP.updateMany(
      { mobile: user.mobile, purpose, isUsed: false },
      { isUsed: true },
    );
  if (user.email)
    await OTP.updateMany(
      { email: user.email, purpose, isUsed: false },
      { isUsed: true },
    );

  // Create ONE OTP record with both mobile and email
  await OTP.create({
    mobile: user.mobile || null,
    email: user.email || null,
    otp,
    purpose,
    expiresAt,
  });

  // Send via both channels simultaneously
  const promises = [];
  if (user.mobile)
    promises.push(
      sendSMSOTP(user.mobile, otp, purpose).catch((e) =>
        console.error("SMS failed:", e.message),
      ),
    );
  if (user.email)
    promises.push(
      sendOTPEmail(user.email, otp, purpose).catch((e) =>
        console.error("Email OTP failed:", e.message),
      ),
    );
  await Promise.allSettled(promises);

  return otp; // returned for dev logging
}

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/otp/send
// Body: { mobile?, email?, purpose }
// ── User can send to mobile, email, or both ───────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
router.post("/send", async (req, res) => {
  try {
    const { mobile, email, purpose } = req.body;

    if (!mobile && !email)
      return res
        .status(400)
        .json({ success: false, message: "Mobile or email required" });
    if (!purpose)
      return res
        .status(400)
        .json({ success: false, message: "Purpose required" });

    // ── Validation based on purpose ───────────────────────────────────────────
    if (purpose === "registration") {
      if (mobile) {
        const existing = await User.findOne({
          mobile,
          isRegistrationComplete: true,
        });
        if (existing)
          return res
            .status(400)
            .json({ success: false, message: "Mobile already registered" });
      }
      if (email) {
        const existing = await User.findOne({
          email: email.toLowerCase(),
          isRegistrationComplete: true,
        });
        if (existing)
          return res
            .status(400)
            .json({ success: false, message: "Email already registered" });
      }
    }

    if (purpose === "reset") {
      // Find user by mobile or email
      let user = null;
      if (mobile) user = await User.findOne({ mobile });
      if (!user && email)
        user = await User.findOne({ email: email.toLowerCase() });
      if (!user)
        return res
          .status(404)
          .json({ success: false, message: "No account found" });
    }

    // ── Invalidate previous OTPs ──────────────────────────────────────────────
    const invalidateQuery = { purpose, isUsed: false };
    if (mobile && email)
      invalidateQuery.$or = [{ mobile }, { email: email.toLowerCase() }];
    else if (mobile) invalidateQuery.mobile = mobile;
    else invalidateQuery.email = email.toLowerCase();
    await OTP.updateMany(invalidateQuery, { isUsed: true });

    // ── Create OTP ────────────────────────────────────────────────────────────
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await OTP.create({
      mobile: mobile || null,
      email: email ? email.toLowerCase() : null,
      otp,
      purpose,
      expiresAt,
    });

    // ── Send via chosen channel(s) ────────────────────────────────────────────
    const sent = { mobile: false, email: false };
    const promises = [];

    if (mobile) {
      promises.push(
        sendSMSOTP(mobile, otp, purpose)
          .then(() => {
            sent.mobile = true;
          })
          .catch((e) => console.error("SMS failed:", e.message)),
      );
    }
    if (email) {
      promises.push(
        sendOTPEmail(email, otp, purpose)
          .then(() => {
            sent.email = true;
          })
          .catch((e) => console.error("Email OTP failed:", e.message)),
      );
    }

    await Promise.allSettled(promises);

    // Dev mode — always log OTP
    if (process.env.EMAIL_USER !== "production") {
      console.log(
        `🔐 DEV OTP [${purpose}] → ${mobile || ""}/${email || ""}: ${otp}`,
      );
    }

    const channels = [mobile && "mobile", email && "email"]
      .filter(Boolean)
      .join(" & ");
    res.json({
      success: true,
      message: `OTP sent to your ${channels}`,
      sent, // { mobile: true/false, email: true/false }
    });
  } catch (err) {
    console.error("OTP send error:", err);
    res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/otp/verify
// Body: { mobile?, email?, otp, purpose }
// ── ONE OTP is enough (mobile OR email) ──────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
router.post("/verify", async (req, res) => {
  try {
    const { mobile, email, otp, purpose } = req.body;

    if (!otp)
      return res.status(400).json({ success: false, message: "OTP required" });
    if (!mobile && !email)
      return res
        .status(400)
        .json({ success: false, message: "Mobile or email required" });

    // Search for matching OTP — user can verify with EITHER mobile or email
    const conditions = [];
    if (mobile)
      conditions.push({
        mobile,
        otp,
        purpose,
        isUsed: false,
        expiresAt: { $gt: new Date() },
      });
    if (email)
      conditions.push({
        email: email.toLowerCase(),
        otp,
        purpose,
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

    res.json({ success: true, message: "OTP verified successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
