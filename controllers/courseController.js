const Course = require("../models/Course");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const Lecture = require("../models/Lecture");
const CourseOutcome = require("../models/CourseOutcome");
const CourseSchedule = require("../models/CourseSchedule");
const CourseSyllabus = require("../models/CourseSyllabus");
const WeeklyPlan = require("../models/WeeklyPlan");
const CreditPoints = require("../models/CreditPoints");
const Assignment = require("../models/Assignment");
const CourseAttendance = require("../models/CourseAttendance");
const mongoose = require("mongoose");
const AWS = require("aws-sdk");

// Better logging setup
const logger = {
  info: (message) => console.log(`[INFO] ${message}`),
  error: (message, error) => console.error(`[ERROR] ${message}`, error),
};

// Configure AWS SDK
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// Upload file to S3
const uploadFileToS3 = async (file, path) => {
  console.log("Uploading file to S3");
  return new Promise((resolve, reject) => {
    const fileContent = file.data;
    if (!fileContent) {
      console.log("No file content found");
      return reject(new Error("No file content found"));
    }

    const fileName = `${path}/${Date.now()}-${file.name.replace(/\s+/g, "-")}`;

    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileName,
      Body: fileContent,
      ContentType: file.mimetype,
    };

    console.log("S3 upload params prepared");

    s3.upload(params, (err, data) => {
      if (err) {
        console.log("S3 upload error:", err);
        return reject(err);
      }
      console.log("File uploaded successfully:", fileName);
      resolve({
        url: data.Location,
        key: data.Key,
      });
    });
  });
};

// Delete file from S3
const deleteFileFromS3 = async (key) => {
  console.log("Deleting file from S3:", key);
  return new Promise((resolve, reject) => {
    if (!key) {
      console.log("No file key provided");
      return resolve({ message: "No file key provided" });
    }

    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
    };

    s3.deleteObject(params, (err, data) => {
      if (err) {
        console.log("S3 delete error:", err);
        return reject(err);
      }
      console.log("File deleted successfully from S3");
      resolve(data);
    });
  });
};

// Enhanced helper function to format course data with module-based lectures
const formatCourseData = async (course) => {
  // Convert Map to object for attendance sessions
  const attendanceSessions = {};
  if (course.attendance && course.attendance.sessions) {
    for (const [key, value] of course.attendance.sessions.entries()) {
      attendanceSessions[key] = value;
    }
  }

  // Get lectures organized by modules
  let modulesWithLectures = [];
  if (course.syllabus && course.syllabus.modules) {
    // Get all lectures for this course
    const allLectures = await Lecture.find({
      course: course._id,
      isActive: true,
    }).sort({ moduleNumber: 1, lectureOrder: 1 });

    // Check for lectures that have passed their review deadline
    const now = new Date();
    const updatePromises = allLectures.map(async (lecture) => {
      if (
        !lecture.isReviewed &&
        lecture.reviewDeadline &&
        now >= lecture.reviewDeadline
      ) {
        lecture.isReviewed = true;
        await lecture.save();
      }
      return lecture;
    });

    const updatedLectures = await Promise.all(updatePromises);

    // Organize lectures by modules with enhanced structure
    modulesWithLectures = course.syllabus.modules
      .map((module) => {
        const moduleLectures = updatedLectures.filter(
          (lecture) =>
            lecture.syllabusModule.toString() === module._id.toString()
        );

        // Calculate module completion status
        const totalLectures = moduleLectures.length;
        const reviewedLectures = moduleLectures.filter(
          (lecture) => lecture.isReviewed
        ).length;
        const completionPercentage =
          totalLectures > 0
            ? Math.round((reviewedLectures / totalLectures) * 100)
            : 0;

        return {
          _id: module._id,
          moduleNumber: module.moduleNumber,
          moduleTitle: module.moduleTitle,
          description: module.description,
          topics: module.topics,
          isActive: module.isActive,
          lectures: moduleLectures.map((lecture) => ({
            _id: lecture._id,
            title: lecture.title,
            content: lecture.content,
            videoUrl: lecture.videoUrl,
            lectureOrder: lecture.lectureOrder,
            isReviewed: lecture.isReviewed,
            reviewDeadline: lecture.reviewDeadline,
            createdAt: lecture.createdAt,
            updatedAt: lecture.updatedAt,
          })),
          lectureCount: moduleLectures.length,
          reviewedLectureCount: reviewedLectures,
          completionPercentage: completionPercentage,
          hasLectures: moduleLectures.length > 0,
        };
      })
      .sort((a, b) => a.moduleNumber - b.moduleNumber); // Sort modules by number
  }

  // Calculate total lecture count and overall completion
  const totalLectureCount = modulesWithLectures.reduce(
    (total, module) => total + module.lectureCount,
    0
  );

  const totalReviewedCount = modulesWithLectures.reduce(
    (total, module) => total + module.reviewedLectureCount,
    0
  );

  const overallCompletion =
    totalLectureCount > 0
      ? Math.round((totalReviewedCount / totalLectureCount) * 100)
      : 0;

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
          _id: module._id,
          moduleNumber: module.moduleNumber,
          moduleTitle: module.moduleTitle,
          description: module.description,
          topics: module.topics,
          isActive: module.isActive,
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
    modules: modulesWithLectures,
    totalLectureCount,
    totalReviewedCount,
    overallCompletion,
    attendance: {
      sessions: attendanceSessions,
    },
  };
};

