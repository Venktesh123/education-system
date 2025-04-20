const mongoose = require("mongoose");

const resourceSchema = new mongoose.Schema({
  fileType: {
    type: String,
    enum: ["pdf", "ppt", "pptx", "other"],
    required: true,
  },
  fileUrl: {
    type: String,
    required: true,
  },
  fileKey: {
    type: String,
    required: true,
  },
  fileName: {
    type: String,
    required: true,
  },
  uploadDate: {
    type: Date,
    default: Date.now,
  },
});

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
  // New fields for syllabus content
  link: {
    type: String,
    default: "",
  },
  resources: [resourceSchema],
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
