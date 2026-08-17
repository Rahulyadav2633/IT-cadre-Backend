const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
require('dotenv').config();

const isConfigured = Boolean(
  (process.env.CLOUDINARY_CLOUD_NAME &&
   process.env.CLOUDINARY_API_KEY &&
   process.env.CLOUDINARY_API_SECRET) ||
  process.env.CLOUDINARY_URL
);

if (isConfigured) {
  if (process.env.CLOUDINARY_URL) {
    cloudinary.config();
  } else {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }
}

const storage = isConfigured
  ? new CloudinaryStorage({
      cloudinary: cloudinary,
      params: async (req, file) => {
        const isPdf =
          file.mimetype === 'application/pdf' ||
          file.originalname.toLowerCase().endsWith('.pdf');
        return {
          folder: 'emp_management',
          resource_type: isPdf ? 'raw' : 'auto',
          public_id: `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1e9)}`,
        };
      },
    })
  : null;

module.exports = {
  cloudinary,
  storage,
  isConfigured,
};
