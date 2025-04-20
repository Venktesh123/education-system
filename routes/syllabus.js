const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { checkRole } = require("../middleware/roleCheck");
const syllabusController = require("../controllers/syllabusController");

// Get syllabus for a specific course
router.get(
  "/course/:courseId/syllabus",
  auth,
  checkRole(["teacher", "student"]),
  syllabusController.getCourseSyllabus
);

// Get specific module by ID
router.get(
  "/course/:courseId/syllabus/module/:moduleId",
  auth,
  checkRole(["teacher", "student"]),
  syllabusController.getModuleById
);

// Update a module with resources (links, PDFs, PPTs)
router.put(
  "/course/:courseId/syllabus/module/:moduleId",
  auth,
  checkRole(["teacher"]),
  syllabusController.updateModule
);

// Delete a specific resource from a module
router.delete(
  "/course/:courseId/syllabus/module/:moduleId/resource/:resourceId",
  auth,
  checkRole(["teacher"]),
  syllabusController.deleteResource
);

module.exports = router;
