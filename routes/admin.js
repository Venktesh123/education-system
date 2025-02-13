const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const auth = require("../middleware/auth");
const checkRole = require("../middleware/roleCheck");
const upload = require("../middleware/upload");

router.post(
  "/upload-users",
  auth,
  checkRole(["admin"]),
  upload.single("file"),
  adminController.uploadUsers
);

module.exports = router;
