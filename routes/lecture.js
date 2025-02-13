const express = require("express");
const router = express.Router();
const lectureController = require("../controllers/lectureController");
const auth = require("../middleware/auth");
const { checkRole } = require("../middleware/roleCheck");

router.post("/", auth, checkRole(["teacher"]), lectureController.createLecture);
router.put(
  "/:id",
  auth,
  checkRole(["teacher"]),
  lectureController.updateLecture
);
router.get("/:id", auth, lectureController.getLecture);

module.exports = router;
