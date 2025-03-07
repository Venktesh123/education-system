const Course = require("../models/Course");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const Lecture = require("../models/Lecture");
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

// Create a new lecture
const createLecture = async function (req, res) {
  try {
    logger.info(
      `Creating lecture for course ID: ${
        req.params.courseId || req.body.course
      }`
    );

    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      logger.error(`Teacher not found for user ID: ${req.user.id}`);
      return res.status(404).json({ error: "Teacher not found" });
    }

    // Determine course ID from params or body
    const courseId = req.params.courseId;
    if (!courseId) {
      return res.status(400).json({ error: "Course ID is required" });
    }

    const course = await Course.findOne({
      _id: courseId,
      teacher: teacher._id,
    });

    if (!course) {
      logger.error(`Course not found with ID: ${courseId}`);
      return res.status(404).json({ error: "Course not found" });
    }

    // Check if video file was uploaded
    if (!req.files || !req.files.video) {
      return res.status(400).json({ error: "Video file is required" });
    }

    // Upload video to S3
    const videoFile = req.files.video;
    // Validate file type (ensure it's an mp4)
    if (!videoFile.mimetype.startsWith("video/")) {
      return res.status(400).json({ error: "Uploaded file must be a video" });
    }

    // Upload to S3
    const uploadPath = `courses/${course._id}/lectures`;
    const uploadResult = await uploadFileToS3(videoFile, uploadPath);

    // Create the lecture with default isReviewed = false and reviewDeadline = now + 7 days
    const lectureData = {
      title: req.body.title,
      content: req.body.content,
      videoUrl: uploadResult.url,
      videoKey: uploadResult.key,
      course: course._id,
      isReviewed: req.body.isReviewed || false,
    };

    // If manual review deadline is provided, use it
    if (req.body.reviewDeadline) {
      lectureData.reviewDeadline = new Date(req.body.reviewDeadline);
    }

    const lecture = new Lecture(lectureData);
    await lecture.save();

    // Add lecture to course's lectures array
    course.lectures.push(lecture._id);
    await course.save();

    logger.info(`Created lecture ID: ${lecture._id}`);
    res.status(201).json(lecture);
  } catch (error) {
    logger.error("Error in createLecture:", error);
    res.status(400).json({ error: error.message });
  }
};

// Update an existing lecture
const updateLecture = async function (req, res) {
  try {
    const lectureId = req.params.lectureId || req.params.id;
    logger.info(`Updating lecture ID: ${lectureId}`);

    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      logger.error(`Teacher not found for user ID: ${req.user.id}`);
      return res.status(404).json({ error: "Teacher not found" });
    }

    // Find lecture and verify course ownership
    const lecture = await Lecture.findById(lectureId);
    if (!lecture) {
      logger.error(`Lecture not found with ID: ${lectureId}`);
      return res.status(404).json({ error: "Lecture not found" });
    }

    // If courseId is in params, verify it matches lecture's course
    if (
      req.params.courseId &&
      lecture.course.toString() !== req.params.courseId
    ) {
      logger.error(
        `Lecture with ID ${lectureId} does not belong to course ${req.params.courseId}`
      );
      return res
        .status(403)
        .json({ error: "Lecture does not belong to specified course" });
    }

    // Verify teacher has access to this lecture's course
    const course = await Course.findOne({
      _id: lecture.course,
      teacher: teacher._id,
    });

    if (!course) {
      logger.error(
        `Teacher does not have access to course for lecture: ${lectureId}`
      );
      return res
        .status(403)
        .json({ error: "You don't have permission to update this lecture" });
    }

    // Update lecture fields
    if (req.body.title) lecture.title = req.body.title;
    if (req.body.content) lecture.content = req.body.content;

    // Handle video file update if provided
    if (req.files && req.files.video) {
      const videoFile = req.files.video;

      // Validate file type
      if (!videoFile.mimetype.startsWith("video/")) {
        return res.status(400).json({ error: "Uploaded file must be a video" });
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
    }

    // Handle the review status
    if (req.body.isReviewed !== undefined) {
      lecture.isReviewed = req.body.isReviewed;
    }

    // If review deadline is provided, update it
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

    await lecture.save();
    logger.info(`Updated lecture ID: ${lecture._id}`);
    res.json(lecture);
  } catch (error) {
    logger.error("Error in updateLecture:", error);
    res.status(400).json({ error: error.message });
  }
};

