const mongoose = require("mongoose");

const lectureSchema = new mongoose.Schema(
  {
    title: {
      type: String,
    },
    content: {
      type: String,
    },
    videoUrl: {
      type: String,
    },
    videoKey: {
      type: String,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
    },
    isReviewed: {
      type: Boolean,
      default: false,
    },
    reviewDeadline: {
      type: Date,
      default: function () {
        // Set default review deadline to 7 days from creation
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 7);
        return deadline;
      },
    },
  },
  { timestamps: true }
);

// Middleware to auto-mark as reviewed if deadline has passed
lectureSchema.pre("save", function (next) {
  if (
    !this.isReviewed &&
    this.reviewDeadline &&
    new Date() >= this.reviewDeadline
  ) {
    this.isReviewed = true;
  }
  next();
});

// Middleware to auto-mark as reviewed if deadline has passed when querying
lectureSchema.pre("find", function () {
  this.setOptions({
    runValidators: true,
  });
});

// Static method to update all lectures past their review deadline
lectureSchema.statics.updateReviewStatus = async function () {
  const now = new Date();
  return this.updateMany(
    {
      isReviewed: false,
      reviewDeadline: { $lte: now },
    },
    {
      $set: { isReviewed: true },
    }
  );
};

module.exports = mongoose.model("Lecture", lectureSchema);
