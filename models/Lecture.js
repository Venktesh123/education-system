const mongoose = require("mongoose");

const lectureSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    videoUrl: {
      type: String,
      required: true,
      validate: {
        validator: function (v) {
          // More flexible YouTube URL validation that accepts additional parameters
          const youtubeRegex =
            /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+([\?&].+)?$/;
          return youtubeRegex.test(v);
        },
        message: (props) =>
          `${props.value} is not a valid YouTube URL! Please provide a valid YouTube URL.`,
      },
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
  },
  { timestamps: true }
);

// Helper method to extract video ID
lectureSchema.methods.getVideoId = function () {
  const url = this.videoUrl;
  if (url.includes("youtu.be/")) {
    // Handle shortened URLs
    const id = url.split("youtu.be/")[1].split("?")[0];
    return id;
  } else {
    // Handle full URLs
    const match = url.match(/[?&]v=([^&]+)/);
    return match ? match[1] : null;
  }
};

module.exports = mongoose.model("Lecture", lectureSchema);
