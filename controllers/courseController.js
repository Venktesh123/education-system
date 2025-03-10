const Course = require("../models/Course");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const Lecture = require("../models/Lecture");
const CourseOutcome = require("../models/CourseOutcome");
const CourseSchedule = require("../models/CourseSchedule");
const CourseSyllabus = require("../models/CourseSyllabus");
const WeeklyPlan = require("../models/WeeklyPlan");
const CreditPoints = require("../models/CreditPoints");
const CourseAttendance = require("../models/CourseAttendance");
const mongoose = require("mongoose");
const AWS = require("aws-sdk");

// Better logging setup - replace with your preferred logging library
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
    // Make sure we have the file data in the right format for S3
    const fileContent = file.data;
    if (!fileContent) {
      console.log("No file content found");
      return reject(new Error("No file content found"));
    }

    // Generate a unique filename
    const fileName = `${path}/${Date.now()}-${file.name.replace(/\s+/g, "-")}`;

    // Set up the S3 upload parameters
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileName,
      Body: fileContent,
      ContentType: file.mimetype,
    };

    console.log("S3 upload params prepared");

    // Upload to S3
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

// Helper function to format course data
const formatCourseData = (course) => {
  // Convert Map to object for attendance sessions
  const attendanceSessions = {};
  if (course.attendance && course.attendance.sessions) {
    for (const [key, value] of course.attendance.sessions.entries()) {
      attendanceSessions[key] = value;
    }
  }

  // Handle both embedded and referenced lectures
  let lectures = [];

  if (course.lectures) {
    if (Array.isArray(course.lectures)) {
      lectures = course.lectures.map((lecture) => {
        // For embedded lectures
        if (lecture && typeof lecture === "object" && !lecture._id) {
          return {
            title: lecture.title,
            recordingUrl: lecture.recordingUrl,
            date: lecture.date,
            duration: lecture.duration,
          };
        }
        // For referenced lectures
        else if (lecture && typeof lecture === "object" && lecture._id) {
          return {
            _id: lecture._id,
            title: lecture.title,
            content: lecture.content,
            videoUrl: lecture.videoUrl,
            isReviewed: lecture.isReviewed,
            reviewDeadline: lecture.reviewDeadline,
            createdAt: lecture.createdAt,
            updatedAt: lecture.updatedAt,
          };
        }
        // If lectures are just IDs
        return lecture;
      });
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
    lectures: lectures,
    attendance: {
      sessions: attendanceSessions,
    },
  };
};

const getUserCourses = async function (req, res) {
  try {
    logger.info(`Fetching courses for user with ID: ${req.user.id}`);
    const userRole = req.user.role;

    if (userRole === "teacher") {
      // Existing teacher logic
      const teacher = await Teacher.findOne({ user: req.user.id }).populate({
        path: "user",
        select: "name email role",
      });

      if (!teacher) {
        logger.error(`Teacher not found for user ID: ${req.user.id}`);
        return res.status(404).json({ error: "Teacher not found" });
      }

      await teacher.populate({
        path: "students",
        populate: {
          path: "user",
          select: "name email",
        },
      });

      const courses = await Course.find({ teacher: teacher._id })
        .select("_id title aboutCourse")
        .populate("semester", "name startDate endDate")
        .sort({ createdAt: -1 });

      logger.info(
        `Found ${courses.length} courses for teacher: ${teacher._id}`
      );

      res.json({
        user: {
          _id: teacher._id,
          name: teacher.user?.name,
          email: teacher.email,
          role: "teacher",
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
    } else if (userRole === "student") {
      // Student logic - find enrolled courses
      const student = await Student.findOne({ user: req.user.id }).populate({
        path: "user",
        select: "name email role",
      });

      if (!student) {
        logger.error(`Student not found for user ID: ${req.user.id}`);
        return res.status(404).json({ error: "Student not found" });
      }

      // This depends on your data model - you might need to:
      // 1. Check an enrollments collection
      // 2. Check which courses have this student in their students array
      // 3. Or have a courses field on the student model

      // For this example, I'll assume a virtual 'enrolledCourses'
      await student.populate({
        path: "enrolledCourses",
        select: "_id title aboutCourse",
        populate: {
          path: "semester",
          select: "name startDate endDate",
        },
      });

      const courses = student.enrolledCourses || [];

      logger.info(
        `Found ${courses.length} courses for student: ${student._id}`
      );

      res.json({
        user: {
          _id: student._id,
          name: student.user?.name,
          email: student.user?.email,
          role: "student",
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
    } else {
      return res.status(403).json({ error: "Invalid user role" });
    }
  } catch (error) {
    logger.error("Error in getUserCourses:", error);
    res.status(500).json({ error: error.message });
  }
};
// Get specific course by ID
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
          _id: teacher._id,
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
            _id: student._id.toString(),
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
        // This depends on your data model - you might need to check an enrollments collection
        // or check if the student is in the course's students array
        const isEnrolled = true; // Replace with actual enrollment check

        if (isEnrolled) {
          hasAccess = true;
          userDetails = {
            _id: student._id,
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

    // Check if lectures are referenced (ObjectIds) instead of embedded
    const hasReferencedLectures =
      course.lectures &&
      course.lectures.length > 0 &&
      typeof course.lectures[0] !== "object";

    // Populate lectures if they are references
    if (hasReferencedLectures) {
      await course.populate("lectures");
    }

    logger.info(`Found course: ${course.title}`);

    // Format the course data
    const formattedCourse = formatCourseData(course);

    // Structure the response
    const response = {
      _id: formattedCourse._id,
      title: formattedCourse.title,
      aboutCourse: formattedCourse.aboutCourse,
      semester: formattedCourse.semester,
      creditPoints: formattedCourse.creditPoints,
      learningOutcomes: formattedCourse.learningOutcomes,
      weeklyPlan: formattedCourse.weeklyPlan,
      syllabus: formattedCourse.syllabus,
      courseSchedule: formattedCourse.courseSchedule,
      attendance: formattedCourse.attendance,
      lectures: formattedCourse.lectures,
    };

    // Add user-specific data
    if (userRole === "teacher") {
      response.teacher = {
        _id: userDetails._id,
        name: userDetails.name,
        email: userDetails.email,
        totalStudents: students.length,
      };
      response.students = students;
    } else if (userRole === "student") {
      response.student = {
        _id: userDetails._id,
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
          _id: courseTeacher._id,
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
    const teacher = await Teacher.findOne({ user: req.user.id }).session(
      session
    );

    if (!teacher) {
      logger.error(`Teacher not found for user ID: ${req.user.id}`);
      throw new Error("Teacher not found");
    }

    // Determine if we're using embedded or referenced lectures
    const useEmbeddedLectures =
      req.body.lectures &&
      req.body.lectures.length > 0 &&
      (req.body.lectures[0].recordingUrl || !req.body.lectures[0].content);

    // Create main course
    const courseData = {
      title: req.body.title,
      aboutCourse: req.body.aboutCourse,
      semester: req.body.semester,
      teacher: teacher._id,
      lectures: useEmbeddedLectures ? req.body.lectures : [], // Use embedded lectures if appropriate
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

    // Create lectures as separate documents if not using embedded lectures
    if (
      !useEmbeddedLectures &&
      req.body.lectures &&
      req.body.lectures.length > 0
    ) {
      logger.info("Creating lectures as separate documents for the course");
      const lecturePromises = req.body.lectures.map((lectureData) => {
        return Lecture.create(
          [
            {
              ...lectureData,
              course: course._id,
            },
          ],
          { session }
        );
      });

      const createdLectures = await Promise.all(lecturePromises);
      const lectureIds = createdLectures.map((lecture) => lecture[0]._id);

      course.lectures = lectureIds;
      logger.info(`Created ${lectureIds.length} lectures for the course`);
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
    const courseQuery = Course.findById(course._id)
      .populate("semester")
      .populate("outcomes")
      .populate("schedule")
      .populate("syllabus")
      .populate("weeklyPlan")
      .populate("creditPoints")
      .populate("attendance");

    // Populate lectures if they are referenced
    if (!useEmbeddedLectures) {
      courseQuery.populate("lectures");
    }

    const createdCourse = await courseQuery.exec();
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

    // Determine if we're using embedded or referenced lectures
    const isUsingEmbeddedLectures =
      course.lectures &&
      course.lectures.length > 0 &&
      typeof course.lectures[0] === "object" &&
      !course.lectures[0]._id;

    // Update main course fields
    if (req.body.title) course.title = req.body.title;
    if (req.body.aboutCourse) course.aboutCourse = req.body.aboutCourse;
    if (req.body.semester) course.semester = req.body.semester;

    // Update lectures if they are embedded
    if (isUsingEmbeddedLectures && req.body.lectures) {
      course.lectures = req.body.lectures;
    }

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

    // Handle lectures update if they are referenced documents
    if (!isUsingEmbeddedLectures && req.body.lectures) {
      // Get existing lecture IDs
      const existingLectureIds = course.lectures.map((id) =>
        id instanceof mongoose.Types.ObjectId ? id.toString() : id.toString()
      );

      // Process each lecture from the request
      const updatePromises = [];
      const newLectures = [];

      for (const lectureData of req.body.lectures) {
        // If lecture has an ID, update it
        if (
          lectureData._id &&
          existingLectureIds.includes(lectureData._id.toString())
        ) {
          updatePromises.push(
            Lecture.findByIdAndUpdate(lectureData._id, lectureData, {
              session,
              new: true,
            })
          );
        }
        // Otherwise create a new lecture
        else {
          newLectures.push({
            ...lectureData,
            course: course._id,
          });
        }
      }

      // Create any new lectures
      if (newLectures.length > 0) {
        const createdLectures = await Lecture.create(newLectures, { session });
        const newLectureIds = createdLectures.map((lecture) => lecture._id);

        // Add new lecture IDs to the course
        course.lectures = [...course.lectures, ...newLectureIds];
        await course.save({ session });
        logger.info(`Added ${newLectureIds.length} new lectures to the course`);
      }

      // Update existing lectures
      if (updatePromises.length > 0) {
        await Promise.all(updatePromises);
        logger.info(`Updated ${updatePromises.length} existing lectures`);
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

    // Populate lectures if they are referenced
    if (!isUsingEmbeddedLectures) {
      courseQuery.populate("lectures");
    }

    const updatedCourse = await courseQuery.exec();
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

    // Determine if we're using embedded or referenced lectures
    const isUsingReferencedLectures =
      course.lectures &&
      course.lectures.length > 0 &&
      (typeof course.lectures[0] !== "object" || course.lectures[0]._id);

    // Delete referenced lectures if they exist
    if (isUsingReferencedLectures) {
      // Get all lecture IDs
      const lectureIds = course.lectures.map((id) =>
        id instanceof mongoose.Types.ObjectId ? id : id._id
      );

      // Find all lectures to get their videoKeys
      const lectures = await Lecture.find({
        _id: { $in: lectureIds },
      }).session(session);

      // Delete videos from S3 for each lecture
      for (const lecture of lectures) {
        if (lecture.videoKey) {
          try {
            await deleteFileFromS3(lecture.videoKey);
            logger.info(`Deleted video from S3: ${lecture.videoKey}`);
          } catch (deleteError) {
            logger.error("Error deleting video file:", deleteError);
            // Continue with lecture deletion even if S3 delete fails
          }
        }
      }

      // Delete all lectures
      await Lecture.deleteMany(
        {
          _id: { $in: lectureIds },
        },
        { session }
      );

      logger.info(`Deleted ${lectureIds.length} lectures for this course`);
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

// Add a new lecture to a course
const addLecture = async function (req, res) {
  try {
    logger.info(`Adding lecture to course ID: ${req.params.courseId}`);

    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      logger.error(`Teacher not found for user ID: ${req.user.id}`);
      return res.status(404).json({ error: "Teacher not found" });
    }

    const course = await Course.findOne({
      _id: req.params.courseId,
      teacher: teacher._id,
    });

    if (!course) {
      logger.error(`Course not found with ID: ${req.params.courseId}`);
      return res.status(404).json({ error: "Course not found" });
    }

    // Determine if we're using embedded or referenced lectures
    const isUsingEmbeddedLectures =
      course.lectures &&
      course.lectures.length > 0 &&
      typeof course.lectures[0] === "object" &&
      !course.lectures[0]._id;

    if (isUsingEmbeddedLectures) {
      // Add lecture to embedded array
      const newLecture = {
        title: req.body.title,
        recordingUrl: req.body.recordingUrl || req.body.videoUrl,
        date: req.body.date || new Date(),
        duration: req.body.duration || 0,
      };

      course.lectures.push(newLecture);
      await course.save();

      logger.info(`Added embedded lecture to course: ${course._id}`);
      return res.status(201).json(course);
    } else {
      // Handle video file upload if present
      let videoUrl = req.body.videoUrl;
      let videoKey = null;

      if (req.files && req.files.video) {
        const videoFile = req.files.video;

        // Validate file type
        if (!videoFile.mimetype.startsWith("video/")) {
          return res
            .status(400)
            .json({ error: "Uploaded file must be a video" });
        }

        // Upload to S3
        const uploadPath = `courses/${course._id}/lectures`;
        const uploadResult = await uploadFileToS3(videoFile, uploadPath);

        videoUrl = uploadResult.url;
        videoKey = uploadResult.key;
      }

      // Create new lecture document
      const newLecture = new Lecture({
        title: req.body.title,
        content: req.body.content || req.body.title,
        videoUrl: videoUrl,
        videoKey: videoKey,
        course: course._id,
        isReviewed: req.body.isReviewed || false,
        reviewDeadline: req.body.reviewDeadline || undefined,
      });

      await newLecture.save();

      // Add lecture ID to course
      course.lectures.push(newLecture._id);
      await course.save();

      logger.info(`Created new lecture document: ${newLecture._id}`);
      return res.status(201).json(newLecture);
    }
  } catch (error) {
    logger.error("Error in addLecture:", error);
    return res.status(400).json({ error: error.message });
  }
};

// Update a specific lecture in a course
const updateCourseLecture = async function (req, res) {
  try {
    logger.info(
      `Updating lecture ID: ${req.params.lectureId} in course ID: ${req.params.courseId}`
    );

    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      logger.error(`Teacher not found for user ID: ${req.user.id}`);
      return res.status(404).json({ error: "Teacher not found" });
    }

    const course = await Course.findOne({
      _id: req.params.courseId,
      teacher: teacher._id,
    });

    if (!course) {
      logger.error(`Course not found with ID: ${req.params.courseId}`);
      return res.status(404).json({ error: "Course not found" });
    }

    // Determine if we're using embedded or referenced lectures
    const isUsingEmbeddedLectures =
      course.lectures &&
      course.lectures.length > 0 &&
      typeof course.lectures[0] === "object" &&
      !course.lectures[0]._id;

    if (isUsingEmbeddedLectures) {
      // For embedded lectures, find by index
      const lectureIndex = parseInt(req.params.lectureId);

      if (
        isNaN(lectureIndex) ||
        lectureIndex < 0 ||
        lectureIndex >= course.lectures.length
      ) {
        logger.error(`Invalid lecture index: ${req.params.lectureId}`);
        return res.status(404).json({ error: "Lecture not found" });
      }

      // Update embedded lecture
      if (req.body.title) course.lectures[lectureIndex].title = req.body.title;
      if (req.body.recordingUrl)
        course.lectures[lectureIndex].recordingUrl = req.body.recordingUrl;
      if (req.body.videoUrl)
        course.lectures[lectureIndex].recordingUrl = req.body.videoUrl;
      if (req.body.date) course.lectures[lectureIndex].date = req.body.date;
      if (req.body.duration)
        course.lectures[lectureIndex].duration = req.body.duration;

      await course.save();

      logger.info(`Updated embedded lecture at index: ${lectureIndex}`);
      return res.json(course.lectures[lectureIndex]);
    } else {
      // For referenced lectures, find the lecture by ID
      const lecture = await Lecture.findOne({
        _id: req.params.lectureId,
        course: course._id,
      });

      if (!lecture) {
        logger.error(`Lecture not found with ID: ${req.params.lectureId}`);
        return res.status(404).json({ error: "Lecture not found" });
      }

      // Update lecture fields
      if (req.body.title) lecture.title = req.body.title;
      if (req.body.content) lecture.content = req.body.content;

      // Handle video file update if provided
      if (req.files && req.files.video) {
        const videoFile = req.files.video;

        // Validate file type
        if (!videoFile.mimetype.startsWith("video/")) {
          return res
            .status(400)
            .json({ error: "Uploaded file must be a video" });
        }

        // Delete old video from S3 if it exists
        if (lecture.videoKey) {
          try {
            await deleteFileFromS3(lecture.videoKey);
          } catch (deleteError) {
            logger.error("Error deleting old video file:", deleteError);
            // Continue with upload even if delete fails
          }
        }

        // Upload new video to S3
        const uploadPath = `courses/${course._id}/lectures`;
        const uploadResult = await uploadFileToS3(videoFile, uploadPath);

        lecture.videoUrl = uploadResult.url;
        lecture.videoKey = uploadResult.key;
      } else if (req.body.videoUrl) {
        lecture.videoUrl = req.body.videoUrl;
      }

      // Update review fields
      if (req.body.isReviewed !== undefined)
        lecture.isReviewed = req.body.isReviewed;
      if (req.body.reviewDeadline)
        lecture.reviewDeadline = new Date(req.body.reviewDeadline);

      await lecture.save();

      logger.info(`Updated lecture: ${lecture._id}`);
      return res.json(lecture);
    }
  } catch (error) {
    logger.error("Error in updateCourseLecture:", error);
    return res.status(400).json({ error: error.message });
  }
};

// Delete a lecture from a course
const deleteCourseLecture = async function (req, res) {
  try {
    logger.info(
      `Deleting lecture ID: ${req.params.lectureId} from course ID: ${req.params.courseId}`
    );

    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      logger.error(`Teacher not found for user ID: ${req.user.id}`);
      return res.status(404).json({ error: "Teacher not found" });
    }

    const course = await Course.findOne({
      _id: req.params.courseId,
      teacher: teacher._id,
    });

    if (!course) {
      logger.error(`Course not found with ID: ${req.params.courseId}`);
      return res.status(404).json({ error: "Course not found" });
    }

    // Determine if we're using embedded or referenced lectures
    const isUsingEmbeddedLectures =
      course.lectures &&
      course.lectures.length > 0 &&
      typeof course.lectures[0] === "object" &&
      !course.lectures[0]._id;

    if (isUsingEmbeddedLectures) {
      // For embedded lectures, find by index and remove
      const lectureIndex = parseInt(req.params.lectureId);

      if (
        isNaN(lectureIndex) ||
        lectureIndex < 0 ||
        lectureIndex >= course.lectures.length
      ) {
        logger.error(`Invalid lecture index: ${req.params.lectureId}`);
        return res.status(404).json({ error: "Lecture not found" });
      }

      // Remove lecture at index
      course.lectures.splice(lectureIndex, 1);
      await course.save();

      logger.info(`Removed embedded lecture at index: ${lectureIndex}`);
      return res.json({ message: "Lecture removed successfully" });
    } else {
      // For referenced lectures, find the lecture by ID
      const lecture = await Lecture.findOne({
        _id: req.params.lectureId,
        course: course._id,
      });

      if (!lecture) {
        logger.error(`Lecture not found with ID: ${req.params.lectureId}`);
        return res.status(404).json({ error: "Lecture not found" });
      }

      // Delete video from S3 if it exists
      if (lecture.videoKey) {
        try {
          await deleteFileFromS3(lecture.videoKey);
          logger.info(`Deleted video from S3: ${lecture.videoKey}`);
        } catch (deleteError) {
          logger.error("Error deleting video file:", deleteError);
          // Continue with lecture deletion even if S3 delete fails
        }
      }

      // Remove lecture ID from course
      course.lectures = course.lectures.filter(
        (id) => id.toString() !== lecture._id.toString()
      );
      await course.save();

      // Delete the lecture document
      await Lecture.findByIdAndDelete(lecture._id);

      logger.info(`Deleted lecture: ${lecture._id}`);
      return res.json({ message: "Lecture deleted successfully" });
    }
  } catch (error) {
    logger.error("Error in deleteCourseLecture:", error);
    return res.status(400).json({ error: error.message });
  }
};

// Get all lectures for a course
const getCourseLectures = async function (req, res) {
  try {
    logger.info(`Getting all lectures for course ID: ${req.params.courseId}`);

    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      logger.error(`Teacher not found for user ID: ${req.user.id}`);
      return res.status(404).json({ error: "Teacher not found" });
    }

    const course = await Course.findOne({
      _id: req.params.courseId,
      teacher: teacher._id,
    });

    if (!course) {
      logger.error(`Course not found with ID: ${req.params.courseId}`);
      return res.status(404).json({ error: "Course not found" });
    }

    // Determine if we're using embedded or referenced lectures
    const isUsingEmbeddedLectures =
      course.lectures &&
      course.lectures.length > 0 &&
      typeof course.lectures[0] === "object" &&
      !course.lectures[0]._id;

    if (isUsingEmbeddedLectures) {
      // Return embedded lectures directly
      logger.info(`Returning ${course.lectures.length} embedded lectures`);
      return res.json(course.lectures);
    } else {
      // For referenced lectures, populate and return
      await course.populate("lectures");

      // Check and update review status for all lectures
      const now = new Date();
      for (const lecture of course.lectures) {
        if (
          !lecture.isReviewed &&
          lecture.reviewDeadline &&
          now >= lecture.reviewDeadline
        ) {
          lecture.isReviewed = true;
          await lecture.save();
        }
      }

      logger.info(`Returning ${course.lectures.length} referenced lectures`);
      return res.json(course.lectures);
    }
  } catch (error) {
    logger.error("Error in getCourseLectures:", error);
    return res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getUserCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  updateCourseAttendance,
  addLecture,
  updateCourseLecture,
  deleteCourseLecture,
  getCourseLectures,
};
