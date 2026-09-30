const multer = require("multer");
const path = require("path");
const crypto = require("crypto");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // __dirname is the 'config' folder, so '../public/images/uploads' points to the project root's public folder
    cb(null, path.join(__dirname, "../public/images/uploads"));
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