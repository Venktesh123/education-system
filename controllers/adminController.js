const { parseExcelFile } = require("../utils/excelParser");
const User = require("../models/User");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");

const uploadUsers = async (req, res) => {
  const session = await User.startSession();
  console.log("Processing user upload");

  try {
    if (!req.file?.path) {
      return res.status(400).json({
        error: "Please upload a valid Excel file",
      });
    }

    const users = await parseExcelFile(req.file.path);
    const createdUsers = {};
    const userIds = [];

    await session.withTransaction(async () => {
      // Process teachers first
      const teacherData = users.filter((user) => user.role === "teacher");
      const teacherMap = new Map();

      // Create teachers
      for (const userData of teacherData) {
        const email = userData.email.toLowerCase();

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

        // Store user data indexed by email for easy lookup
        createdUsers[email] = {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
        };

        userIds.push(user._id);
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

        // Store user data indexed by email for easy lookup
        createdUsers[email] = {
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
          teacherEmail: teacher.email,
        };

        userIds.push(user._id);
      }
    });

    await session.endSession();

    return res.status(201).json({
      message: "Users created successfully",
      count: userIds.length,
      userIds: userIds,
      users: createdUsers,
    });
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