// Get specific course by ID with module-wise lectures
const getCourseById = async function (req, res) {
  try {
    logger.info(
      `Fetching course ID: ${req.params.courseId} for user: ${req.user.id}`
    );

    // Determine if the user is a teacher or student
    const userRole = req.user.role;
    let course,
      students = [];

    // Find the course
    const courseQuery = Course.findById(req.params.courseId)
      .populate("semester")
      .populate("outcomes")
      .populate("schedule")
      .populate("syllabus")
      .populate("weeklyPlan")
      .populate("creditPoints")
      .populate("attendance");

    // Execute the query
    course = await courseQuery.exec();

    if (!course) {
      logger.error(`Course not found with ID: ${req.params.courseId}`);
      return res.status(404).json({ error: "Course not found" });
    }

    // Check if user has access to this course
    let hasAccess = false;
    let userDetails = null;

    if (userRole === "teacher") {
      // For teacher: check if they're the course teacher
      const teacher = await Teacher.findOne({
        user: req.user.id,
        _id: course.teacher,
      }).populate({
        path: "user",
        select: "name email role",
      });

      if (teacher) {
        hasAccess = true;
        userDetails = {
          id: teacher._id,
          name: teacher.user?.name,
          email: teacher.email,
        };

        // Get students for this course
        await teacher.populate({
          path: "students",
          populate: {
            path: "user",
            select: "name email",
          },
        });

        students =
          teacher.students?.map((student, index) => ({
            id: student._id.toString(),
            rollNo: `CS${String(index + 101).padStart(3, "0")}`,
            name: student.user?.name || "Unknown",
            program: "Computer Science",
            email: student.user?.email || "",
          })) || [];
      }
    } else if (userRole === "student") {
      // For student: check if they're enrolled in the course
      const student = await Student.findOne({ user: req.user.id }).populate({
        path: "user",
        select: "name email role",
      });

      if (student) {
        // Check if student is enrolled in this course
        const isEnrolled = student.courses.some(
          (id) => id.toString() === req.params.courseId
        );

        if (isEnrolled) {
          hasAccess = true;
          userDetails = {
            id: student._id,
            name: student.user?.name,
            email: student.user?.email,
          };
        }
      }
    }

    if (!hasAccess) {
      logger.error(
        `User ${req.user.id} does not have access to course ${req.params.courseId}`
      );
      return res
        .status(403)
        .json({ error: "You don't have access to this course" });
    }

    logger.info(`Found course: ${course.title}`);

    // Format the course data with module-based lectures
    const formattedCourse = await formatCourseData(course);

    // Structure the response
    const response = {
      id: formattedCourse._id,
      title: formattedCourse.title,
      aboutCourse: formattedCourse.aboutCourse,
      semester: formattedCourse.semester,
      creditPoints: formattedCourse.creditPoints,
      learningOutcomes: formattedCourse.learningOutcomes,
      weeklyPlan: formattedCourse.weeklyPlan,
      syllabus: formattedCourse.syllabus,
      courseSchedule: formattedCourse.courseSchedule,
      modules: formattedCourse.modules,
      totalLectureCount: formattedCourse.totalLectureCount,
      totalReviewedCount: formattedCourse.totalReviewedCount,
      overallCompletion: formattedCourse.overallCompletion,
      attendance: formattedCourse.attendance,
    };

    // Add user-specific data
    if (userRole === "teacher") {
      response.teacher = {
        id: userDetails.id,
        name: userDetails.name,
        email: userDetails.email,
        totalStudents: students.length,
      };
      response.students = students;
    } else if (userRole === "student") {
      response.student = {
        id: userDetails.id,
        name: userDetails.name,
        email: userDetails.email,
      };
      // Include teacher info for students as well
      const courseTeacher = await Teacher.findById(course.teacher).populate(
        "user",
        "name email"
      );
      if (courseTeacher) {
        response.teacher = {
          id: courseTeacher._id,
          name: courseTeacher.user?.name,
          email: courseTeacher.user?.email,
        };
      }
    }

    res.json(response);
  } catch (error) {
    logger.error("Error in getCourseById:", error);
    res.status(500).json({ error: error.message });
  }
};

