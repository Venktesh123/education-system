const express = require("express");
const router = express.Router();
const {
  getTeacherCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
} = require("../controllers/courseController");
const auth = require("../middleware/auth");
const { checkRole } = require("../middleware/roleCheck");

// Get all courses for teacher
router.get("/", auth, getTeacherCourses);

// Get specific course by ID
router.get("/:courseId", auth, checkRole(["teacher"]), getCourseById);

// Create new course
router.post("/", auth, checkRole(["teacher"]), createCourse);

// Update course
router.put("/:courseId", auth, checkRole(["teacher"]), updateCourse);

// Delete course
router.delete("/:courseId", auth, checkRole(["teacher"]), deleteCourse);

module.exports = router;
