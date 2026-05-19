
const express = require('express');
const router  = express.Router();
const { protect, superAdminOnly } = require('../middleware/auth_middleware');
const upload  = require('../middleware/upload');
const {
  getDashboard, getAllUsers,
  createSOAdmin, createDSAdmin,
  promoteToAdmin, revokeAdmin,
  changeRole, deleteUser,
  getDeptMatrix, updateMatrixCell,
  getAnnouncements, deleteAnnouncement, createAnnouncement,
  getEmployee, approveEmployee,
  // SO Powers
  getSOEmployees, soVerifyEmployee, soRevertEmployee,
  // DS Powers
  getDSEmployees, dsApproveEmployee, dsRejectEmployee, dsHoldEmployee,
  // Transfer
  addTransfer, deleteTransfer,
} = require('../controllers/superAdminController');

// All routes require super admin
router.use(protect, superAdminOnly);

// ── Dashboard ──────────────────────────────────────────────────────────────────
router.get('/dashboard', getDashboard);

// ── User Management ────────────────────────────────────────────────────────────
router.get   ('/users',          getAllUsers);
router.delete('/users/:id',      deleteUser);
router.put   ('/users/:id/role', changeRole);

// ── Admin Management ───────────────────────────────────────────────────────────
router.post  ('/create-so-admin',    createSOAdmin);
router.post  ('/create-ds-admin',    createDSAdmin);
router.post  ('/promote-to-admin',   promoteToAdmin);
router.delete('/revoke-admin/:id',   revokeAdmin);

// ── Employee Detail ────────────────────────────────────────────────────────────
router.get('/employee/:id', getEmployee);
router.put('/employee/:id/approval', approveEmployee);



// ── SO Admin Powers ────────────────────────────────────────────────────────────
router.get('/so/employees',              getSOEmployees);
router.put('/so/employee/:id/verify',    soVerifyEmployee);
router.put('/so/employee/:id/revert',    soRevertEmployee);

// ── DS Admin Powers ────────────────────────────────────────────────────────────
router.get('/ds/employees',              getDSEmployees);
router.put('/ds/employee/:id/approve',   dsApproveEmployee);
router.put('/ds/employee/:id/reject',    dsRejectEmployee);
router.put('/ds/employee/:id/hold',      dsHoldEmployee);

// ── Transfer Management ────────────────────────────────────────────────────────
router.post  ('/employee/:id/transfer',            upload.single('orderUpload'), addTransfer);
router.delete('/employee/:id/transfer/:transferId', deleteTransfer);

// ── Dept Matrix ────────────────────────────────────────────────────────────────
router.get ('/dept-matrix', getDeptMatrix);
router.post('/dept-matrix', updateMatrixCell);

// ── Announcements ──────────────────────────────────────────────────────────────
router.get   ('/announcements',      getAnnouncements);
router.post  ('/announcements',      createAnnouncement);
router.delete('/announcements/:id',  deleteAnnouncement);

module.exports = router;
