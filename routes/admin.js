const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const auth = require("../middleware/auth");
const { checkRole } = require("../middleware/roleCheck");
const upload = require("../middleware/upload");

// Add test route to verify router is working
router.get("/test", (req, res) => {
  res.json({ message: "Auth routes working" });
});

// Add file upload route with auth and role check
router.post(
  "/upload-users",
  auth,
  checkRole(["admin"]),
  (req, res, next) => {
    console.log("Processing upload request");
    upload.single("file")(req, res, (err) => {
      if (err) {
        console.error("Upload error:", err);
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  },
  adminController.uploadUsers
);

module.exports = router;
