const express = require("express");
const router = express.Router();
const courseController = require("../controllers/courseController");
const auth = require("../middleware/auth");
const { checkRole } = require("../middleware/roleCheck");

router.post("/", auth, checkRole(["teacher"]), courseController.createCourse);
router.put("/:id", auth, checkRole(["teacher"]), courseController.updateCourse);
router.get("/:id", auth, courseController.getCourse);
router.get("/", auth, courseController.getAllCourses);
router.get("/details/:id", auth, courseController.getCourseDetails);

// Get all courses

module.exports = router;
