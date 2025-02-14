const { parseExcelFile } = require("../utils/excelParser");
const User = require("../models/User");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");

const uploadUsers = async (req, res) => {
  const session = await User.startSession();

  try {
    if (!req.file?.path) {
      return res.status(400).json({
        error: "Please upload a valid Excel file",
      });
    }

    const users = await parseExcelFile(req.file.path);
    const createdUsers = [];

    await session.withTransaction(async () => {
      // Process teachers first
      const teacherData = users.filter((user) => user.role === "teacher");
      const teacherMap = new Map();

      for (const userData of teacherData) {
        const existingUser = await User.findOne({
          email: userData.email.toLowerCase(),
        }).session(session);

        if (existingUser) {
          throw new Error(`User with email ${userData.email} already exists`);
        }

        const user = new User({
          ...userData,
          email: userData.email.toLowerCase(),
        });
        await user.save({ session });

        const teacher = new Teacher({
          user: user._id,
          email: userData.email.toLowerCase(),
          courses: [],
        });
        await teacher.save({ session });

        teacherMap.set(userData.email.toLowerCase(), teacher);
        createdUsers.push(user);
      }

      // Process students
      const studentData = users.filter((user) => user.role === "student");

      for (const userData of studentData) {
        const existingUser = await User.findOne({
          email: userData.email.toLowerCase(),
        }).session(session);

        if (existingUser) {
          throw new Error(`User with email ${userData.email} already exists`);
        }

        let teacher = teacherMap.get(userData.teacherEmail.toLowerCase());

        if (!teacher) {
          teacher = await Teacher.findOne({
            email: userData.teacherEmail.toLowerCase(),
          }).session(session);

          if (!teacher) {
            throw new Error(
              `Teacher with email ${userData.teacherEmail} not found for student: ${userData.email}`
            );
          }
        }

        const user = new User({
          ...userData,
          email: userData.email.toLowerCase(),
        });
        await user.save({ session });

        const student = new Student({
          user: user._id,
          teacher: teacher._id,
          teacherEmail: teacher.email,
          courses: [],
        });
        await student.save({ session });

        createdUsers.push(user);
      }
    });

    await session.endSession();

    return res.status(201).json({
      message: "Users created successfully",
      count: createdUsers.length,
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

// Make sure to export the function with this exact name
module.exports = {
  uploadUsers,
};
