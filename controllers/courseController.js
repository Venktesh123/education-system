const Course = require("../models/Course");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");

const createCourse = async (req, res) => {
  try {
    const { name, description, semesterId } = req.body;
    const teacher = await Teacher.findOne({ user: req.user._id });

    if (!teacher) {
      return res.status(404).json({ error: "Teacher not found" });
    }

    const course = new Course({
      name,
      description,
      teacher: teacher._id,
      semester: semesterId,
    });

    await course.save();

    teacher.courses.push(course._id);
    await teacher.save();

    res.status(201).json(course);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const updateCourse = async (req, res) => {
  try {
    const { name, description } = req.body;
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    const teacher = await Teacher.findOne({ user: req.user._id });
    if (!teacher || !course.teacher.equals(teacher._id)) {
      return res.status(403).json({ error: "Not authorized" });
    }

    course.name = name;
    course.description = description;
    await course.save();

    res.json(course);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate("teacher", "name")
      .populate("lectures")
      .populate("semester");

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    res.json(course);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getAllCourses = async (req, res) => {
  try {
    let courses;

    if (req.user.role === "student") {
      const student = await Student.findOne({ user: req.user._id });
      courses = await Course.find({ _id: { $in: student.courses } })
        .populate("teacher", "name")
        .populate("semester");
    } else if (req.user.role === "teacher") {
      const teacher = await Teacher.findOne({ user: req.user._id });
      courses = await Course.find({ teacher: teacher._id }).populate(
        "semester"
      );
    } else {
      courses = await Course.find()
        .populate("teacher", "name")
        .populate("semester");
    }

    res.json(courses);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

module.exports = {
  createCourse,
  updateCourse,
  getCourse,
  getAllCourses,
};
