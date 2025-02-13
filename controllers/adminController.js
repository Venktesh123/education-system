const { parseExcelFile } = require("../utils/excelParser");
const User = require("../models/User");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");

const uploadUsers = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Please upload an Excel file" });
    }

    const users = await parseExcelFile(req.file.path);
    const createdUsers = [];

    for (const userData of users) {
      const user = new User(userData);
      await user.save();

      if (userData.role === "teacher") {
        const teacher = new Teacher({ user: user._id });
        await teacher.save();
      } else if (userData.role === "student") {
        // Assuming teacher email is provided in Excel
        const teacher = await Teacher.findOne({
          "user.email": userData.teacherEmail,
        });
        if (!teacher) {
          throw new Error(`Teacher not found for student: ${userData.email}`);
        }

        const student = new Student({
          user: user._id,
          teacher: teacher._id,
        });
        await student.save();

        teacher.students.push(student._id);
        await teacher.save();
      }

      createdUsers.push(user);
    }

    res
      .status(201)
      .json({ message: "Users created successfully", users: createdUsers });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

module.exports = { uploadUsers };
