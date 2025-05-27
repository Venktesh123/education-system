const Course = require("../models/Course");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const Lecture = require("../models/Lecture");
const CourseSyllabus = require("../models/CourseSyllabus");
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

// Create a new lecture for a specific module
const createLectureForModule = async function (req, res) {
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;

    logger.info(
      `Creating lecture for course ID: ${req.params.courseId}, module ID: ${req.params.moduleId}`
    );

    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      logger.error(`Teacher not found for user ID: ${req.user.id}`);
      return res.status(404).json({ error: "Teacher not found" });
    }

    const { courseId, moduleId } = req.params;

    // Verify course ownership
    const course = await Course.findOne({
      _id: courseId,
      teacher: teacher._id,
    });

    if (!course) {
      logger.error(`Course not found with ID: ${courseId}`);
      return res.status(404).json({ error: "Course not found" });
    }

    // Find the syllabus and module
    const syllabus = await CourseSyllabus.findOne({ course: courseId }).session(
      session
    );
    if (!syllabus) {
      logger.error(`Course syllabus not found for course: ${courseId}`);
      return res.status(404).json({ error: "Course syllabus not found" });
    }

    const module = syllabus.modules.id(moduleId);
    if (!module) {
      logger.error(`Module not found with ID: ${moduleId}`);
      return res.status(404).json({ error: "Module not found" });
    }

    // Check if video file was uploaded
    if (!req.files || !req.files.video) {
      return res.status(400).json({ error: "Video file is required" });
    }

    // Upload video to S3
    const videoFile = req.files.video;
    if (!videoFile.mimetype.startsWith("video/")) {
      return res.status(400).json({ error: "Uploaded file must be a video" });
    }

    const uploadPath = `courses/${course._id}/modules/${moduleId}/lectures`;
    const uploadResult = await uploadFileToS3(videoFile, uploadPath);

    // Get the next lecture order for this module
    const existingLectures = await Lecture.find({
      course: courseId,
      syllabusModule: moduleId,
    })
      .sort({ lectureOrder: -1 })
      .limit(1);

    const nextOrder =
      existingLectures.length > 0 ? existingLectures[0].lectureOrder + 1 : 1;

    // Create the lecture
    const lectureData = {
      title: req.body.title,
      content: req.body.content,
      videoUrl: uploadResult.url,
      videoKey: uploadResult.key,
      course: course._id,
      syllabusModule: moduleId,
      moduleNumber: module.moduleNumber,
      lectureOrder: nextOrder,
      isReviewed: req.body.isReviewed || false,
    };

    if (req.body.reviewDeadline) {
      lectureData.reviewDeadline = new Date(req.body.reviewDeadline);
    }

    const lecture = new Lecture(lectureData);
    await lecture.save({ session });

    // Add lecture to module's lectures array
    module.lectures.push(lecture._id);
    await syllabus.save({ session });

    await session.commitTransaction();
    transactionStarted = false;

    logger.info(`Created lecture ID: ${lecture._id} for module: ${moduleId}`);
    res.status(201).json(lecture);
  } catch (error) {
    if (transactionStarted) {
      await session.abortTransaction();
    }
    logger.error("Error in createLectureForModule:", error);
    res.status(400).json({ error: error.message });
  } finally {
    await session.endSession();
  }
};

