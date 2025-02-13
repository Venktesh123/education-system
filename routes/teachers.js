const express = require("express");
const router = express.Router();
const {
  assignStudent,
  getStudents,
} = require("../controllers/teacherController");
const auth = require("../middleware/auth");
const { checkRole } = require("../middleware/roleCheck");

router.get("/students", auth, checkRole(["teacher"]), getStudents);
router.post(
  "/students/:studentId/assign",
  auth,
  checkRole(["teacher"]),
  assignStudent
);

module.exports = router;
