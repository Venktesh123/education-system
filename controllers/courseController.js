const Course = require("../models/Course");
const Teacher = require("../models/Teacher");
const CourseOutcome = require("../models/CourseOutcome");
const CourseSchedule = require("../models/CourseSchedule");
const CourseSyllabus = require("../models/CourseSyllabus");
const WeeklyPlan = require("../models/WeeklyPlan");
const CreditPoints = require("../models/CreditPoints");
const CourseAttendance = require("../models/CourseAttendance");
const Student = require("../models/Student");
const mongoose = require("mongoose");

// Better logging setup - replace with your preferred logging library
const logger = {
  info: (message) => console.log(`[INFO] ${message}`),
  error: (message, error) => console.error(`[ERROR] ${message}`, error),
};

// Helper function to format course data
const formatCourseData = (course) => {
  // Convert Map to object for attendance sessions
  const attendanceSessions = {};
  if (course.attendance && course.attendance.sessions) {
    for (const [key, value] of course.attendance.sessions.entries()) {
      attendanceSessions[key] = value;
    }
  }

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
    attendance: {
      sessions: attendanceSessions,
    },
  };
};

const getTeacherCourses = async function (req, res) {
  try {
    logger.info(`Fetching courses for teacher with user ID: ${req.user.id}`);

    // Find teacher using the user ID from token
    const teacher = await Teacher.findOne({ user: req.user.id }).populate({
      path: "user",
      select: "name email role", // Get basic user info
    });

    if (!teacher) {
      logger.error(`Teacher not found for user ID: ${req.user.id}`);
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

    // Get courses with title and semester info
    const courses = await Course.find({ teacher: teacher._id })
      .select("_id title aboutCourse")
      .populate("semester", "name startDate endDate") // Include semester details
      .sort({ createdAt: -1 });

    logger.info(`Found ${courses.length} courses for teacher: ${teacher._id}`);

    // Return teacher overview with students and course basic info
    res.json({
      teacher: {
        _id: teacher._id,
        name: teacher.user?.name,
        email: teacher.email,
        totalStudents: teacher.students?.length || 0,
        totalCourses: courses.length || 0,
      },
      courses: courses.map((course) => ({
        _id: course._id,
        title: course.title,
        aboutCourse: course.aboutCourse,
        semester: course.semester
          ? {
              _id: course.semester._id,
              name: course.semester.name,
              startDate: course.semester.startDate,
              endDate: course.semester.endDate,
            }
          : null,
      })),
    });
  } catch (error) {
    logger.error("Error in getTeacherCourses:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get specific course by ID
const getCourseById = async function (req, res) {
  try {
    logger.info(
      `Fetching course ID: ${req.params.courseId} for user: ${req.user.id}`
    );

    // Find teacher with user ID and populate basic user info
    const teacher = await Teacher.findOne({ user: req.user.id }).populate({
      path: "user",
      select: "name email role", // Get basic user info
    });

    if (!teacher) {
      logger.error(`Teacher not found for user ID: ${req.user.id}`);
      return res.status(404).json({ error: "Teacher not found" });
    }

    // Populate teacher's students
    await teacher.populate({
      path: "students", // Virtual field defined in teacherSchema
      populate: {
        path: "user",
        select: "name email", // Include basic user details for students
      },
    });

    // Find the course
    const course = await Course.findOne({
      _id: req.params.courseId,
      teacher: teacher._id,
    })
      .populate("semester")
      .populate("outcomes")
      .populate("schedule")
      .populate("syllabus")
      .populate("weeklyPlan")
      .populate("creditPoints")
      .populate("attendance");

    if (!course) {
      logger.error(`Course not found with ID: ${req.params.courseId}`);
      return res.status(404).json({ error: "Course not found" });
    }

    logger.info(`Found course: ${course.title}`);

    // Format the course data
    const formattedCourse = formatCourseData(course);

    // Format students data to match initialCourseData format
    const students =
      teacher.students?.map((student, index) => ({
        id: student._id.toString(),
        rollNo: `CS${String(index + 101).padStart(3, "0")}`, // Generate roll numbers
        name: student.user?.name || "Unknown",
        program: "Computer Science", // Default program
        email: student.user?.email || "",
      })) || [];

    // Structure the response to match initialCourseData format
    const response = {
      _id: formattedCourse._id,
      title: formattedCourse.title,
      aboutCourse: formattedCourse.aboutCourse,
      semester: formattedCourse.semester,
      teacher: {
        _id: teacher._id,
        name: teacher.user?.name,
        email: teacher.email,
        totalStudents: students.length,
      },
      creditPoints: formattedCourse.creditPoints,
      learningOutcomes: formattedCourse.learningOutcomes,
      weeklyPlan: formattedCourse.weeklyPlan,
      syllabus: formattedCourse.syllabus,
      courseSchedule: formattedCourse.courseSchedule,
      attendance: formattedCourse.attendance,
      students: students,
      lectures: formattedCourse.lectures,
    };

    res.json(response);
  } catch (error) {
    logger.error("Error in getCourseById:", error);
    res.status(500).json({ error: error.message });
  }
};

// Create new course
const createCourse = async function (req, res) {
  logger.info("Starting createCourse controller function");

  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    logger.info("Attempting to start transaction");
    await session.startTransaction();
    transactionStarted = true;
    logger.info("Transaction started successfully");

    // Find teacher using the logged-in user ID
    logger.info(`Looking for teacher with user ID: ${req.user.id}`);
    const teacher = await Teacher.findOne({ user: req.user.id }).session(
      session
    );

    if (!teacher) {
      logger.error(`Teacher not found for user ID: ${req.user.id}`);
      throw new Error("Teacher not found");
    }
    logger.info(`Found teacher: ${teacher._id}`);

    // Create main course
    logger.info(`Creating main course with title: ${req.body.title}`);
    const course = new Course({
      title: req.body.title,
      aboutCourse: req.body.aboutCourse,
      semester: req.body.semester,
      teacher: teacher._id,
      lectures: req.body.lectures || [],
    });
    await course.save({ session });
    logger.info(`Main course created with ID: ${course._id}`);

    // Create learning outcomes
    if (req.body.learningOutcomes && req.body.learningOutcomes.length > 0) {
      logger.info("Creating learning outcomes");
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
      logger.info(`Learning outcomes created with ID: ${outcome[0]._id}`);
    }

    // Create course schedule
    if (req.body.courseSchedule) {
      logger.info("Creating course schedule");
      const scheduleData = {
        ...req.body.courseSchedule,
        course: course._id,
      };
      const schedule = await CourseSchedule.create([scheduleData], { session });
      course.schedule = schedule[0]._id;
      logger.info(`Course schedule created with ID: ${schedule[0]._id}`);
    }

    // Create syllabus
    if (req.body.syllabus && req.body.syllabus.length > 0) {
      logger.info("Creating course syllabus");
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
      logger.info(`Course syllabus created with ID: ${syllabus[0]._id}`);
    }

    // Create weekly plan
    if (req.body.weeklyPlan && req.body.weeklyPlan.length > 0) {
      logger.info("Creating weekly plan");
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
      logger.info(`Weekly plan created with ID: ${weeklyPlan[0]._id}`);
    }

    // Create credit points
    if (req.body.creditPoints) {
      logger.info("Creating credit points");
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
      logger.info(`Credit points created with ID: ${creditPoints[0]._id}`);
    }

    // Create attendance if provided
    if (req.body.attendance && req.body.attendance.sessions) {
      logger.info("Creating course attendance");
      // Convert object to Map for MongoDB
      const sessionsMap = new Map(Object.entries(req.body.attendance.sessions));
      const attendance = await CourseAttendance.create(
        [
          {
            sessions: sessionsMap,
            course: course._id,
          },
        ],
        { session }
      );
      course.attendance = attendance[0]._id;
      logger.info(`Course attendance created with ID: ${attendance[0]._id}`);
    }

    // Save updated course with all references
    logger.info("Saving updated course with all references");
    await course.save({ session });

    // Add course to teacher's courses array
    logger.info("Adding course to teacher's courses array");
    teacher.courses.push(course._id);
    await teacher.save({ session });

    // Find all students under this teacher and add the course to their courses array
    logger.info(`Finding students for teacher: ${teacher._id}`);
    const students = await Student.find({ teacher: teacher._id }).session(
      session
    );
    logger.info(`Found ${students.length} students for this teacher`);

    // Add course ID to all students' courses arrays
    if (students && students.length > 0) {
      logger.info("Adding course to students' course arrays");
      const updatePromises = students.map((student) => {
        // Check if the course is already in the student's courses array
        if (!student.courses.includes(course._id)) {
          student.courses.push(course._id);
          return student.save({ session });
        }
        return Promise.resolve(); // No update needed
      });

      await Promise.all(updatePromises);
      logger.info("All students updated successfully");
    }

    logger.info("Committing transaction");
    await session.commitTransaction();
    transactionStarted = false;
    logger.info("Transaction committed successfully");

    // Get the fully populated course
    logger.info("Fetching fully populated course");
    const createdCourse = await Course.findById(course._id)
      .populate("semester")
      .populate("outcomes")
      .populate("schedule")
      .populate("syllabus")
      .populate("weeklyPlan")
      .populate("creditPoints")
      .populate("attendance");

    const formattedCourse = formatCourseData(createdCourse);
    logger.info("Sending response with formatted course data");
    res.status(201).json(formattedCourse);
  } catch (error) {
    logger.error("Error in createCourse:", error);

    if (transactionStarted) {
      try {
        logger.info("Aborting transaction due to error");
        await session.abortTransaction();
        logger.info("Transaction aborted successfully");
      } catch (abortError) {
        logger.error("Error aborting transaction:", abortError);
      }
    }

    res.status(400).json({ error: error.message });
  } finally {
    logger.info("Ending database session");
    await session.endSession();
    logger.info("Session ended");
  }
};

// Update course
const updateCourse = async function (req, res) {
  logger.info(`Updating course ID: ${req.params.courseId}`);

  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;
    logger.info("Transaction started successfully");

    const teacher = await Teacher.findOne({ user: req.user.id }).session(
      session
    );
    if (!teacher) {
      logger.error(`Teacher not found for user ID: ${req.user.id}`);
      throw new Error("Teacher not found");
    }

    const course = await Course.findOne({
      _id: req.params.courseId,
      teacher: teacher._id,
    }).session(session);

    if (!course) {
      logger.error(`Course not found with ID: ${req.params.courseId}`);
      throw new Error("Course not found");
    }

    // Update main course fields
    if (req.body.title) course.title = req.body.title;
    if (req.body.aboutCourse) course.aboutCourse = req.body.aboutCourse;
    if (req.body.semester) course.semester = req.body.semester;
    if (req.body.lectures) course.lectures = req.body.lectures;

    await course.save({ session });
    logger.info("Updated main course fields");

    // Update learning outcomes
    if (req.body.learningOutcomes) {
      if (course.outcomes) {
        await CourseOutcome.findByIdAndUpdate(
          course.outcomes,
          { outcomes: req.body.learningOutcomes },
          { session }
        );
        logger.info(`Updated existing learning outcomes: ${course.outcomes}`);
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
        logger.info(`Created new learning outcomes: ${outcome[0]._id}`);
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
        logger.info(`Updated existing schedule: ${course.schedule}`);
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
        logger.info(`Created new schedule: ${schedule[0]._id}`);
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
        logger.info(`Updated existing syllabus: ${course.syllabus}`);
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
        logger.info(`Created new syllabus: ${syllabus[0]._id}`);
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
        logger.info(`Updated existing weekly plan: ${course.weeklyPlan}`);
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
        logger.info(`Created new weekly plan: ${weeklyPlan[0]._id}`);
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
        logger.info(`Updated existing credit points: ${course.creditPoints}`);
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
        logger.info(`Created new credit points: ${creditPoints[0]._id}`);
      }
    }

    // Update attendance
    if (req.body.attendance && req.body.attendance.sessions) {
      // Convert object to Map for MongoDB
      const sessionsMap = new Map(Object.entries(req.body.attendance.sessions));

      if (course.attendance) {
        await CourseAttendance.findByIdAndUpdate(
          course.attendance,
          { sessions: sessionsMap },
          { session }
        );
        logger.info(`Updated existing attendance: ${course.attendance}`);
      } else {
        const attendance = await CourseAttendance.create(
          [
            {
              sessions: sessionsMap,
              course: course._id,
            },
          ],
          { session }
        );
        course.attendance = attendance[0]._id;
        await course.save({ session });
        logger.info(`Created new attendance: ${attendance[0]._id}`);
      }
    }

    logger.info("Committing transaction");
    await session.commitTransaction();
    transactionStarted = false;
    logger.info("Transaction committed successfully");

    // Get updated course with all populated fields
    const updatedCourse = await Course.findById(course._id)
      .populate("semester")
      .populate("outcomes")
      .populate("schedule")
      .populate("syllabus")
      .populate("weeklyPlan")
      .populate("creditPoints")
      .populate("attendance");

    const formattedCourse = formatCourseData(updatedCourse);
    res.json(formattedCourse);
  } catch (error) {
    logger.error("Error in updateCourse:", error);

    if (transactionStarted) {
      try {
        await session.abortTransaction();
        logger.info("Transaction aborted successfully");
      } catch (abortError) {
        logger.error("Error aborting transaction:", abortError);
      }
    }
    res.status(400).json({ error: error.message });
  } finally {
    await session.endSession();
    logger.info("Session ended");
  }
};

// Delete course and all related data
const deleteCourse = async function (req, res) {
  logger.info(`Deleting course ID: ${req.params.courseId}`);

  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;
    logger.info("Transaction started successfully");

    const teacher = await Teacher.findOne({ user: req.user.id }).session(
      session
    );
    if (!teacher) {
      logger.error(`Teacher not found for user ID: ${req.user.id}`);
      throw new Error("Teacher not found");
    }

    const course = await Course.findOne({
      _id: req.params.courseId,
      teacher: teacher._id,
    }).session(session);

    if (!course) {
      logger.error(`Course not found with ID: ${req.params.courseId}`);
      throw new Error("Course not found");
    }

    // Delete all related documents
    if (course.outcomes) {
      await CourseOutcome.findByIdAndDelete(course.outcomes, { session });
      logger.info(`Deleted course outcomes: ${course.outcomes}`);
    }

    if (course.schedule) {
      await CourseSchedule.findByIdAndDelete(course.schedule, { session });
      logger.info(`Deleted course schedule: ${course.schedule}`);
    }

    if (course.syllabus) {
      await CourseSyllabus.findByIdAndDelete(course.syllabus, { session });
      logger.info(`Deleted course syllabus: ${course.syllabus}`);
    }

    if (course.weeklyPlan) {
      await WeeklyPlan.findByIdAndDelete(course.weeklyPlan, { session });
      logger.info(`Deleted weekly plan: ${course.weeklyPlan}`);
    }

    if (course.creditPoints) {
      await CreditPoints.findByIdAndDelete(course.creditPoints, { session });
      logger.info(`Deleted credit points: ${course.creditPoints}`);
    }

    if (course.attendance) {
      await CourseAttendance.findByIdAndDelete(course.attendance, { session });
      logger.info(`Deleted course attendance: ${course.attendance}`);
    }

    // Remove course from teacher's courses
    teacher.courses = teacher.courses.filter((id) => !id.equals(course._id));
    await teacher.save({ session });
    logger.info(`Removed course from teacher's courses list`);

    // Update students who have this course
    const students = await Student.find({
      courses: course._id,
    }).session(session);

    if (students && students.length > 0) {
      logger.info(
        `Removing course from ${students.length} students' course lists`
      );
      const updatePromises = students.map((student) => {
        student.courses = student.courses.filter(
          (id) => !id.equals(course._id)
        );
        return student.save({ session });
      });

      await Promise.all(updatePromises);
      logger.info(`Successfully removed course from all students' lists`);
    }

    // Delete the course
    await Course.findByIdAndDelete(course._id, { session });
    logger.info(`Deleted course: ${course._id}`);

    logger.info("Committing transaction");
    await session.commitTransaction();
    transactionStarted = false;
    logger.info("Transaction committed successfully");

    res.json({ message: "Course deleted successfully" });
  } catch (error) {
    logger.error("Error in deleteCourse:", error);

    if (transactionStarted) {
      try {
        await session.abortTransaction();
        logger.info("Transaction aborted successfully");
      } catch (abortError) {
        logger.error("Error aborting transaction:", abortError);
      }
    }
    res.status(400).json({ error: error.message });
  } finally {
    await session.endSession();
    logger.info("Session ended");
  }
};

// Update attendance only
const updateCourseAttendance = async function (req, res) {
  logger.info(`Updating attendance for course ID: ${req.params.courseId}`);

  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;
    logger.info("Transaction started successfully");

    const teacher = await Teacher.findOne({ user: req.user.id }).session(
      session
    );
    if (!teacher) {
      logger.error(`Teacher not found for user ID: ${req.user.id}`);
      throw new Error("Teacher not found");
    }

    const course = await Course.findOne({
      _id: req.params.courseId,
      teacher: teacher._id,
    }).session(session);

    if (!course) {
      logger.error(`Course not found with ID: ${req.params.courseId}`);
      throw new Error("Course not found");
    }

    if (req.body.sessions) {
      // Convert object to Map for MongoDB
      const sessionsMap = new Map(Object.entries(req.body.sessions));

      if (course.attendance) {
        await CourseAttendance.findByIdAndUpdate(
          course.attendance,
          { sessions: sessionsMap },
          { session }
        );
        logger.info(`Updated existing attendance: ${course.attendance}`);
      } else {
        const attendance = await CourseAttendance.create(
          [
            {
              sessions: sessionsMap,
              course: course._id,
            },
          ],
          { session }
        );
        course.attendance = attendance[0]._id;
        await course.save({ session });
        logger.info(`Created new attendance: ${attendance[0]._id}`);
      }
    }

    logger.info("Committing transaction");
    await session.commitTransaction();
    transactionStarted = false;
    logger.info("Transaction committed successfully");

    // Get updated course attendance
    const updatedCourse = await Course.findById(course._id).populate(
      "attendance"
    );

    // Format attendance for response
    const attendanceSessions = {};
    if (updatedCourse.attendance && updatedCourse.attendance.sessions) {
      for (const [key, value] of updatedCourse.attendance.sessions.entries()) {
        attendanceSessions[key] = value;
      }
    }

    res.json({
      _id: updatedCourse._id,
      attendance: {
        sessions: attendanceSessions,
      },
    });
  } catch (error) {
    logger.error("Error in updateCourseAttendance:", error);

    if (transactionStarted) {
      try {
        await session.abortTransaction();
        logger.info("Transaction aborted successfully");
      } catch (abortError) {
        logger.error("Error aborting transaction:", abortError);
      }
    }
    res.status(400).json({ error: error.message });
  } finally {
    await session.endSession();
    logger.info("Session ended");
  }
};

module.exports = {
  getTeacherCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  updateCourseAttendance,
};
