const Course = require("../models/Course");
const Teacher = require("../models/Teacher");
const CourseOutcome = require("../models/CourseOutcome");
const CourseSchedule = require("../models/CourseSchedule");
const CourseSyllabus = require("../models/CourseSyllabus");
const WeeklyPlan = require("../models/WeeklyPlan");
const CreditPoints = require("../models/CreditPoints");
const mongoose = require("mongoose");

// Helper function to format course data
const formatCourseData = (course) => {
  return {
    _id: course._id,
    title: course.title,
    aboutCourse: course.aboutCourse,
    semester: course.semester,
    teacher: course.teacher,
    creditPoints: course.creditPoints
      ? {
          lecture: course.creditPoints.lecture,
          tutorial: course.creditPoints.tutorial,
          practical: course.creditPoints.practical,
          project: course.creditPoints.project,
        }
      : {
          lecture: 0,
          tutorial: 0,
          practical: 0,
          project: 0,
        },
    learningOutcomes: course.outcomes ? course.outcomes.outcomes : [],
    weeklyPlan: course.weeklyPlan
      ? course.weeklyPlan.weeks.map((week) => ({
          weekNumber: week.weekNumber,
          topics: week.topics,
        }))
      : [],
    syllabus: course.syllabus
      ? course.syllabus.modules.map((module) => ({
          moduleNumber: module.moduleNumber,
          moduleTitle: module.moduleTitle,
          topics: module.topics,
        }))
      : [],
    courseSchedule: course.schedule
      ? {
          classStartDate: course.schedule.classStartDate,
          classEndDate: course.schedule.classEndDate,
          midSemesterExamDate: course.schedule.midSemesterExamDate,
          endSemesterExamDate: course.schedule.endSemesterExamDate,
          classDaysAndTimes: course.schedule.classDaysAndTimes.map((day) => ({
            day: day.day,
            time: day.time,
          })),
        }
      : {
          classStartDate: "",
          classEndDate: "",
          midSemesterExamDate: "",
          endSemesterExamDate: "",
          classDaysAndTimes: [],
        },
    lectures: course.lectures || [],
  };
};

