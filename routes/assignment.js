const express = require("express");
const router = express.Router();
const assignmentController = require("../controllers/assignmentController");
const auth = require("../middleware/auth");
const { checkRole } = require("../middleware/roleCheck");

// Create a new assignment (teacher only)
router.post(
  "/courses/:courseId/assignments",
  auth,
  checkRole(["teacher"]),
  assignmentController.createAssignment
);

// Submit an assignment (student only)
router.post(
  "/assignments/:assignmentId/submit",
  auth,
  checkRole(["student"]),
  assignmentController.submitAssignment
);

// Grade a submission (teacher only)
router.post(
  "/assignments/:assignmentId/submissions/:submissionId/grade",
  auth,
  checkRole(["teacher"]),
  assignmentController.gradeSubmission
);
// Get all assignments for a course
router.get(
  "/courses/:courseId/assignments",
  auth,
  checkRole(["teacher", "student"]),
  assignmentController.getCourseAssignments
);

// Get a specific assignment
router.get(
  "/assignments/:assignmentId",
  auth,
  checkRole(["teacher", "student"]),
  assignmentController.getAssignmentById
);
module.exports = router;
