const mongoose = require("mongoose");

const OTPSchema = new mongoose.Schema({
  // ── Either mobile OR email (or both) ─────────────────────────────────────
  mobile: {
    type: String,
    trim: true,
    default: null,
    validate: {
      validator: function (v) {
        return !v || /^[6-9]\d{9}$/.test(v);
      },
      message: "Mobile must be a valid 10-digit Indian phone number",
    },
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    default: null,
    validate: {
      validator: function (v) {
        return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: "Please enter a valid email address",
    },
  },

  otp: {
    type: String,
    required: [true, "OTP code is required"],
    trim: true,
    validate: {
      validator: function (v) {
        return /^\d{4,8}$/.test(v);
      },
      message: "OTP must be a numeric string between 4 and 8 digits",
    },
  },
  purpose: {
    type: String,
    enum: {
      values: [
        "registration",
        "login",
        "reset",
        "update_mobile",
        "update_email",
        "verification",
      ],
      message: "Invalid OTP purpose: {VALUE}",
    },
    required: [true, "Purpose is required"],
  },
  isUsed: {
    type: Boolean,
    default: false,
  },
  expiresAt: {
    type: Date,
    required: [true, "Expiry time is required"],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Custom validation: at least one identifier (mobile or email) is mandatory
OTPSchema.pre("validate", function (next) {
  if (!this.mobile && !this.email) {
    this.invalidate(
      "mobile",
      "Either mobile or email must be provided to issue an OTP",
    );
    this.invalidate(
      "email",
      "Either mobile or email must be provided to issue an OTP",
    );
  }
  next();
});

// Auto-delete expired OTPs
OTPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("OTP", OTPSchema);
