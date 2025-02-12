const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const semesterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    courses: [{ type: mongoose.Schema.Types.ObjectId, ref: "Course" }],
  },
  { timestamps: true }
);

const Semester = mongoose.model("Semester", semesterSchema);
module.exports = Semester;
