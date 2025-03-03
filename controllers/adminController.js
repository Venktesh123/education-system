const User = require("../models/User");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");

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

module.exports = {
  uploadUsers,
};
