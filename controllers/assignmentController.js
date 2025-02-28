const Assignment = require("../models/Assignment");
const Course = require("../models/Course");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const mongoose = require("mongoose");
// const s3 = require("../utils/s3Config");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const { ErrorHandler } = require("../middleware/errorHandler");
const { v4: uuidv4 } = require("uuid");
const AWS = require("aws-sdk");

// Helper function to upload file to S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// Upload file to S3
const uploadFileToS3 = (fileBuffer, originalName, mimeType, folder) => {
  return new Promise((resolve, reject) => {
    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: `${folder}/${Date.now()}-${originalName}`,
      Body: fileBuffer,
      ContentType: mimeType,
      // ACL: "public-read",
    };

    s3.upload(params, (err, data) => {
      if (err) {
        console.error("S3 upload error:", err);
        return reject(err);
      }

      return resolve({
        key: data.Key,
        url: data.Location,
      });
    });
  });
};

// Create new assignment
exports.createAssignment = catchAsyncErrors(async (req, res, next) => {
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    session.startTransaction();
    transactionStarted = true;

    const { title, description, dueDate, totalPoints } = req.body;
    const { courseId } = req.params; // Extract courseId from URL

    // Validate inputs
    if (!title || !description || !dueDate || !totalPoints) {
      return next(new ErrorHandler("All fields are required", 400));
    }

    // Check if course exists
    const course = await Course.findById(courseId).session(session);
    if (!course) {
      return next(new ErrorHandler("Course not found", 404));
    }

    // Create assignment object
    const assignment = new Assignment({
      title,
      description,
      course: courseId,
      dueDate,
      totalPoints,
      isActive: true, // Default value
    });

    // Handle file uploads if any
    if (req.files && req.files.attachments) {
      let attachmentsArray = Array.isArray(req.files.attachments)
        ? req.files.attachments
        : [req.files.attachments];

      // Validate file types
      const allowedTypes = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/jpg",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ];

      for (const file of attachmentsArray) {
        if (!allowedTypes.includes(file.mimetype)) {
          return next(
            new ErrorHandler(
              `Invalid file type. Allowed types: PDF, JPEG, PNG, DOC, DOCX, XLS, XLSX`,
              400
            )
          );
        }

        // Validate file size (5MB)
        if (file.size > 5 * 1024 * 1024) {
          return next(
            new ErrorHandler(`File too large. Maximum size allowed is 5MB`, 400)
          );
        }
      }

      // Upload attachments to S3
      try {
        const uploadPromises = attachmentsArray.map((file) =>
          uploadFileToS3(
            file.data,
            file.name,
            file.mimetype,
            "assignment-attachments"
          )
        );

        const uploadedFiles = await Promise.all(uploadPromises);

        // Add attachments to assignment
        assignment.attachments = uploadedFiles.map((file) => ({
          name: file.key.split("/").pop(), // Extract filename from key
          url: file.url,
        }));
      } catch (uploadError) {
        console.error("Error uploading files:", uploadError);
        return next(new ErrorHandler("Failed to upload files", 500));
      }
    }

    await assignment.save({ session });

    // Add assignment to course's assignments array
    course.assignments = course.assignments || [];
    course.assignments.push(assignment._id);
    await course.save({ session });

    await session.commitTransaction();
    transactionStarted = false;

    res.status(201).json({
      success: true,
      message: "Assignment created successfully",
      assignment,
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error("Error aborting transaction:", abortError);
      }
    }

    return next(new ErrorHandler(error.message, 500));
  } finally {
    session.endSession();
  }
});

