const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { storage: cloudinaryStorage, isConfigured } = require('../config/cloudinary');

// Local disk storage fallback
const diskStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype) || file.mimetype === 'application/pdf';
  if (extname || mimetype) return cb(null, true);
  cb(new Error('Only images and PDFs are allowed'));
};

const storage = (isConfigured && cloudinaryStorage) ? cloudinaryStorage : diskStorage;

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
});

module.exports = upload;
