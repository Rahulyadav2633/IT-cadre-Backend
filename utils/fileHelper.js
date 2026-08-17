/**
 * Extracts URL for an uploaded file.
 * multer-storage-cloudinary puts the URL in:
 *   - file.path        (v4+, always the secure_url)
 *   - file.secure_url  (some versions)
 *   - file.url         (older versions)
 * Local disk fallback uses file.filename → /uploads/<name>
 */
function getFileUrl(file) {
  if (!file) return undefined;

  // Cloudinary — path is always the full https:// URL when cloudinary storage is used
  if (file.path && (file.path.startsWith('http://') || file.path.startsWith('https://'))) {
    return file.path;
  }
  // Some multer-storage-cloudinary versions expose these directly
  if (file.secure_url) return file.secure_url;
  if (file.url) return file.url;

  // Local disk fallback
  if (file.filename) return `/uploads/${file.filename}`;

  // Last resort — return whatever path is (could be a local absolute path, strip to relative)
  if (file.path) {
    const parts = file.path.replace(/\\/g, '/').split('/uploads/');
    if (parts.length > 1) return `/uploads/${parts[parts.length - 1]}`;
  }

  return undefined;
}

module.exports = {
  getFileUrl,
};
