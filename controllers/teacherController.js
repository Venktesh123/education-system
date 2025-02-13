const User = require("../models/User");
const Course = require("../models/Course");

exports.getStudents = async (req, res) => {
  try {
    const students = await User.find({
      role: "student",
      teacher: req.user._id,
    });
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.assignStudent = async (req, res) => {
  try {
    const student = await User.findById(req.params.studentId);
    if (!student || student.role !== "student") {
      return res.status(404).json({ error: "Student not found" });
    }

    student.teacher = req.user._id;
    await student.save();

    res.json(student);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
