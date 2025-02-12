const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const lectureSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    order: { type: Number, required: true },
  },
  { timestamps: true }
);

const Lecture = mongoose.model("Lecture", lectureSchema);
module.exports = Lecture;
