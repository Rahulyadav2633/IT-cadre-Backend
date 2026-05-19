const mongoose = require("mongoose");

const OTPSchema = new mongoose.Schema({
  // ── Either mobile OR email (or both) ─────────────────────────────────────
  mobile: { type: String, default: null },
  email: { type: String, lowercase: true, default: null },

  otp: { type: String, required: true },
  purpose: {
    type: String,
    enum: ["registration", "login", "reset"],
    required: true,
  },
  isUsed: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Auto-delete expired OTPs
OTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("OTP", OTPSchema);
