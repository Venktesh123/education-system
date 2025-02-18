const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const { checkRole } = require("../middleware/roleCheck");

// Import individual controllers
const eventController = require("../controllers/eventController");

// Routes
console.log("datta");
router.post("/", auth, checkRole(["admin"]), eventController.createEvent);
router.get("/", auth, eventController.getAllEvents);
router.get("/:id", auth, eventController.getEventById);

router.put("/:id", auth, eventController.updateEvent);
router.delete("/:id", auth, eventController.deleteEvent);

module.exports = router;