// Get all lectures for a course
const getCourseLectures = async function (req, res) {
  try {
    logger.info(`Fetching lectures for course ID: ${req.params.courseId}`);

    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      logger.error(`Teacher not found for user ID: ${req.user.id}`);
      return res.status(404).json({ error: "Teacher not found" });
    }

    const course = await Course.findOne({
      _id: req.params.courseId,
      teacher: teacher._id,
    }).populate("lectures");

    if (!course) {
      logger.error(`Course not found with ID: ${req.params.courseId}`);
      return res.status(404).json({ error: "Course not found" });
    }

    // Before returning lectures, update any that have passed their review deadline
    const now = new Date();
    const updatePromises = course.lectures.map(async (lecture) => {
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

    // Refresh the course to get updated lectures
    await course.populate("lectures");

    res.json(course.lectures);
  } catch (error) {
    logger.error("Error in getCourseLectures:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get a specific lecture
const getLectureById = async function (req, res) {
  try {
    const lectureId = req.params.lectureId || req.params.id;
    logger.info(`Fetching lecture ID: ${lectureId}`);

    // First get the lecture
    const lecture = await Lecture.findById(lectureId);

    if (!lecture) {
      logger.error(`Lecture not found with ID: ${lectureId}`);
      return res.status(404).json({ error: "Lecture not found" });
    }

    // If we're using nested routes, verify the course ID matches
    if (
      req.params.courseId &&
      lecture.course.toString() !== req.params.courseId
    ) {
      logger.error(
        `Lecture with ID ${lectureId} does not belong to course ${req.params.courseId}`
      );
      return res
        .status(403)
        .json({ error: "Lecture does not belong to specified course" });
    }

    // For teachers, verify they have access to this lecture's course
    if (req.user.role === "teacher") {
      const teacher = await Teacher.findOne({ user: req.user.id });
      if (!teacher) {
        logger.error(`Teacher not found for user ID: ${req.user.id}`);
        return res.status(404).json({ error: "Teacher not found" });
      }

      const course = await Course.findOne({
        _id: lecture.course,
        teacher: teacher._id,
      });

      if (!course) {
        logger.error(
          `Teacher does not have access to course for lecture: ${lectureId}`
        );
        return res
          .status(403)
          .json({ error: "You don't have permission to view this lecture" });
      }
    }

    // For students, verify they are enrolled in this course
    if (req.user.role === "student") {
      const student = await Student.findOne({ user: req.user.id });
      if (!student) {
        logger.error(`Student not found for user ID: ${req.user.id}`);
        return res.status(404).json({ error: "Student not found" });
      }

      if (!student.courses.includes(lecture.course)) {
        logger.error(
          `Student is not enrolled in course for lecture: ${lectureId}`
        );
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

// Delete a lecture
const deleteLecture = async function (req, res) {
  try {
    logger.info(`Deleting lecture ID: ${req.params.lectureId}`);

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

    // Remove the lecture from the course's lectures array
    course.lectures = course.lectures.filter((id) => !id.equals(lecture._id));
    await course.save();

    // Delete the lecture
    await Lecture.findByIdAndDelete(lecture._id);
    logger.info(`Deleted lecture ID: ${lecture._id}`);

    res.json({ message: "Lecture deleted successfully" });
  } catch (error) {
    logger.error("Error in deleteLecture:", error);
    res.status(500).json({ error: error.message });
  }
};

// Update lecture review status
const updateLectureReviewStatus = async function (req, res) {
  try {
    logger.info(
      `Updating review status for lecture ID: ${req.params.lectureId}`
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

    const lecture = await Lecture.findOne({
      _id: req.params.lectureId,
      course: course._id,
    });

    if (!lecture) {
      logger.error(`Lecture not found with ID: ${req.params.lectureId}`);
      return res.status(404).json({ error: "Lecture not found" });
    }

    // Update review status
    lecture.isReviewed = req.body.isReviewed;

    // If extending the review deadline
    if (req.body.reviewDeadline) {
      lecture.reviewDeadline = new Date(req.body.reviewDeadline);
    }

    await lecture.save();
    logger.info(`Updated review status for lecture ID: ${lecture._id}`);

    res.json(lecture);
  } catch (error) {
    logger.error("Error in updateLectureReviewStatus:", error);
    res.status(400).json({ error: error.message });
  }
};

// Update review status for all lectures in a course
const updateAllLectureReviewStatuses = async function (req, res) {
  try {
    logger.info(
      `Updating review status for all lectures in course ID: ${req.params.courseId}`
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

    // Update all lectures with passed review deadlines
    const now = new Date();
    const result = await Lecture.updateMany(
      {
        course: course._id,
        isReviewed: false,
        reviewDeadline: { $lte: now },
      },
      {
        $set: { isReviewed: true },
      }
    );

    logger.info(`Updated ${result.modifiedCount} lectures to reviewed status`);
    res.json({
      message: `${result.modifiedCount} lectures were marked as reviewed automatically`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    logger.error("Error in updateAllLectureReviewStatuses:", error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createLecture,
  updateLecture,
  getCourseLectures,
  getLectureById,
  deleteLecture,
  updateLectureReviewStatus,
  updateAllLectureReviewStatuses,
};