// New function to get modules with lectures for a specific course
const getCourseModulesWithLectures = async function (req, res) {
  try {
    logger.info(
      `Fetching modules with lectures for course ID: ${req.params.courseId}`
    );

    const { courseId } = req.params;

    // Verify user access to course
    if (req.user.role === "teacher") {
      const teacher = await Teacher.findOne({ user: req.user.id });
      if (!teacher) {
        return res.status(404).json({ error: "Teacher not found" });
      }

      const course = await Course.findOne({
        _id: courseId,
        teacher: teacher._id,
      });

      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }
    } else if (req.user.role === "student") {
      const student = await Student.findOne({ user: req.user.id });
      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      if (!student.courses.includes(courseId)) {
        return res
          .status(403)
          .json({ error: "You are not enrolled in this course" });
      }
    }

    // Get syllabus with modules
    const syllabus = await CourseSyllabus.findOne({ course: courseId });
    if (!syllabus) {
      return res.status(404).json({ error: "Course syllabus not found" });
    }

    // Get all lectures for this course
    const lectures = await Lecture.find({
      course: courseId,
      isActive: true,
    }).sort({ moduleNumber: 1, lectureOrder: 1 });

    // Check for lectures that have passed their review deadline
    const now = new Date();
    const updatePromises = lectures.map(async (lecture) => {
      if (
        !lecture.isReviewed &&
        lecture.reviewDeadline &&
        now >= lecture.reviewDeadline
      ) {
        lecture.isReviewed = true;
        await lecture.save();
      }
      return lecture;
    });

    await Promise.all(updatePromises);

    // Organize lectures by modules
    const modulesWithLectures = syllabus.modules
      .map((module) => {
        const moduleLectures = lectures.filter(
          (lecture) =>
            lecture.syllabusModule.toString() === module._id.toString()
        );

        const totalLectures = moduleLectures.length;
        const reviewedLectures = moduleLectures.filter(
          (lecture) => lecture.isReviewed
        ).length;
        const completionPercentage =
          totalLectures > 0
            ? Math.round((reviewedLectures / totalLectures) * 100)
            : 0;

        return {
          _id: module._id,
          moduleNumber: module.moduleNumber,
          moduleTitle: module.moduleTitle,
          description: module.description,
          topics: module.topics,
          isActive: module.isActive,
          lectures: moduleLectures,
          lectureCount: moduleLectures.length,
          reviewedLectureCount: reviewedLectures,
          completionPercentage: completionPercentage,
          hasLectures: moduleLectures.length > 0,
        };
      })
      .sort((a, b) => a.moduleNumber - b.moduleNumber);

    res.json({
      success: true,
      courseId,
      modules: modulesWithLectures,
    });
  } catch (error) {
    logger.error("Error in getCourseModulesWithLectures:", error);
    res.status(500).json({ error: error.message });
  }
};

