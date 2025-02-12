const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const courseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    semester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Semester",
      required: true,
    },
    students: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    lectures: [{ type: mongoose.Schema.Types.ObjectId, ref: "Lecture" }],
  },
  { timestamps: true }
);

const Course = mongoose.model("Course", courseSchema);
module.exports = Course;
