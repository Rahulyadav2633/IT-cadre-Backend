const express     = require('express');
const router      = express.Router();
const { protect } = require('../middleware/auth_middleware');
const upload      = require('../middleware/upload');
const {
  registerBasic,
  registerPassword,
  registerComplete,
  login,
  loginOtp,
  getMe,
  resetPassword,
} = require('../controllers/authController');

router.post('/register/basic',    upload.single('photograph'), registerBasic);
router.post('/register/password', registerPassword);
router.post('/register/complete', registerComplete);
router.post('/login',             login);
router.post('/login-otp',         loginOtp);
router.get ('/me',                protect, getMe);
router.post('/reset-password',    resetPassword);

module.exports = router;







