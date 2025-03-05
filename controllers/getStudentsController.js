const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const User = require("../models/User");
const { ErrorHandler } = require("../middleware/errorHandler");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");

// Get students for the currently authenticated teacher
exports.getMyStudents = catchAsyncErrors(async (req, res, next) => {
  console.log("getMyStudents: Started");

  // Extract user info from JWT token (set by auth middleware)
  const userId = req.user._id;
  console.log(`Authenticated user ID: ${userId}`);

  // Find the teacher profile for this user
  const teacher = await Teacher.findOne({ user: userId });
  if (!teacher) {
    console.log("Teacher profile not found for authenticated user");
    return next(new ErrorHandler("Teacher profile not found", 404));
  }

  console.log(`Found teacher with ID: ${teacher._id}, Email: ${teacher.email}`);

  // Find all students associated with this teacher
  const students = await Student.find({ teacher: teacher._id }).populate({
    path: "user",
    select: "name email",
  });

  if (!students || students.length === 0) {
    console.log("No students found for this teacher");
    return res.status(200).json({
      success: true,
      message: "No students found for this teacher",
      students: [],
    });
  }

  console.log(`Found ${students.length} students for teacher ${teacher.email}`);

  res.status(200).json({
    success: true,
    count: students.length,
    students,
  });
});

// Admin route to get students for any teacher by teacher ID
exports.getStudentsByTeacherId = catchAsyncErrors(async (req, res, next) => {
  console.log("getStudentsByTeacherId: Started");

  const { teacherId } = req.params;
  console.log(`Getting students for teacher ID: ${teacherId}`);

  // Check if teacher exists
  const teacher = await Teacher.findById(teacherId);
  if (!teacher) {
    console.log("Teacher not found");
    return next(new ErrorHandler("Teacher not found", 404));
  }

  // Find all students associated with this teacher
  const students = await Student.find({ teacher: teacherId }).populate({
    path: "user",
    select: "name email",
  });

  if (!students || students.length === 0) {
    console.log("No students found for this teacher");
    return res.status(200).json({
      success: true,
      message: "No students found for this teacher",
      students: [],
    });
  }

  console.log(`Found ${students.length} students for teacher ${teacher.email}`);

  res.status(200).json({
    success: true,
    count: students.length,
    students,
  });
});

module.exports = exports;
