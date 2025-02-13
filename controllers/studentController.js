const Course = require("../models/Course");
const Student = require("../models/Student");

const enrollCourse = async (req, res) => {
  try {
    // Find the course
    const course = await Course.findById(req.params.courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Find the student
    const student = await Student.findOne({ user: req.user._id });
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Check if student's teacher matches course's teacher
    if (course.teacher.toString() !== student.teacher.toString()) {
      return res.status(403).json({
        error: "You can only enroll in courses taught by your assigned teacher",
      });
    }

    // Check if student is already enrolled
    if (student.courses.includes(course._id)) {
      return res.status(400).json({ error: "Already enrolled in this course" });
    }

    // Add course to student's courses
    student.courses.push(course._id);
    await student.save();

    // Add student to course's students
    course.students.push(student._id);
    await course.save();

    return res.status(200).json({
      message: "Successfully enrolled in the course",
      course: course,
    });
  } catch (error) {
    console.error("Error in enrollCourse:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = {
  enrollCourse,
};
