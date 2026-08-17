const express     = require('express');
const router      = express.Router();
const { protect } = require('../middleware/auth_middleware');
const upload      = require('../middleware/upload');
const {
  getProfile,
  saveBasicExtra,
  saveAppointment,
  saveEducation,
  saveExperience,
  saveTransfers,
  saveTraining,
  editProfile,
  editFull,
  markNotificationRead,
  dismissNotification,
} = require('../controllers/employeeController');

router.get ('/profile',     protect, getProfile);
router.post('/basic-extra', protect, saveBasicExtra);
router.post('/appointment', protect, saveAppointment);
router.post('/education',   protect, saveEducation);
router.post('/experience',  protect, upload.fields([
  { name: 'experienceCertificate_0', maxCount: 1 },
  { name: 'experienceCertificate_1', maxCount: 1 },
  { name: 'experienceCertificate_2', maxCount: 1 },
]), saveExperience);
router.post('/transfers',   protect, upload.fields([
  { name: 'orderUpload_0', maxCount: 1 },
  { name: 'orderUpload_1', maxCount: 1 },
  { name: 'orderUpload_2', maxCount: 1 },
]), saveTransfers);
router.post('/training',    protect, upload.fields([
  { name: 'trainingCertificate_0', maxCount: 1 },
  { name: 'trainingCertificate_1', maxCount: 1 },
]), saveTraining);
router.put ('/edit',        protect, upload.single('photograph'), editProfile);
router.put ('/edit-full',   protect, upload.single('photograph'), editFull);
router.put ('/notifications/:id/read',    protect, markNotificationRead);
router.delete('/notifications/:id/dismiss', protect, dismissNotification);

module.exports = router;