// Get all courses for logged-in teacher
const getTeacherCourses = async function (req, res) {
  try {
    // Find teacher using the user ID from token
    const teacher = await Teacher.findOne({ user: req.user.id }).populate({
      path: "user",
      select: "name email role", // Get basic user info
    });

    if (!teacher) {
      return res.status(404).json({ error: "Teacher not found" });
    }

    // Get all students for this teacher using virtual populate
    await teacher.populate({
      path: "students", // Virtual field defined in teacherSchema
      populate: {
        path: "user",
        select: "name email", // Include basic user details for students
      },
    });

    // Get all courses with populated fields
    const courses = await Course.find({ teacher: teacher._id })
      .populate("semester")
      .populate("outcomes")
      .populate("schedule")
      .populate("syllabus")
      .populate("weeklyPlan")
      .populate("creditPoints")
      .sort({ createdAt: -1 });

    // Format response with teacher and students data
    const formattedCourses = courses.map((course) => formatCourseData(course));

    // Return formatted data with teacher and students information
    res.json({
      teacher: {
        _id: teacher._id,
        name: teacher.user?.name,
        email: teacher.email, // Using the email field from Teacher model
        totalStudents: teacher.students?.length || 0,
      },
      students:
        teacher.students?.map((student) => ({
          _id: student._id,
          name: student.user?.name,
          email: student.user?.email,
          teacherEmail: student.teacherEmail, // Include teacherEmail from Student model
        })) || [],
      courses: formattedCourses,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get specific course by ID
const getCourseById = async function (req, res) {
  try {
    const teacher = await Teacher.findOne({ user: req.user.userId });
    if (!teacher) {
      return res.status(404).json({ error: "Teacher not found" });
    }

    const course = await Course.findOne({
      _id: req.params.courseId,
      teacher: teacher._id,
    })
      .populate("semester")
      .populate("outcomes")
      .populate("schedule")
      .populate("syllabus")
      .populate("weeklyPlan")
      .populate("creditPoints");

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    const formattedCourse = formatCourseData(course);
    res.json(formattedCourse);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Create new course
const createCourse = async function (req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      throw new Error("Teacher not found");
    }

    // Create main course
    const course = new Course({
      title: req.body.title,
      aboutCourse: req.body.aboutCourse,
      semester: req.body.semester,
      teacher: teacher._id,
      lectures: req.body.lectures || [],
    });
    await course.save({ session });

    // Create learning outcomes
    if (req.body.learningOutcomes && req.body.learningOutcomes.length > 0) {
      const outcome = await CourseOutcome.create(
        [
          {
            outcomes: req.body.learningOutcomes,
            course: course._id,
          },
        ],
        { session }
      );
      course.outcomes = outcome[0]._id;
    }

    // Create course schedule
    if (req.body.courseSchedule) {
      const scheduleData = {
        ...req.body.courseSchedule,
        course: course._id,
      };

      const schedule = await CourseSchedule.create([scheduleData], { session });
      course.schedule = schedule[0]._id;
    }

    // Create syllabus
    if (req.body.syllabus && req.body.syllabus.length > 0) {
      const syllabus = await CourseSyllabus.create(
        [
          {
            modules: req.body.syllabus,
            course: course._id,
          },
        ],
        { session }
      );
      course.syllabus = syllabus[0]._id;
    }

    // Create weekly plan
    if (req.body.weeklyPlan && req.body.weeklyPlan.length > 0) {
      const weeklyPlan = await WeeklyPlan.create(
        [
          {
            weeks: req.body.weeklyPlan,
            course: course._id,
          },
        ],
        { session }
      );
      course.weeklyPlan = weeklyPlan[0]._id;
    }

    // Create credit points
    if (req.body.creditPoints) {
      const creditPoints = await CreditPoints.create(
        [
          {
            ...req.body.creditPoints,
            course: course._id,
          },
        ],
        { session }
      );
      course.creditPoints = creditPoints[0]._id;
    }

    // Save updated course with all references
    await course.save({ session });

    // Add course to teacher's courses
    teacher.courses.push(course._id);
    await teacher.save({ session });

    await session.commitTransaction();

    // Get the fully populated course
    const createdCourse = await Course.findById(course._id)
      .populate("semester")
      .populate("outcomes")
      .populate("schedule")
      .populate("syllabus")
      .populate("weeklyPlan")
      .populate("creditPoints");

    const formattedCourse = formatCourseData(createdCourse);
    res.status(201).json(formattedCourse);
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ error: error.message });
  } finally {
    session.endSession();
  }
};

// Update course
const updateCourse = async function (req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const teacher = await Teacher.findOne({ user: req.user.userId });
    if (!teacher) {
      throw new Error("Teacher not found");
    }

    const course = await Course.findOne({
      _id: req.params.courseId,
      teacher: teacher._id,
    });

    if (!course) {
      throw new Error("Course not found");
    }

    // Update main course fields
    if (req.body.title) course.title = req.body.title;
    if (req.body.aboutCourse) course.aboutCourse = req.body.aboutCourse;
    if (req.body.semester) course.semester = req.body.semester;
    if (req.body.lectures) course.lectures = req.body.lectures;

    await course.save({ session });

    // Update learning outcomes
    if (req.body.learningOutcomes) {
      if (course.outcomes) {
        await CourseOutcome.findByIdAndUpdate(
          course.outcomes,
          { outcomes: req.body.learningOutcomes },
          { session }
        );
      } else {
        const outcome = await CourseOutcome.create(
          [
            {
              outcomes: req.body.learningOutcomes,
              course: course._id,
            },
          ],
          { session }
        );
        course.outcomes = outcome[0]._id;
        await course.save({ session });
      }
    }

    // Update course schedule
    if (req.body.courseSchedule) {
      if (course.schedule) {
        await CourseSchedule.findByIdAndUpdate(
          course.schedule,
          req.body.courseSchedule,
          { session }
        );
      } else {
        const schedule = await CourseSchedule.create(
          [
            {
              ...req.body.courseSchedule,
              course: course._id,
            },
          ],
          { session }
        );
        course.schedule = schedule[0]._id;
        await course.save({ session });
      }
    }

    // Update syllabus
    if (req.body.syllabus) {
      if (course.syllabus) {
        await CourseSyllabus.findByIdAndUpdate(
          course.syllabus,
          { modules: req.body.syllabus },
          { session }
        );
      } else {
        const syllabus = await CourseSyllabus.create(
          [
            {
              modules: req.body.syllabus,
              course: course._id,
            },
          ],
          { session }
        );
        course.syllabus = syllabus[0]._id;
        await course.save({ session });
      }
    }

    // Update weekly plan
    if (req.body.weeklyPlan) {
      if (course.weeklyPlan) {
        await WeeklyPlan.findByIdAndUpdate(
          course.weeklyPlan,
          { weeks: req.body.weeklyPlan },
          { session }
        );
      } else {
        const weeklyPlan = await WeeklyPlan.create(
          [
            {
              weeks: req.body.weeklyPlan,
              course: course._id,
            },
          ],
          { session }
        );
        course.weeklyPlan = weeklyPlan[0]._id;
        await course.save({ session });
      }
    }

    // Update credit points
    if (req.body.creditPoints) {
      if (course.creditPoints) {
        await CreditPoints.findByIdAndUpdate(
          course.creditPoints,
          req.body.creditPoints,
          { session }
        );
      } else {
        const creditPoints = await CreditPoints.create(
          [
            {
              ...req.body.creditPoints,
              course: course._id,
            },
          ],
          { session }
        );
        course.creditPoints = creditPoints[0]._id;
        await course.save({ session });
      }
    }

    await session.commitTransaction();

    // Get updated course with all populated fields
    const updatedCourse = await Course.findById(course._id)
      .populate("semester")
      .populate("outcomes")
      .populate("schedule")
      .populate("syllabus")
      .populate("weeklyPlan")
      .populate("creditPoints");

    const formattedCourse = formatCourseData(updatedCourse);
    res.json(formattedCourse);
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ error: error.message });
  } finally {
    session.endSession();
  }
};

