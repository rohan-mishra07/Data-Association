const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadDir;
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
      uploadDir = path.join(os.tmpdir(), "uploads");
    } else {
      uploadDir = path.join(__dirname, "../Public/images/uploads");
    }

    try {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    } catch (err) {
      const fallbackDir = path.join(os.tmpdir(), "uploads");
      try {
        if (!fs.existsSync(fallbackDir)) {
          fs.mkdirSync(fallbackDir, { recursive: true });
        }
        cb(null, fallbackDir);
      } catch (fallbackErr) {
        cb(fallbackErr);
      }
    }
  },
  filename: function (req, file, cb) {
    crypto.randomBytes(12, function (err, bytes) {
      if (err) return cb(err);
      const fn = bytes.toString("hex") + path.extname(file.originalname);
      cb(null, fn);
    });
  }
});

const upload = multer({ storage: storage });

module.exports = upload;