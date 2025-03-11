const express = require("express");
const router = express.Router();
const {
  createLecture,
  updateLecture,
  getLectureById,
  getCourseLectures,
  deleteLecture,
  updateLectureReviewStatus,
  updateAllLectureReviewStatuses,
  getCourseLecturesByStudents,
} = require("../controllers/lectureController");
const auth = require("../middleware/auth");
const { checkRole } = require("../middleware/roleCheck");

// Routes for individual lectures
router.post("/:courseId", auth, checkRole("teacher"), createLecture);
router.put("/:id", auth, checkRole("teacher"), updateLecture);
router.get(
  "/:lectureId",
  auth,
  checkRole(["teacher", "student"]),
  getLectureById
);

// Routes for course lectures
router.get(
  "/:courseId/lectures",
  auth,
  checkRole(["teacher", "student"]),
  getCourseLectures
);
router.get(
  "/student/:courseId/lectures",
  auth,
  checkRole(["teacher", "student"]),
  getCourseLecturesByStudents
);
router.get(
  "/:courseId/lectures/:lectureId",
  auth,
  checkRole(["teacher", "student"]),
  getLectureById
);
router.post("/:courseId/lectures", auth, checkRole("teacher"), createLecture);
router.put(
  "/:courseId/lectures/:lectureId",
  auth,
  checkRole("teacher"),
  updateLecture
);
router.delete(
  "/:courseId/lectures/:lectureId",
  auth,
  checkRole("teacher"),
  deleteLecture
);

// Routes specifically for review management
router.put(
  "/:courseId/lectures/:lectureId/review",
  auth,
  checkRole("teacher"),
  updateLectureReviewStatus
);
router.put(
  "/:courseId/lectures/review-all",
  auth,
  checkRole("teacher"),
  updateAllLectureReviewStatuses
);

module.exports = router;
