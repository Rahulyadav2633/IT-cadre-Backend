const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// Token blacklist (in-memory)
const tokenBlacklist = new Set();
exports.blacklistToken  = (t) => { tokenBlacklist.add(t); setTimeout(() => tokenBlacklist.delete(t), 7*24*60*60*1000); };
exports.isBlacklisted   = (t) => tokenBlacklist.has(t);

// ── Protect ────────────────────────────────────────────────────────────────────
exports.protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success:false, message:'Not authorized' });
    if (exports.isBlacklisted(token))
      return res.status(401).json({ success:false, message:'Token invalidated. Please login again.' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user  = await User.findById(decoded.id).select('-password');
    req.token = token;
    if (!req.user) return res.status(401).json({ success:false, message:'User not found' });
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ success:false, message:'Token expired. Please login again.' });
    res.status(401).json({ success:false, message:'Token invalid' });
  }
};

// ── Role Guards ────────────────────────────────────────────────────────────────
exports.superAdminOnly = (req, res, next) => {
  if (req.user.role !== 'super_admin')
    return res.status(403).json({ success:false, message:'Super Admin access required' });
  next();
};

exports.adminOnly = (req, res, next) => {
  if (!['super_admin','so_admin','ds_admin'].includes(req.user.role))
    return res.status(403).json({ success:false, message:'Admin access required' });
  next();
};

exports.soOnly = (req, res, next) => {
  if (!['super_admin','so_admin'].includes(req.user.role))
    return res.status(403).json({ success:false, message:'SO Admin access required' });
  next();
};

exports.dsOnly = (req, res, next) => {
  if (!['super_admin','ds_admin'].includes(req.user.role))
    return res.status(403).json({ success:false, message:'DS Admin access required' });
  next();
};




