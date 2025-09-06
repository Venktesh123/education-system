const mongoose = require("mongoose");

// Schema for videos in a module
const moduleVideoSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: "",
  },
  thumbnail: {
    thumbnailUrl: {
      type: String,
      default: "",
    },
    thumbnailKey: {
      type: String,
      default: "",
    },
  },
  fileUrl: {
    type: String,
    required: true,
  },
  fileKey: {
    type: String,
    required: true,
  },
  createDate: {
    type: Date,
    default: Date.now,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
});

// Schema for links in a module
const moduleLinkSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: "",
  },
  thumbnail: {
    thumbnailUrl: {
      type: String,
      default: "",
    },
    thumbnailKey: {
      type: String,
      default: "",
    },
  },
  fileUrl: {
    type: String,
    required: true,
  },
  createDate: {
    type: Date,
    default: Date.now,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
});

// Schema for PDFs in a module
const modulePdfSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: "",
  },
  thumbnail: {
    thumbnailUrl: {
      type: String,
      default: "",
    },
    thumbnailKey: {
      type: String,
      default: "",
    },
  },
  fileUrl: {
    type: String,
    required: true,
  },
  fileKey: {
    type: String,
    required: true,
  },
  createDate: {
    type: Date,
    default: Date.now,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
});

// Schema for PPTs in a module
const modulePptSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: "",
  },
  thumbnail: {
    thumbnailUrl: {
      type: String,
      default: "",
    },
    thumbnailKey: {
      type: String,
      default: "",
    },
  },
  fileUrl: {
    type: String,
    required: true,
  },
  fileKey: {
    type: String,
    required: true,
  },
  createDate: {
    type: Date,
    default: Date.now,
  },
  isActive: {
    type: Boolean,
    default: true,
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

  // New structure with separate arrays for each content type
  videos: [moduleVideoSchema],
  links: [moduleLinkSchema],
  pdfs: [modulePdfSchema],
  ppts: [modulePptSchema],

  // Lectures for this module
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
