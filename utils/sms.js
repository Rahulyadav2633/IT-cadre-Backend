const axios = require("axios");

// ── Generate 6-digit OTP ──────────────────────────────────────────────────────
exports.generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

// ── Send OTP via Fast2SMS ─────────────────────────────────────────────────────
exports.sendSMSOTP = async (mobile, otp, purpose = "login") => {
  const messages = {
    registration: `Your IT Cadre Portal registration OTP is ${otp}. Valid for 10 minutes. Do not share.`,
    login: `Your IT Cadre Portal login OTP is ${otp}. Valid for 10 minutes. Do not share.`,
    reset: `Your IT Cadre Portal password reset OTP is ${otp}. Valid for 10 minutes. Do not share.`,
  };
  const message = messages[purpose] || messages.login;

  try {
    const response = await axios.post(
      "https://www.fast2sms.com/dev/bulkV2",
      {
        route: "q", // Quick Transactional route
        message: message,
        language: "english",  
        flash: 0,
        numbers: mobile,
      },
      {
        headers: {
          authorization: process.env.FAST2SMS_API_KEY,
          "Content-Type": "application/json",
        },
      },
    );

    if (response.data.return === true) {
      console.log(`✅ SMS OTP sent to ${mobile}`);
      return true;
    } else {
      console.error("Fast2SMS error:", response.data);
      throw new Error(response.data.message || "SMS sending failed");
    }
  } catch (err) {
    console.error("❌ SMS Error:", err.message);
    // In development, log OTP to console as fallback
    if (process.env.NODE_ENV !== "production") {
      console.log(`🔐 DEV MODE — OTP for ${mobile}: ${otp}`);
      return true; // Don't crash in dev
    }
    throw new Error("Failed to send SMS OTP");
  }
};
