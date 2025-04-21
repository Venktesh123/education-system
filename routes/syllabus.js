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

// Update a module (basic info) - PUT request to update module info only
router.put(
  "/course/:courseId/syllabus/module/:moduleId",
  auth,
  checkRole(["teacher"]),
  syllabusController.updateModule
);

// Add content to module - POST request to add content
router.post(
  "/course/:courseId/syllabus/module/:moduleId/content",
  auth,
  checkRole(["teacher"]),
  syllabusController.addModuleContent
);

// Update content item - PUT request to update existing content
router.put(
  "/course/:courseId/syllabus/module/:moduleId/content/:contentId",
  auth,
  checkRole(["teacher"]),
  syllabusController.updateContentItem
);

// Delete content item
router.delete(
  "/course/:courseId/syllabus/module/:moduleId/content/:contentId",
  auth,
  checkRole(["teacher"]),
  syllabusController.deleteContentItem
);

// Remove this route since deleteResource is not defined in your controller
/* 
router.delete(
  "/course/:courseId/syllabus/module/:moduleId/resource/:resourceId",
  auth,
  checkRole(["teacher"]),
  syllabusController.deleteResource
);
*/

module.exports = router;
