const User = require("../models/User");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const { ErrorHandler } = require("../middleware/errorHandler");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");

const uploadUsers = async (req, res) => {
  const session = await User.startSession();
  console.log("Processing user upload from in-memory data");

  try {
    // Get the Excel data that was parsed in the middleware
    if (
      !req.excelData ||
      !Array.isArray(req.excelData) ||
      req.excelData.length === 0
    ) {
      return res.status(400).json({
        error: "No valid data found in the Excel file",
      });
    }

    const users = req.excelData;
    const results = [];
    const teacherMap = new Map();

    await session.withTransaction(async () => {
      // Process teachers first
      const teacherData = users.filter((user) => user.role === "teacher");

      // Process each teacher individually
      for (const userData of teacherData) {
        const email = userData.email.toLowerCase();

        // Check if user already exists
        const existingUser = await User.findOne({ email }).session(session);
        if (existingUser) {
          throw new Error(`User with email ${email} already exists`);
        }

        // Create user document
        const user = new User({
          ...userData,
          email: email,
        });
        await user.save({ session });

        // Create teacher document
        const teacher = new Teacher({
          user: user._id,
          email: email,
          courses: [],
        });
        await teacher.save({ session });

        // Store in map for quick lookup when processing students
        teacherMap.set(email, teacher);

        // Add to results
        results.push({
          _id: user._id.toString(),
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
        });
      }

      // Process students
      const studentData = users.filter((user) => user.role === "student");

      for (const userData of studentData) {
        const email = userData.email.toLowerCase();
        const teacherEmail = userData.teacherEmail.toLowerCase();

        // Check if user already exists
        const existingUser = await User.findOne({ email }).session(session);
        if (existingUser) {
          throw new Error(`User with email ${email} already exists`);
        }

        // Find the teacher
        let teacher = teacherMap.get(teacherEmail);
        if (!teacher) {
          teacher = await Teacher.findOne({ email: teacherEmail }).session(
            session
          );
          if (!teacher) {
            throw new Error(
              `Teacher with email ${teacherEmail} not found for student: ${email}`
            );
          }
        }

        // Create user document
        const user = new User({
          ...userData,
          email: email,
        });
        await user.save({ session });

        // Create student document
        const student = new Student({
          user: user._id,
          teacher: teacher._id,
          teacherEmail: teacher.email,
          courses: [],
        });
        await student.save({ session });

        // Add to results
        results.push({
          _id: user._id.toString(),
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
          teacherEmail: teacher.email,
        });
      }
    });

    await session.endSession();

    // Return results as array
    return res.status(201).json(results);
  } catch (error) {
    await session.endSession();
    console.error("Upload error:", error);

    return res.status(400).json({
      error: error.message || "Error processing upload",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};
const getMyStudents = catchAsyncErrors(async (req, res, next) => {
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
  const students = await Student.find({ teacher: teacher._id })
    .populate({
      path: "user",
      select: "name email",
    })
    .populate({
      path: "enrolledCourses.course",
      select: "title description",
    });

  if (!students || students.length === 0) {
    console.log("No students found for this teacher");
    return res.status(200).json({
      success: true,
      message: "No students found for this teacher",
      teacherInfo: {
        id: teacher._id,
        email: teacher.email,
        name: req.user.name,
      },
      students: [],
    });
  }

  console.log(`Found ${students.length} students for teacher ${teacher.email}`);

  // Format student data
  const formattedStudents = students.map((student) => ({
    id: student._id,
    name: student.user ? student.user.name : "Unknown",
    email: student.email,
    program: student.program,
    semester: student.semester,
    enrolledCourses: student.enrolledCourses.map((course) => ({
      courseId: course.course?._id || course.course,
      courseTitle: course.course?.title || "Unknown Course",
      status: course.status,
      enrolledOn: course.enrolledOn,
    })),
  }));

  res.status(200).json({
    success: true,
    count: students.length,
    teacherInfo: {
      id: teacher._id,
      email: teacher.email,
      name: req.user.name,
    },
    students: formattedStudents,
  });
});

// Admin route to get students for any teacher by teacher ID
const getStudentsByTeacherId = catchAsyncErrors(async (req, res, next) => {
  console.log("getStudentsByTeacherId: Started");

  const { teacherId } = req.params;
  console.log(`Getting students for teacher ID: ${teacherId}`);

  // Check if teacher exists
  const teacher = await Teacher.findById(teacherId).populate({
    path: "user",
    select: "name email",
  });

  if (!teacher) {
    console.log("Teacher not found");
    return next(new ErrorHandler("Teacher not found", 404));
  }

  // Find all students associated with this teacher
  const students = await Student.find({ teacher: teacherId })
    .populate({
      path: "user",
      select: "name email",
    })
    .populate({
      path: "enrolledCourses.course",
      select: "title description",
    });

  if (!students || students.length === 0) {
    console.log("No students found for this teacher");
    return res.status(200).json({
      success: true,
      message: "No students found for this teacher",
      teacherInfo: {
        id: teacher._id,
        email: teacher.email,
        name: teacher.user ? teacher.user.name : "Unknown",
      },
      students: [],
    });
  }

  console.log(`Found ${students.length} students for teacher ${teacher.email}`);

  // Format student data
  const formattedStudents = students.map((student) => ({
    id: student._id,
    name: student.user ? student.user.name : "Unknown",
    email: student.email,
    program: student.program,
    semester: student.semester,
    enrolledCourses: student.enrolledCourses.map((course) => ({
      courseId: course.course?._id || course.course,
      courseTitle: course.course?.title || "Unknown Course",
      status: course.status,
      enrolledOn: course.enrolledOn,
    })),
  }));

  res.status(200).json({
    success: true,
    count: students.length,
    teacherInfo: {
      id: teacher._id,
      email: teacher.email,
      name: teacher.user ? teacher.user.name : "Unknown",
    },
    students: formattedStudents,
  });
});

module.exports = {
  uploadUsers,
  getStudentsByTeacherId,
  getMyStudents,
};
