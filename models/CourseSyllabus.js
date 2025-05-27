const mongoose = require("mongoose");

// Content Item Schema for different types of content
const contentItemSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["file", "link", "video", "text"],
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: "",
  },
  // For file type
  fileType: {
    type: String,
    enum: ["pdf", "presentation", "document", "image", "other"],
    required: function () {
      return this.type === "file";
    },
  },
  fileUrl: {
    type: String,
    required: function () {
      return this.type === "file";
    },
  },
  fileKey: {
    type: String,
    required: function () {
      return this.type === "file";
    },
  },
  fileName: {
    type: String,
    required: function () {
      return this.type === "file";
    },
  },
  // For link type
  url: {
    type: String,
    required: function () {
      return this.type === "link";
    },
  },
  // For video type
  videoUrl: {
    type: String,
    required: function () {
      return this.type === "video";
    },
  },
  videoKey: {
    type: String,
    // Only required if we're hosting the video ourselves
  },
  videoProvider: {
    type: String,
    enum: ["youtube", "vimeo", "other"],
    default: "other",
    required: function () {
      return this.type === "video";
    },
  },
  // For text type
  content: {
    type: String,
    required: function () {
      return this.type === "text";
    },
  },
  // Common fields
  order: {
    type: Number,
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

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
  description: {
    type: String,
    default: "",
  },
  topics: [
    {
      type: String,
      required: true,
    },
  ],
  // For backward compatibility
  link: {
    type: String,
    default: "",
  },
  // For backward compatibility
  resources: [resourceSchema],

  // New field for all types of content
  contentItems: [contentItemSchema],

  // NEW: Lectures for this module
  lectures: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lecture",
    },
  ],

  // Module status and ordering
  isActive: {
    type: Boolean,
    default: true,
  },
  order: {
    type: Number,
    default: 0,
  },
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

// Index for efficient queries
courseSyllabusSchema.index({ course: 1 });

module.exports = mongoose.model("CourseSyllabus", courseSyllabusSchema);
