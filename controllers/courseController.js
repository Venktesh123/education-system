const Course = require("../models/Course");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");

const createCourse = async (req, res) => {
  try {
    const { name, description, semesterId } = req.body;

    // Find teacher with their details
    const teacher = await Teacher.findOne({ user: req.user._id });
    if (!teacher) {
      return res.status(404).json({ error: "Teacher not found" });
    }

    // Find all students with matching teacherEmail
    const students = await Student.find({ teacherEmail: teacher.email });

    // Create course with those students
    const course = new Course({
      name,
      description,
      teacher: teacher._id,
      semester: semesterId,
      students: students.map((student) => student._id), // Add all matching students
    });

    await course.save();

    // Add course to teacher's courses
    teacher.courses.push(course._id);
    await teacher.save();

    // Add course to each student's courses array
    await Student.updateMany(
      { teacherEmail: teacher.email },
      { $push: { courses: course._id } }
    );

    // Get populated course data for response
    const populatedCourse = await Course.findById(course._id)
      .populate({
        path: "teacher",
        populate: {
          path: "user",
          select: "name email",
        },
      })
      .populate({
        path: "students",
        populate: {
          path: "user",
          select: "name email",
        },
      })
      .populate("semester")
      .populate("lectures");

    res.status(201).json({
      message: "Course created successfully",
      course: {
        id: populatedCourse._id,
        name: populatedCourse.name,
        description: populatedCourse.description,
        teacher: {
          name: populatedCourse.teacher.user.name,
          email: populatedCourse.teacher.user.email,
        },
        semester: populatedCourse.semester,
        students: populatedCourse.students.map((student) => ({
          id: student._id,
          name: student.user.name,
          email: student.user.email,
        })),
        totalStudents: populatedCourse.students.length,
      },
    });
  } catch (error) {
    console.error("Error in createCourse:", error);
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
    const courses = await Course.find()
      .populate({
        path: "teacher",
        populate: {
          path: "user",
          select: "name email",
        },
      })
      .populate("semester")
      .populate("lectures")
      .populate({
        path: "students",
        populate: {
          path: "user",
          select: "name email",
        },
      });

    const response = courses.map((course) => ({
      id: course._id,
      name: course.name,
      description: course.description,
      teacher: {
        name: course.teacher.user.name,
        email: course.teacher.user.email,
      },
      semester: {
        name: course.semester.name,
        startDate: course.semester.startDate,
        endDate: course.semester.endDate,
      },
      statistics: {
        totalLectures: course.lectures.length,
        totalStudents: course.students.length,
      },
      createdAt: course.createdAt,
    }));

    res.json({
      totalCourses: courses.length,
      courses: response,
    });
  } catch (error) {
    console.error("Error in getAllCourses:", error);
    res.status(500).json({ error: error.message });
  }
};
const getCourseDetails = async (req, res) => {
  try {
    const courseId = req.params.id;

    // Find course with all populated relationships
    const course = await Course.findById(courseId)
      .populate({
        path: "teacher",
        populate: {
          path: "user",
          select: "name email",
        },
      })
      .populate({
        path: "students",
        populate: {
          path: "user",
          select: "name email",
        },
      })
      .populate("semester")
      .populate({
        path: "lectures",
        select: "title content videoUrl createdAt",
      });

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Get all students of the teacher for comparison
    const allTeacherStudents = await Teacher.findById(
      course.teacher._id
    ).populate({
      path: "students",
      populate: {
        path: "user",
        select: "name email",
      },
    });
    console.log(course.students);
    // Structure the response
    const response = {
      courseInfo: {
        id: course._id,
        name: course.name,
        description: course.description,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
      },
      teacher: {
        id: course.teacher._id,
        name: course.teacher.user.name,
        email: course.teacher.user.email,
      },
      semester: {
        id: course.semester._id,
        name: course.semester.name,
        startDate: course.semester.startDate,
        endDate: course.semester.endDate,
      },
      lectures: course.lectures.map((lecture) => ({
        id: lecture._id,
        title: lecture.title,
        content: lecture.content,
        videoUrl: lecture.videoUrl,
        createdAt: lecture.createdAt,
      })),
      students: course.students.map((student) => ({
        id: student._id,
        name: student.user.name,
        email: student.user.email,
        enrolledAt: student.createdAt,
      })),
      statistics: {
        totalLectures: course.lectures.length,
        totalEnrolledStudents: course.students.length,
        totalTeacherStudents: allTeacherStudents.students.length,
      },
    };

    res.json(response);
  } catch (error) {
    console.error("Error in getCourseDetails:", error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createCourse,
  updateCourse,
  getCourse,
  getAllCourses,
  getCourseDetails,
};
