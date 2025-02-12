const express = require("express");
const router = express.Router();
const teacherController = require("../controllers/teacherController");
const { auth } = require("../middleware/auth");
const { checkRole } = require("../middleware/roleCheck");

router.get(
  "/students",
  auth,
  checkRole(["teacher"]),
  teacherController.getStudents
);
router.post(
  "/students/:studentId/assign",
  auth,
  checkRole(["teacher"]),
  teacherController.assignStudent
);

module.exports = router;
