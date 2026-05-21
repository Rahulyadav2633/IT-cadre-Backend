const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT) || 465,
  secure: (process.env.EMAIL_PORT == 465 || !process.env.EMAIL_PORT), // Use secure for 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

exports.sendOTPEmail = async (email, otp, purpose = 'registration') => {
  const subject = purpose === 'registration' ? 'Email Verification OTP' : 'Login OTP';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9; border-radius: 10px;">
      <h2 style="color: #1a73e8; text-align: center;">Employee Management System</h2>
      <div style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <h3 style="color: #333;">Your OTP for ${purpose}</h3>
        <p style="color: #666;">Use the following OTP to verify your email:</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1a73e8; background: #e8f0fe; padding: 15px 30px; border-radius: 8px;">${otp}</span>
        </div>
        <p style="color: #999; font-size: 12px;">This OTP is valid for 10 minutes. Do not share it with anyone.</p>
      </div>
    </div>
  `;
  await transporter.sendMail({ from: `"EMS System" <${process.env.EMAIL_USER}>`, to: email, subject, html });
};

exports.generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ── Send Rejection/Revert/Notification Email ──────────────────────────────────
exports.sendRejectionEmail = async (toEmail, firstName, message, type, adminName) => {
  const typeLabels = {
    revert: { subject: 'Profile Reverted — Action Required', color: '#f59e0b', label: '🔄 Profile Reverted' },
    reject: { subject: 'Profile Rejected — Cadre Portal',   color: '#ef4444', label: '❌ Profile Rejected' },
    info:   { subject: 'Message from Admin — Cadre Portal', color: '#2563eb', label: '📢 Message from Admin' },
  };
  const { subject, color, label } = typeLabels[type] || typeLabels.info;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <div style="background:${color};padding:24px;text-align:center">
        <h2 style="color:white;margin:0">${label}</h2>
      </div>
      <div style="padding:24px;background:#f8fafc">
        <p>Dear <strong>${firstName}</strong>,</p>
        <p>${
          type === 'revert'
            ? 'Your profile has been reverted by <strong>' + adminName + '</strong>. Please review the following message and make the required corrections:'
            : type === 'reject'
            ? 'Your profile submission has been rejected by <strong>' + adminName + '</strong> for the following reason:'
            : 'You have received a message from <strong>' + adminName + '</strong>:'
        }</p>
        <div style="background:white;border-left:4px solid ${color};padding:16px;border-radius:4px;margin:16px 0">
          <p style="margin:0">${message}</p>
        </div>
        ${type === 'revert' ? '<p>Please login to Cadre Portal, update your profile, and resubmit for review.</p>' : ''}
        <p>Login at: <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}">${process.env.CLIENT_URL || 'http://localhost:3000'}</a></p>
        <p style="color:#64748b;font-size:12px;margin-top:24px">— Cadre Portal Team</p>
      </div>
    </div>
  `;

  const transporter = require('nodemailer').createTransport({
    host: process.env.EMAIL_HOST, port: parseInt(process.env.EMAIL_PORT),
    secure: false,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });

  await transporter.sendMail({
    from: `"Cadre Portal" <${process.env.EMAIL_USER}>`,
    to: toEmail, subject, html
  });
};