// Get all lectures for a specific module
const getModuleLectures = async function (req, res) {
  try {
    logger.info(
      `Fetching lectures for course ID: ${req.params.courseId}, module ID: ${req.params.moduleId}`
    );

    const { courseId, moduleId } = req.params;

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

    // Find lectures for this module
    const lectures = await Lecture.find({
      course: courseId,
      syllabusModule: moduleId,
      isActive: true,
    }).sort({ lectureOrder: 1 });

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

    // Re-fetch lectures to get updated data
    const updatedLectures = await Lecture.find({
      course: courseId,
      syllabusModule: moduleId,
      isActive: true,
    }).sort({ lectureOrder: 1 });

    res.json({
      success: true,
      moduleId,
      courseId,
      lectures: updatedLectures,
    });
  } catch (error) {
    logger.error("Error in getModuleLectures:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get all lectures for a course organized by modules
const getCourseModulesWithLectures = async function (req, res) {
  try {
    logger.info(
      `Fetching all modules with lectures for course ID: ${req.params.courseId}`
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
    const modulesWithLectures = syllabus.modules.map((module) => {
      const moduleLectures = lectures.filter(
        (lecture) => lecture.syllabusModule.toString() === module._id.toString()
      );

      return {
        _id: module._id,
        moduleNumber: module.moduleNumber,
        moduleTitle: module.moduleTitle,
        description: module.description,
        topics: module.topics,
        isActive: module.isActive,
        lectures: moduleLectures,
        lectureCount: moduleLectures.length,
      };
    });

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

// Update a lecture
const updateLecture = async function (req, res) {
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;

    const { courseId, moduleId, lectureId } = req.params;
    logger.info(`Updating lecture ID: ${lectureId}`);

    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      return res.status(404).json({ error: "Teacher not found" });
    }

    // Find lecture and verify access
    const lecture = await Lecture.findById(lectureId);
    if (!lecture) {
      return res.status(404).json({ error: "Lecture not found" });
    }

    if (lecture.course.toString() !== courseId) {
      return res
        .status(403)
        .json({ error: "Lecture does not belong to specified course" });
    }

    if (lecture.syllabusModule.toString() !== moduleId) {
      return res
        .status(403)
        .json({ error: "Lecture does not belong to specified module" });
    }

    // Verify teacher has access to this course
    const course = await Course.findOne({
      _id: courseId,
      teacher: teacher._id,
    });

    if (!course) {
      return res
        .status(403)
        .json({ error: "You don't have permission to update this lecture" });
    }

    // Update lecture fields
    if (req.body.title) lecture.title = req.body.title;
    if (req.body.content) lecture.content = req.body.content;
    if (req.body.lectureOrder) lecture.lectureOrder = req.body.lectureOrder;

    // Handle video file update if provided
    if (req.files && req.files.video) {
      const videoFile = req.files.video;

      if (!videoFile.mimetype.startsWith("video/")) {
        return res.status(400).json({ error: "Uploaded file must be a video" });
      }

      // Delete old video from S3 if it exists
      if (lecture.videoKey) {
        try {
          await deleteFileFromS3(lecture.videoKey);
        } catch (deleteError) {
          logger.error("Error deleting old video file:", deleteError);
        }
      }

      // Upload new video to S3
      const uploadPath = `courses/${courseId}/modules/${moduleId}/lectures`;
      const uploadResult = await uploadFileToS3(videoFile, uploadPath);

      lecture.videoUrl = uploadResult.url;
      lecture.videoKey = uploadResult.key;
    }

    // Handle review status
    if (req.body.isReviewed !== undefined) {
      lecture.isReviewed = req.body.isReviewed;
    }

    if (req.body.reviewDeadline) {
      lecture.reviewDeadline = new Date(req.body.reviewDeadline);
    }

    // Auto-check if the deadline has passed
    const now = new Date();
    if (
      !lecture.isReviewed &&
      lecture.reviewDeadline &&
      now >= lecture.reviewDeadline
    ) {
      lecture.isReviewed = true;
    }

    await lecture.save({ session });

    await session.commitTransaction();
    transactionStarted = false;

    logger.info(`Updated lecture ID: ${lecture._id}`);
    res.json(lecture);
  } catch (error) {
    if (transactionStarted) {
      await session.abortTransaction();
    }
    logger.error("Error in updateLecture:", error);
    res.status(400).json({ error: error.message });
  } finally {
    await session.endSession();
  }
};

// Delete a lecture
const deleteLecture = async function (req, res) {
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;

    const { courseId, moduleId, lectureId } = req.params;
    logger.info(`Deleting lecture ID: ${lectureId}`);

    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      return res.status(404).json({ error: "Teacher not found" });
    }

    // Verify course ownership
    const course = await Course.findOne({
      _id: courseId,
      teacher: teacher._id,
    });

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Find the lecture
    const lecture = await Lecture.findOne({
      _id: lectureId,
      course: courseId,
      syllabusModule: moduleId,
    });

    if (!lecture) {
      return res.status(404).json({ error: "Lecture not found" });
    }

    // Delete video from S3 if it exists
    if (lecture.videoKey) {
      try {
        await deleteFileFromS3(lecture.videoKey);
        logger.info(`Deleted video from S3: ${lecture.videoKey}`);
      } catch (deleteError) {
        logger.error("Error deleting video file:", deleteError);
      }
    }

    // Remove lecture from syllabus module
    const syllabus = await CourseSyllabus.findOne({ course: courseId }).session(
      session
    );
    if (syllabus) {
      const module = syllabus.modules.id(moduleId);
      if (module) {
        module.lectures = module.lectures.filter(
          (id) => id.toString() !== lecture._id.toString()
        );
        await syllabus.save({ session });
      }
    }

    // Delete the lecture
    await Lecture.findByIdAndDelete(lecture._id).session(session);

    await session.commitTransaction();
    transactionStarted = false;

    logger.info(`Deleted lecture ID: ${lecture._id}`);
    res.json({ message: "Lecture deleted successfully" });
  } catch (error) {
    if (transactionStarted) {
      await session.abortTransaction();
    }
    logger.error("Error in deleteLecture:", error);
    res.status(500).json({ error: error.message });
  } finally {
    await session.endSession();
  }
};

// Get a specific lecture
const getLectureById = async function (req, res) {
  try {
    const { courseId, moduleId, lectureId } = req.params;
    logger.info(`Fetching lecture ID: ${lectureId}`);

    // Find the lecture
    const lecture = await Lecture.findById(lectureId);

    if (!lecture) {
      return res.status(404).json({ error: "Lecture not found" });
    }

    // Verify lecture belongs to the specified course and module
    if (lecture.course.toString() !== courseId) {
      return res
        .status(403)
        .json({ error: "Lecture does not belong to specified course" });
    }

    if (lecture.syllabusModule.toString() !== moduleId) {
      return res
        .status(403)
        .json({ error: "Lecture does not belong to specified module" });
    }

    // Verify user access
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
        return res
          .status(403)
          .json({ error: "You don't have permission to view this lecture" });
      }
    } else if (req.user.role === "student") {
      const student = await Student.findOne({ user: req.user.id });
      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      if (!student.courses.includes(courseId)) {
        return res
          .status(403)
          .json({ error: "You don't have permission to view this lecture" });
      }
    }

    // Check if review deadline has passed
    const now = new Date();
    if (
      !lecture.isReviewed &&
      lecture.reviewDeadline &&
      now >= lecture.reviewDeadline
    ) {
      lecture.isReviewed = true;
      await lecture.save();
    }

    res.json(lecture);
  } catch (error) {
    logger.error("Error in getLectureById:", error);
    res.status(500).json({ error: error.message });
  }
};

// Update lecture order within a module
const updateLectureOrder = async function (req, res) {
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;

    const { courseId, moduleId } = req.params;
    const { lectureOrders } = req.body; // Array of {lectureId, order}

    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      return res.status(404).json({ error: "Teacher not found" });
    }

    // Verify course ownership
    const course = await Course.findOne({
      _id: courseId,
      teacher: teacher._id,
    });

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Update lecture orders
    const updatePromises = lectureOrders.map(({ lectureId, order }) =>
      Lecture.findOneAndUpdate(
        {
          _id: lectureId,
          course: courseId,
          syllabusModule: moduleId,
        },
        { lectureOrder: order },
        { session }
      )
    );

    await Promise.all(updatePromises);

    await session.commitTransaction();
    transactionStarted = false;

    res.json({ message: "Lecture order updated successfully" });
  } catch (error) {
    if (transactionStarted) {
      await session.abortTransaction();
    }
    logger.error("Error in updateLectureOrder:", error);
    res.status(400).json({ error: error.message });
  } finally {
    await session.endSession();
  }
};

module.exports = {
  createLectureForModule,
  getModuleLectures,
  getCourseModulesWithLectures,
  updateLecture,
  deleteLecture,
  getLectureById,
  updateLectureOrder,
};
