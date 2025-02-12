const { Course, Lecture } = require("../models");

exports.createCourse = async (req, res) => {
  try {
    const course = new Course({
      ...req.body,
      teacher: req.user._id,
    });
    await course.save();
    res.status(201).json(course);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getCourses = async (req, res) => {
  try {
    const courses = await Course.find({})
      .populate("teacher", "name email")
      .populate("semester", "name startDate endDate");
    res.json(courses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.addLecture = async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    if (course.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const lecture = new Lecture({
      ...req.body,
      course: course._id,
    });
    await lecture.save();

    course.lectures.push(lecture._id);
    await course.save();

    res.status(201).json(lecture);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
exports.getAllInformation = async (req, res) => {
  try {
    // Find all teachers with their basic information
    const teachers = await User.find({ role: "teacher" })
      .select("-password")
      .lean();

    // Array to store comprehensive information
    const comprehensiveInfo = [];

    // For each teacher, gather their courses and students
    for (const teacher of teachers) {
      // Find all courses taught by this teacher
      const courses = await Course.find({ teacher: teacher._id })
        .populate({
          path: "semester",
          select: "name startDate endDate",
        })
        .populate({
          path: "lectures",
          select: "title content order",
        })
        .lean();

      // Find all students assigned to this teacher
      const students = await User.find({
        teacher: teacher._id,
        role: "student",
      })
        .select("-password")
        .lean();

      // For each course, get enrolled students
      const coursesWithDetails = await Promise.all(
        courses.map(async (course) => {
          const enrolledStudents = await User.find({
            _id: { $in: course.students },
            role: "student",
          })
            .select("name email")
            .lean();

          return {
            ...course,
            enrolledStudents,
          };
        })
      );

      // Compile comprehensive information for this teacher
      comprehensiveInfo.push({
        teacherInfo: {
          id: teacher._id,
          name: teacher.name,
          email: teacher.email,
        },
        courses: coursesWithDetails.map((course) => ({
          id: course._id,
          name: course.name,
          description: course.description,
          semester: course.semester,
          lectures: course.lectures.map((lecture) => ({
            id: lecture._id,
            title: lecture.title,
            content: lecture.content,
            order: lecture.order,
          })),
          enrolledStudents: course.enrolledStudents,
        })),
        assignedStudents: students.map((student) => ({
          id: student._id,
          name: student.name,
          email: student.email,
        })),
      });
    }

    // Get overall statistics
    const statistics = {
      totalTeachers: teachers.length,
      totalCourses: await Course.countDocuments(),
      totalStudents: await User.countDocuments({ role: "student" }),
      totalLectures: await Lecture.countDocuments(),
      activeSemesters: await Semester.countDocuments({
        endDate: { $gte: new Date() },
      }),
    };

    res.json({
      statistics,
      teacherDetails: comprehensiveInfo,
    });
  } catch (error) {
    console.error("Error in getAllInformation:", error);
    res.status(500).json({
      error: "Error fetching comprehensive information",
      details: error.message,
    });
  }
};

exports.getTeacherInformation = async (req, res) => {
  try {
    const { teacherId } = req.params;

    // Get teacher information
    const teacher = await User.findOne({
      _id: teacherId,
      role: "teacher",
    })
      .select("-password")
      .lean();

    if (!teacher) {
      return res.status(404).json({ error: "Teacher not found" });
    }

    // Get teacher's courses with details
    const courses = await Course.find({ teacher: teacherId })
      .populate({
        path: "semester",
        select: "name startDate endDate",
      })
      .populate({
        path: "lectures",
        select: "title content order",
      })
      .lean();

    // Get assigned students
    const assignedStudents = await User.find({
      teacher: teacherId,
      role: "student",
    })
      .select("-password")
      .lean();

    // Get enrolled students for each course
    const coursesWithDetails = await Promise.all(
      courses.map(async (course) => {
        const enrolledStudents = await User.find({
          _id: { $in: course.students },
          role: "student",
        })
          .select("name email")
          .lean();

        return {
          ...course,
          enrolledStudents,
        };
      })
    );

    res.json({
      teacherInfo: {
        id: teacher._id,
        name: teacher.name,
        email: teacher.email,
      },
      courses: coursesWithDetails.map((course) => ({
        id: course._id,
        name: course.name,
        description: course.description,
        semester: course.semester,
        lectures: course.lectures.map((lecture) => ({
          id: lecture._id,
          title: lecture.title,
          content: lecture.content,
          order: lecture.order,
        })),
        enrolledStudents: course.enrolledStudents,
      })),
      assignedStudents: assignedStudents.map((student) => ({
        id: student._id,
        name: student.name,
        email: student.email,
      })),
    });
  } catch (error) {
    console.error("Error in getTeacherInformation:", error);
    res.status(500).json({
      error: "Error fetching teacher information",
      details: error.message,
    });
  }
};

// controllers/studentController.js
exports.enrollCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    if (course.teacher.toString() !== req.user.teacher.toString()) {
      return res
        .status(403)
        .json({
          error:
            "You can only enroll in courses taught by your assigned teacher",
        });
    }

    if (!course.students.includes(req.user._id)) {
      course.students.push(req.user._id);
      await course.save();
    }

    res.json(course);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
