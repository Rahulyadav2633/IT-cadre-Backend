
const express = require('express');
const router  = express.Router();
const { protect, soOnly } = require('../middleware/auth_middleware');
const upload  = require('../middleware/upload');
const {
  getDashboard, getAllEmployees, getEmployee,
  verifyEmployee, revertEmployee, rejectEmployee,
  setupAdmin, addTransfer, editTransfer, deleteTransfer
} = require('../controllers/soAdminController');

router.post('/setup',                                protect, soOnly, setupAdmin);
router.get ('/dashboard',                            protect, soOnly, getDashboard);
router.get ('/employees',                            protect, soOnly, getAllEmployees);
router.get ('/employee/:id',                         protect, soOnly, getEmployee);
router.put ('/employee/:id/verify',                  protect, soOnly, verifyEmployee);
router.put ('/employee/:id/revert',                  protect, soOnly, revertEmployee);
router.put ('/employee/:id/reject',                  protect, soOnly, rejectEmployee);
router.post('/employee/:id/transfer',                protect, soOnly, upload.single('orderUpload'), addTransfer);
router.put ('/employee/:id/transfer/:transferId',    protect, soOnly, upload.single('orderUpload'), editTransfer);
router.delete('/employee/:id/transfer/:transferId',  protect, soOnly, deleteTransfer);

module.exports = router;