const getEnrolledCourses = async function (req, res) {
  try {
    logger.info(
      `Fetching enrolled courses for student with ID: ${req.user.id}`
    );

    // Verify user is a student
    if (req.user.role !== "student") {
      logger.error(`User ${req.user.id} is not a student`);
      return res
        .status(403)
        .json({ error: "Access denied. Student role required" });
    }

    // Find the student
    const student = await Student.findOne({ user: req.user.id }).populate({
      path: "user",
      select: "name email role",
    });

    if (!student) {
      logger.error(`Student not found for user ID: ${req.user.id}`);
      return res.status(404).json({ error: "Student not found" });
    }

    // Extract course IDs from the student document
    const courseIds = student.courses || [];

    if (courseIds.length === 0) {
      logger.info(`Student ${student._id} is not enrolled in any courses`);
      return res.json({
        user: {
          _id: student._id,
          name: student.user?.name,
          email: student.user?.email,
          role: "student",
          totalCourses: 0,
        },
        courses: [],
      });
    }

    // Fetch courses using the IDs from student.courses
    const courses = await Course.find({ _id: { $in: courseIds } })
      .select("_id title aboutCourse")
      .populate("semester", "name startDate endDate")
      .sort({ createdAt: -1 });

    // Get lecture counts for each course
    const coursesWithLectureCounts = await Promise.all(
      courses.map(async (course) => {
        const lectureCount = await Lecture.countDocuments({
          course: course._id,
          isActive: true,
        });

        return {
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
          lectureCount,
        };
      })
    );

    logger.info(
      `Found ${courses.length} enrolled courses for student: ${student._id}`
    );

    res.json({
      user: {
        _id: student._id,
        name: student.user?.name,
        email: student.user?.email,
        role: "student",
        totalCourses: courses.length || 0,
      },
      courses: coursesWithLectureCounts,
    });
  } catch (error) {
    logger.error("Error in getEnrolledCourses:", error);
    res.status(500).json({ error: error.message });
  }
};

