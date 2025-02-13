const Lecture = require("../models/Lecture");
const Course = require("../models/Course");
const Teacher = require("../models/Teacher");

const createLecture = async (req, res) => {
  try {
    const { title, content, courseId } = req.body;
    const teacher = await Teacher.findOne({ user: req.user._id });
    const course = await Course.findById(courseId);

    if (!teacher || !course.teacher.equals(teacher._id)) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const lecture = new Lecture({
      title,
      content,
      course: courseId,
    });

    await lecture.save();

    course.lectures.push(lecture._id);
    await course.save();

    res.status(201).json(lecture);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const updateLecture = async (req, res) => {
  try {
    const { title, content } = req.body;
    const lecture = await Lecture.findById(req.params.id);

    if (!lecture) {
      return res.status(404).json({ error: "Lecture not found" });
    }

    const course = await Course.findById(lecture.course);
    const teacher = await Teacher.findOne({ user: req.user._id });

    if (!teacher || !course.teacher.equals(teacher._id)) {
      return res.status(403).json({ error: "Not authorized" });
    }

    lecture.title = title;
    lecture.content = content;
    await lecture.save();

    res.json(lecture);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getLecture = async (req, res) => {
  try {
    const lecture = await Lecture.findById(req.params.id).populate("course");

    if (!lecture) {
      return res.status(404).json({ error: "Lecture not found" });
    }

    res.json(lecture);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

module.exports = {
  createLecture,
  updateLecture,
  getLecture,
};
