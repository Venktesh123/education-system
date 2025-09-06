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

// ===============================
// VIDEO ROUTES
// ===============================

// Add video to module
router.post(
  "/course/:courseId/syllabus/module/:moduleId/videos",
  auth,
  checkRole(["teacher"]),
  syllabusController.addVideoToModule
);

// Update video in module
router.put(
  "/course/:courseId/syllabus/module/:moduleId/videos/:videoId",
  auth,
  checkRole(["teacher"]),
  syllabusController.updateVideoInModule
);

// Delete video from module
router.delete(
  "/course/:courseId/syllabus/module/:moduleId/videos/:videoId",
  auth,
  checkRole(["teacher"]),
  syllabusController.deleteVideoFromModule
);

// ===============================
// LINK ROUTES
// ===============================

// Add link to module
router.post(
  "/course/:courseId/syllabus/module/:moduleId/links",
  auth,
  checkRole(["teacher"]),
  syllabusController.addLinkToModule
);

// Update link in module
router.put(
  "/course/:courseId/syllabus/module/:moduleId/links/:linkId",
  auth,
  checkRole(["teacher"]),
  syllabusController.updateLinkInModule
);

// Delete link from module
router.delete(
  "/course/:courseId/syllabus/module/:moduleId/links/:linkId",
  auth,
  checkRole(["teacher"]),
  syllabusController.deleteLinkFromModule
);

// ===============================
// PDF ROUTES
// ===============================

// Add PDF to module
router.post(
  "/course/:courseId/syllabus/module/:moduleId/pdfs",
  auth,
  checkRole(["teacher"]),
  syllabusController.addPdfToModule
);

// Update PDF in module
router.put(
  "/course/:courseId/syllabus/module/:moduleId/pdfs/:pdfId",
  auth,
  checkRole(["teacher"]),
  syllabusController.updatePdfInModule
);

// Delete PDF from module
router.delete(
  "/course/:courseId/syllabus/module/:moduleId/pdfs/:pdfId",
  auth,
  checkRole(["teacher"]),
  syllabusController.deletePdfFromModule
);

// ===============================
// PPT ROUTES
// ===============================

// Add PPT to module
router.post(
  "/course/:courseId/syllabus/module/:moduleId/ppts",
  auth,
  checkRole(["teacher"]),
  syllabusController.addPptToModule
);

// Update PPT in module
router.put(
  "/course/:courseId/syllabus/module/:moduleId/ppts/:pptId",
  auth,
  checkRole(["teacher"]),
  syllabusController.updatePptInModule
);

// Delete PPT from module
router.delete(
  "/course/:courseId/syllabus/module/:moduleId/ppts/:pptId",
  auth,
  checkRole(["teacher"]),
  syllabusController.deletePptFromModule
);

module.exports = router;