const getUserCourses = async function (req, res) {
  try {
    logger.info(`Fetching courses for user with ID: ${req.user.id}`);
    const userRole = req.user.role;

    if (userRole === "teacher") {
      // Fetch teacher data
      const teacher = await Teacher.findOne({ user: req.user.id }).populate({
        path: "user",
        select: "name email role",
      });

      if (!teacher) {
        logger.error(`Teacher not found for user ID: ${req.user.id}`);
        return res.status(404).json({ error: "Teacher not found" });
      }

      // Find courses taught by this teacher
      const courses = await Course.find({ teacher: teacher._id })
        .select(
          "_id title aboutCourse assignments attendance schedule semester"
        )
        .populate(
          "assignments",
          "_id title description dueDate totalPoints isActive submissions"
        )
        .populate("attendance", "sessions")
        .populate(
          "schedule",
          "classStartDate classEndDate midSemesterExamDate endSemesterExamDate classDaysAndTimes"
        )
        .populate("semester", "_id name startDate endDate")
        .sort({ createdAt: -1 });

      logger.info(
        `Found ${courses.length} courses for teacher: ${teacher._id}`
      );

      const coursesWithAdditionalData = await Promise.all(
        courses.map(async (course) => {
          // Get lecture count for this course
          const lectureCount = await Lecture.countDocuments({
            course: course._id,
            isActive: true,
          });

          return {
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
            schedule: course.schedule
              ? {
                  _id: course.schedule._id,
                  classStartDate: course.schedule.classStartDate,
                  classEndDate: course.schedule.classEndDate,
                  midSemesterExamDate: course.schedule.midSemesterExamDate,
                  endSemesterExamDate: course.schedule.endSemesterExamDate,
                  classDaysAndTimes: course.schedule.classDaysAndTimes || [],
                }
              : null,
            assignmentCount: course.assignments.length,
            lectureCount,
            assignments: course.assignments.map((assignment) => ({
              _id: assignment._id,
              title: assignment.title,
              description: assignment.description,
              dueDate: assignment.dueDate,
              totalPoints: assignment.totalPoints,
              isActive: assignment.isActive,
              submissions: assignment.submissions.map((submission) => ({
                _id: submission._id,
                student: submission.student,
                submissionDate: submission.submissionDate,
                submissionFile: submission.submissionFile,
                grade: submission.grade,
                feedback: submission.feedback,
                status: submission.status,
              })),
            })),
            attendance: course.attendance
              ? Object.fromEntries(course.attendance.sessions)
              : {},
          };
        })
      );

      res.json({
        user: {
          _id: teacher._id,
          name: teacher.user?.name,
          email: teacher.email,
          role: "teacher",
          totalCourses: courses.length || 0,
        },
        courses: coursesWithAdditionalData,
      });
    } else if (userRole === "student") {
      // Fetch student data
      const student = await Student.findOne({ user: req.user.id }).populate({
        path: "user",
        select: "name email role",
      });

      if (!student) {
        logger.error(`Student not found for user ID: ${req.user.id}`);
        return res.status(404).json({ error: "Student not found" });
      }

      // Find courses the student is enrolled in
      const courseIds = student.courses || [];

      if (courseIds.length === 0) {
        return res.json({
          user: {
            _id: student._id,
            name: student.user?.name,
            email: student.user?.email,
            role: "student",
            totalCourses: 0,
          },
          courses: [],
        });
      }

      const courses = await Course.find({ _id: { $in: courseIds } })
        .select(
          "_id title aboutCourse assignments attendance schedule semester"
        )
        .populate(
          "assignments",
          "_id title description dueDate totalPoints isActive submissions"
        )
        .populate({
          path: "assignments.submissions",
          match: { student: student._id },
          select:
            "_id student submissionDate submissionFile grade feedback status",
        })
        .populate("attendance", "sessions")
        .populate(
          "schedule",
          "classStartDate classEndDate midSemesterExamDate endSemesterExamDate classDaysAndTimes"
        )
        .populate("semester", "_id name startDate endDate")
        .sort({ createdAt: -1 });

      logger.info(
        `Found ${courses.length} courses for student: ${student._id}`
      );

      const coursesWithAdditionalData = await Promise.all(
        courses.map(async (course) => {
          // Get lecture count for this course
          const lectureCount = await Lecture.countDocuments({
            course: course._id,
            isActive: true,
          });

          return {
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
            schedule: course.schedule
              ? {
                  _id: course.schedule._id,
                  classStartDate: course.schedule.classStartDate,
                  classEndDate: course.schedule.classEndDate,
                  midSemesterExamDate: course.schedule.midSemesterExamDate,
                  endSemesterExamDate: course.schedule.endSemesterExamDate,
                  classDaysAndTimes: course.schedule.classDaysAndTimes || [],
                }
              : null,
            assignmentCount: course.assignments.length,
            lectureCount,
            assignments: course.assignments.map((assignment) => ({
              _id: assignment._id,
              title: assignment.title,
              description: assignment.description,
              dueDate: assignment.dueDate,
              totalPoints: assignment.totalPoints,
              isActive: assignment.isActive,
              submissions: assignment.submissions.map((submission) => ({
                _id: submission._id,
                student: submission.student,
                submissionDate: submission.submissionDate,
                submissionFile: submission.submissionFile,
                grade: submission.grade,
                feedback: submission.feedback,
                status: submission.status,
              })),
            })),
            attendance: course.attendance
              ? Object.fromEntries(course.attendance.sessions)
              : {},
          };
        })
      );

      res.json({
        user: {
          _id: student._id,
          name: student.user?.name,
          email: student.user?.email,
          role: "student",
          totalCourses: courses.length || 0,
        },
        courses: coursesWithAdditionalData,
      });
    } else {
      return res.status(403).json({ error: "Invalid user role" });
    }
  } catch (error) {
    logger.error("Error in getUserCourses:", error);
    res.status(500).json({ error: error.message });
  }
};

