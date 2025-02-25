const mongoose = require("mongoose");

const moduleSchema = new mongoose.Schema({
  moduleNumber: {
    type: Number,
    required: true,
  },
  moduleTitle: {
    type: String,
    required: true,
  },
  topics: [
    {
      type: String,
      required: true,
    },
  ],
});

const courseSyllabusSchema = new mongoose.Schema(
  {
    modules: [moduleSchema],
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CourseSyllabus", courseSyllabusSchema);
