const express = require("express");
const router = express.Router();
const courseController = require("../controllers/courseController");
const { auth } = require("../middleware/auth");
const { checkRole } = require("../middleware/roleCheck");

router.post("/", auth, checkRole(["teacher"]), courseController.createCourse);
router.get("/", auth, courseController.getCourses);
router.post(
  "/:courseId/lectures",
  auth,
  checkRole(["teacher"]),
  courseController.addLecture
);

module.exports = router;