// Submit assignment (for students)
exports.submitAssignment = catchAsyncErrors(async (req, res, next) => {
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    session.startTransaction();
    transactionStarted = true;

    // Verify student permissions
    const student = await Student.findOne({ user: req.user.id }).populate(
      "user",
      "name email"
    );

    if (!student) {
      return next(new ErrorHandler("Student not found", 404));
    }

    // Get the assignment
    const assignment = await Assignment.findById(req.params.assignmentId);
    if (!assignment) {
      return next(new ErrorHandler("Assignment not found", 404));
    }

    // Check if the student is enrolled in the course
    const course = await Course.findById(assignment.course);
    if (!course) {
      return next(new ErrorHandler("Course not found", 404));
    }

    const isEnrolled = student.courses.some((id) => id.equals(course._id));
    if (!isEnrolled) {
      return next(new ErrorHandler("Not enrolled in this course", 403));
    }

    // Check if the assignment is active
    if (!assignment.isActive) {
      return next(
        new ErrorHandler(
          "This assignment is no longer accepting submissions",
          400
        )
      );
    }

    // Check if file is provided
    if (!req.files || !req.files.submissionFile) {
      return next(new ErrorHandler("Please upload your submission file", 400));
    }

    const submissionFile = req.files.submissionFile;

    // Validate file type
    const validFileTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/jpeg",
      "image/png",
      "application/zip",
      "application/x-zip-compressed",
    ];

    if (!validFileTypes.includes(submissionFile.mimetype)) {
      return next(
        new ErrorHandler(
          "Invalid file type. Please upload a valid document.",
          400
        )
      );
    }

    // Check if past due date
    const now = new Date();
    const isDueDatePassed = now > assignment.dueDate;

    // Upload submission to S3
    const uploadedFile = await uploadFileToS3(
      submissionFile,
      `assignment-submissions/${assignment._id}`
    );

    // Check if already submitted
    const existingSubmission = assignment.submissions.find((sub) =>
      sub.student.equals(student._id)
    );

    if (existingSubmission) {
      // Update existing submission
      existingSubmission.submissionFile = uploadedFile.url;
      existingSubmission.submissionDate = now;
      existingSubmission.status = "submitted";
      existingSubmission.isLate = isDueDatePassed;
    } else {
      // Create new submission
      assignment.submissions.push({
        student: student._id,
        submissionFile: uploadedFile.url,
        submissionDate: now,
        status: "submitted",
        isLate: isDueDatePassed,
      });
    }

    await assignment.save({ session });
    await session.commitTransaction();
    transactionStarted = false;

    res.json({
      success: true,
      message: "Assignment submitted successfully",
      isLate: isDueDatePassed,
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error("Error aborting transaction:", abortError);
      }
    }
    return next(new ErrorHandler(error.message, 500));
  } finally {
    session.endSession();
  }
});

// Grade a submission (for teachers)
exports.gradeSubmission = catchAsyncErrors(async (req, res, next) => {
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    session.startTransaction();
    transactionStarted = true;

    // Verify teacher permissions
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      return next(new ErrorHandler("Teacher not found", 404));
    }

    // Get the assignment
    const assignment = await Assignment.findById(req.params.assignmentId);
    if (!assignment) {
      return next(new ErrorHandler("Assignment not found", 404));
    }

    // Check if the teacher owns the course
    const course = await Course.findOne({
      _id: assignment.course,
      teacher: teacher._id,
    });

    if (!course) {
      return next(
        new ErrorHandler("Unauthorized to grade this assignment", 403)
      );
    }

    const { grade, feedback } = req.body;

    if (!grade || grade < 0 || grade > assignment.totalPoints) {
      return next(
        new ErrorHandler(
          `Grade must be between 0 and ${assignment.totalPoints}`,
          400
        )
      );
    }

    // Find the submission
    const submissionIndex = assignment.submissions.findIndex(
      (sub) => sub._id.toString() === req.params.submissionId
    );

    if (submissionIndex === -1) {
      return next(new ErrorHandler("Submission not found", 404));
    }

    // Update grade and feedback
    assignment.submissions[submissionIndex].grade = grade;
    assignment.submissions[submissionIndex].feedback = feedback;
    assignment.submissions[submissionIndex].status = "graded";

    await assignment.save({ session });
    await session.commitTransaction();
    transactionStarted = false;

    res.json({
      success: true,
      message: "Submission graded successfully",
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error("Error aborting transaction:", abortError);
      }
    }
    return next(new ErrorHandler(error.message, 500));
  } finally {
    session.endSession();
  }
});