// Delete course and all related data
const deleteCourse = async function (req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const teacher = await Teacher.findOne({ user: req.user.userId });
    if (!teacher) {
      throw new Error("Teacher not found");
    }

    const course = await Course.findOne({
      _id: req.params.courseId,
      teacher: teacher._id,
    });

    if (!course) {
      throw new Error("Course not found");
    }

    // Delete all related documents
    if (course.outcomes) {
      await CourseOutcome.findByIdAndDelete(course.outcomes, { session });
    }

    if (course.schedule) {
      await CourseSchedule.findByIdAndDelete(course.schedule, { session });
    }

    if (course.syllabus) {
      await CourseSyllabus.findByIdAndDelete(course.syllabus, { session });
    }

    if (course.weeklyPlan) {
      await WeeklyPlan.findByIdAndDelete(course.weeklyPlan, { session });
    }

    if (course.creditPoints) {
      await CreditPoints.findByIdAndDelete(course.creditPoints, { session });
    }

    // Remove course from teacher's courses
    teacher.courses = teacher.courses.filter((id) => !id.equals(course._id));
    await teacher.save({ session });

    // Delete the course
    await Course.findByIdAndDelete(course._id, { session });

    await session.commitTransaction();
    res.json({ message: "Course deleted successfully" });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ error: error.message });
  } finally {
    session.endSession();
  }
};

module.exports = {
  getTeacherCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
};
