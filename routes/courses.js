const express = require("express");
const router = express.Router();
const {
  getUserCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  getEnrolledCourses,
} = require("../controllers/courseController");
const auth = require("../middleware/auth");
const { checkRole } = require("../middleware/roleCheck");

// Get all courses for teacher
router.get("/", auth, checkRole(["teacher", "student"]), getUserCourses);
router.get(
  "/student",
  auth,
  checkRole(["teacher", "student"]),
  getEnrolledCourses
);

// Get specific course by ID
router.get(
  "/:courseId",
  auth,
  checkRole(["teacher", "student"]),
  getCourseById
);

// Create new course
router.post("/", auth, checkRole(["teacher"]), createCourse);

// Update course
router.put("/:courseId", auth, checkRole(["teacher"]), updateCourse);

// Delete course
router.delete("/:courseId", auth, checkRole(["teacher"]), deleteCourse);

module.exports = router;
