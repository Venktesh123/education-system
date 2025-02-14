// controllers/lectureController.js
const Lecture = require("../models/Lecture");
const Course = require("../models/Course");
const Teacher = require("../models/Teacher");

// Create lecture
const createLecture = async (req, res) => {
  try {
    const { title, content, videoUrl, courseId } = req.body;

    // More flexible YouTube URL validation
    const youtubeRegex =
      /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+([\?&].+)?$/;
    if (!youtubeRegex.test(videoUrl)) {
      return res.status(400).json({
        error: "Invalid YouTube URL. Please provide a valid YouTube video URL",
      });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    const teacher = await Teacher.findOne({ user: req.user._id });
    if (!teacher || !course.teacher.equals(teacher._id)) {
      return res.status(403).json({
        error: "Not authorized to add lectures to this course",
      });
    }

    const lecture = new Lecture({
      title,
      content,
      videoUrl,
      course: courseId,
    });

    await lecture.save();
    course.lectures.push(lecture._id);
    await course.save();

    res.status(201).json(lecture);
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
};
// Update lecture
const updateLecture = async (req, res) => {
  try {
    const { title, content, videoUrl } = req.body;
    const lecture = await Lecture.findById(req.params.id);

    if (!lecture) {
      return res.status(404).json({ error: "Lecture not found" });
    }

    // Verify teacher owns the course
    const course = await Course.findById(lecture.course);
    const teacher = await Teacher.findOne({ user: req.user._id });

    if (!teacher || !course.teacher.equals(teacher._id)) {
      return res
        .status(403)
        .json({ error: "Not authorized to update this lecture" });
    }

    lecture.title = title || lecture.title;
    lecture.content = content || lecture.content;
    lecture.videoUrl = videoUrl || lecture.videoUrl;

    await lecture.save();
    res.json(lecture);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get lecture
const getLecture = async (req, res) => {
  try {
    const lecture = await Lecture.findById(req.params.id).populate("course");

    if (!lecture) {
      return res.status(404).json({ error: "Lecture not found" });
    }

    res.json(lecture);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createLecture,
  updateLecture,
  getLecture,
};
