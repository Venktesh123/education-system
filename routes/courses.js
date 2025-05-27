const express = require("express");
const router = express.Router();
const {
  getUserCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  getEnrolledCourses,
  getCourseWithModuleLectures, // Add the new function
} = require("../controllers/courseController");
const auth = require("../middleware/auth");
const { checkRole } = require("../middleware/roleCheck");

// Get all courses for teacher/student
router.get("/", auth, checkRole(["teacher", "student"]), getUserCourses);

// Get enrolled courses for students
router.get(
  "/student",
  auth,
  checkRole(["teacher", "student"]),
  getEnrolledCourses
);

// Get specific course by ID with module lectures
router.get(
  "/:courseId/modules-lectures",
  auth,
  checkRole(["teacher", "student"]),
  getCourseWithModuleLectures
);

// Get specific course by ID (original)
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