// Create new course (keeping existing logic, removing old lecture handling)
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
    const teacher = await Teacher.findOne({ user: req.user.id }).session(
      session
    );

    if (!teacher) {
      logger.error(`Teacher not found for user ID: ${req.user.id}`);
      throw new Error("Teacher not found");
    }

    // Create main course (remove old lecture handling)
    const courseData = {
      title: req.body.title,
      aboutCourse: req.body.aboutCourse,
      semester: req.body.semester,
      teacher: teacher._id,
    };

    const course = new Course(courseData);
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
            modules: req.body.syllabus.map((module, index) => ({
              ...module,
              order: index + 1,
              lectures: [], // Initialize empty lectures array
            })),
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

    // Add course ID to all students' courses arrays
    if (students && students.length > 0) {
      logger.info("Adding course to students' course arrays");
      const updatePromises = students.map((student) => {
        if (!student.courses.includes(course._id)) {
          student.courses.push(course._id);
          return student.save({ session });
        }
        return Promise.resolve();
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
    const courseQuery = Course.findById(course._id)
      .populate("semester")
      .populate("outcomes")
      .populate("schedule")
      .populate("syllabus")
      .populate("weeklyPlan")
      .populate("creditPoints")
      .populate("attendance");

    const createdCourse = await courseQuery.exec();
    const formattedCourse = await formatCourseData(createdCourse);

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

// Update course (keeping existing logic, removing old lecture handling)
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

    // Update main course fields (remove lecture handling)
    if (req.body.title) course.title = req.body.title;
    if (req.body.aboutCourse) course.aboutCourse = req.body.aboutCourse;
    if (req.body.semester) course.semester = req.body.semester;

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
          {
            modules: req.body.syllabus.map((module, index) => ({
              ...module,
              order: index + 1,
              lectures: module.lectures || [], // Preserve existing lectures
            })),
          },
          { session }
        );
        logger.info(`Updated existing syllabus: ${course.syllabus}`);
      } else {
        const syllabus = await CourseSyllabus.create(
          [
            {
              modules: req.body.syllabus.map((module, index) => ({
                ...module,
                order: index + 1,
                lectures: [], // Initialize empty lectures array
              })),
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
    const courseQuery = Course.findById(course._id)
      .populate("semester")
      .populate("outcomes")
      .populate("schedule")
      .populate("syllabus")
      .populate("weeklyPlan")
      .populate("creditPoints")
      .populate("attendance");

    const updatedCourse = await courseQuery.exec();
    const formattedCourse = await formatCourseData(updatedCourse);
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

    // Delete all lectures for this course
    const lectures = await Lecture.find({ course: course._id }).session(
      session
    );
    for (const lecture of lectures) {
      if (lecture.videoKey) {
        try {
          await deleteFileFromS3(lecture.videoKey);
          logger.info(`Deleted video from S3: ${lecture.videoKey}`);
        } catch (deleteError) {
          logger.error("Error deleting video file:", deleteError);
        }
      }
    }

    await Lecture.deleteMany({ course: course._id }, { session });
    logger.info(`Deleted all lectures for course: ${course._id}`);

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

// Update attendance only (keeping existing logic)
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
  getUserCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  updateCourseAttendance,
  getEnrolledCourses,
  getCourseModulesWithLectures,
};
