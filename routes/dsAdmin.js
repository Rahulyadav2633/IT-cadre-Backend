
const express = require('express');
const router  = express.Router();
const { protect, dsOnly } = require('../middleware/auth_middleware');
const upload  = require('../middleware/upload');
const {
  getDashboard, getAllEmployees, getEmployee,
  approveEmployee, rejectEmployee, holdEmployee,
  setupAdmin, addTransfer, editTransfer, deleteTransfer, sendMessage
} = require('../controllers/dsAdminController');

router.post('/setup',                                protect, dsOnly, setupAdmin);
router.get ('/dashboard',                            protect, dsOnly, getDashboard);
router.get ('/employees',                            protect, dsOnly, getAllEmployees);
router.get ('/employee/:id',                         protect, dsOnly, getEmployee);
router.put ('/employee/:id/approve',                 protect, dsOnly, approveEmployee);
router.put ('/employee/:id/reject',                  protect, dsOnly, rejectEmployee);
router.put ('/employee/:id/hold',                    protect, dsOnly, holdEmployee);
router.post('/employee/:id/message',                 protect, dsOnly, sendMessage);
router.post('/employee/:id/transfer',                protect, dsOnly, upload.single('orderUpload'), addTransfer);
router.put ('/employee/:id/transfer/:transferId',    protect, dsOnly, upload.single('orderUpload'), editTransfer);
router.delete('/employee/:id/transfer/:transferId',  protect, dsOnly, deleteTransfer);

module.exports = router;
