const Assignment = require("../models/Assignment");
const Course = require("../models/Course");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const mongoose = require("mongoose");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const { ErrorHandler } = require("../middleware/errorHandler");
const {
  uploadFileToAzure,
  deleteFileFromAzure,
} = require("../utils/azureConfig");

// Create new assignment
exports.createAssignment = catchAsyncErrors(async (req, res, next) => {
  console.log("createAssignment: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;
    console.log("Transaction started");

    const { title, description, dueDate, totalPoints } = req.body;
    const { courseId } = req.params; // Extract courseId from URL

    console.log(`Creating assignment for course: ${courseId}`);

    // Validate inputs
    if (!title || !description || !dueDate || !totalPoints) {
      console.log("Missing required fields");
      return next(new ErrorHandler("All fields are required", 400));
    }

    // Check if course exists
    const course = await Course.findById(courseId).session(session);
    if (!course) {
      console.log(`Course not found: ${courseId}`);
      return next(new ErrorHandler("Course not found", 404));
    }
    console.log("Course found");

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
      console.log("Processing file attachments");

      let attachmentsArray = Array.isArray(req.files.attachments)
        ? req.files.attachments
        : [req.files.attachments];

      console.log(`Found ${attachmentsArray.length} attachments`);

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
        console.log(
          `Validating file: ${file.name}, type: ${file.mimetype}, size: ${file.size}`
        );

        if (!allowedTypes.includes(file.mimetype)) {
          console.log(`Invalid file type: ${file.mimetype}`);
          return next(
            new ErrorHandler(
              `Invalid file type. Allowed types: PDF, JPEG, PNG, DOC, DOCX, XLS, XLSX`,
              400
            )
          );
        }

        // Validate file size (5MB)
        if (file.size > 5 * 1024 * 1024) {
          console.log(`File too large: ${file.size} bytes`);
          return next(
            new ErrorHandler(`File too large. Maximum size allowed is 5MB`, 400)
          );
        }
      }

      // Upload attachments to Azure
      try {
        console.log("Starting file uploads to Azure");

        const uploadPromises = attachmentsArray.map((file) =>
          uploadFileToAzure(file, "assignment-attachments")
        );

        const uploadedFiles = await Promise.all(uploadPromises);
        console.log(`Successfully uploaded ${uploadedFiles.length} files`);

        // Add attachments to assignment
        assignment.attachments = uploadedFiles.map((file) => ({
          name: file.key.split("/").pop(), // Extract filename from key
          url: file.url,
        }));

        console.log("Attachments added to assignment");
      } catch (uploadError) {
        console.error("Error uploading files:", uploadError);
        return next(new ErrorHandler("Failed to upload files", 500));
      }
    }

    console.log("Saving assignment");
    await assignment.save({ session });
    console.log(`Assignment saved with ID: ${assignment._id}`);

    // Add assignment to course's assignments array
    course.assignments = course.assignments || [];
    course.assignments.push(assignment._id);
    console.log("Updating course with new assignment");
    await course.save({ session });
    console.log("Course updated");

    console.log("Committing transaction");
    await session.commitTransaction();
    transactionStarted = false;
    console.log("Transaction committed");

    res.status(201).json({
      success: true,
      message: "Assignment created successfully",
      assignment,
    });
  } catch (error) {
    console.log(`Error in createAssignment: ${error.message}`);

    if (transactionStarted) {
      try {
        console.log("Aborting transaction");
        await session.abortTransaction();
        console.log("Transaction aborted");
      } catch (abortError) {
        console.error("Error aborting transaction:", abortError);
      }
    }

    return next(new ErrorHandler(error.message, 500));
  } finally {
    console.log("Ending session");
    await session.endSession();
    console.log("Session ended");
  }
});

// Submit assignment (for students)
exports.submitAssignment = catchAsyncErrors(async (req, res, next) => {
  console.log("submitAssignment: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;
    console.log("Transaction started");

    // Verify student permissions
    const student = await Student.findOne({ user: req.user.id }).populate(
      "user",
      "name email"
    );

    if (!student) {
      console.log("Student not found");
      return next(new ErrorHandler("Student not found", 404));
    }
    console.log("Student found:", student._id);

    // Get the assignment
    const assignment = await Assignment.findById(req.params.assignmentId);
    if (!assignment) {
      console.log("Assignment not found");
      return next(new ErrorHandler("Assignment not found", 404));
    }
    console.log("Assignment found:", assignment._id);

    // Check if the student is enrolled in the course
    const course = await Course.findById(assignment.course);
    if (!course) {
      console.log("Course not found");
      return next(new ErrorHandler("Course not found", 404));
    }

    const isEnrolled = student.courses.some((id) => id.equals(course._id));
    if (!isEnrolled) {
      console.log("Student not enrolled in course");
      return next(new ErrorHandler("Not enrolled in this course", 403));
    }
    console.log("Student is enrolled in the course");

    // Check if the assignment is active
    if (!assignment.isActive) {
      console.log("Assignment not active");
      return next(
        new ErrorHandler(
          "This assignment is no longer accepting submissions",
          400
        )
      );
    }

    // Check if file is provided
    if (!req.files || !req.files.submissionFile) {
      console.log("No submission file provided");
      return next(new ErrorHandler("Please upload your submission file", 400));
    }

    const submissionFile = req.files.submissionFile;
    console.log("Submission file details:", {
      name: submissionFile.name,
      size: submissionFile.size,
      mimetype: submissionFile.mimetype,
    });

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
      console.log("Invalid file type:", submissionFile.mimetype);
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
    console.log("Is submission late:", isDueDatePassed);

    try {
      // Upload submission to Azure
      console.log("Attempting Azure upload");
      const uploadedFile = await uploadFileToAzure(
        submissionFile,
        `assignment-submissions/${assignment._id}`
      );
      console.log("Azure upload successful:", uploadedFile.url);

      // Check if already submitted
      const existingSubmission = assignment.submissions.find((sub) =>
        sub.student.equals(student._id)
      );

      if (existingSubmission) {
        console.log("Updating existing submission");
        // Update existing submission
        existingSubmission.submissionFile = uploadedFile.url;
        existingSubmission.submissionDate = now;
        existingSubmission.status = "submitted";
        existingSubmission.isLate = isDueDatePassed;
      } else {
        console.log("Creating new submission");
        // Create new submission
        assignment.submissions.push({
          student: student._id,
          submissionFile: uploadedFile.url,
          submissionDate: now,
          status: "submitted",
          isLate: isDueDatePassed,
        });
      }

      console.log("Saving assignment");
      await assignment.save({ session });
      console.log("Assignment saved successfully");

      console.log("Committing transaction");
      await session.commitTransaction();
      transactionStarted = false;
      console.log("Transaction committed");

      res.json({
        success: true,
        message: "Assignment submitted successfully",
        isLate: isDueDatePassed,
      });
    } catch (uploadError) {
      console.log("Error during file upload:", uploadError.message);
      throw new Error(`File upload failed: ${uploadError.message}`);
    }
  } catch (error) {
    console.log("Error in submitAssignment:", error.message);

    if (transactionStarted) {
      try {
        console.log("Aborting transaction");
        await session.abortTransaction();
        console.log("Transaction aborted");
      } catch (abortError) {
        console.error("Error aborting transaction:", abortError);
      }
    }

    return next(new ErrorHandler(error.message, 500));
  } finally {
    console.log("Ending session");
    await session.endSession();
    console.log("Session ended");
  }
});

// Grade a submission (for teachers)
exports.gradeSubmission = catchAsyncErrors(async (req, res, next) => {
  console.log("gradeSubmission: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;
    console.log("Transaction started");

    // Verify teacher permissions
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      console.log("Teacher not found");
      return next(new ErrorHandler("Teacher not found", 404));
    }
    console.log("Teacher found:", teacher._id);

    // Get the assignment
    const assignment = await Assignment.findById(req.params.assignmentId);
    if (!assignment) {
      console.log("Assignment not found");
      return next(new ErrorHandler("Assignment not found", 404));
    }
    console.log("Assignment found:", assignment._id);

    // Check if the teacher owns the course
    const course = await Course.findOne({
      _id: assignment.course,
      teacher: teacher._id,
    });

    if (!course) {
      console.log("Teacher not authorized for this course");
      return next(
        new ErrorHandler("Unauthorized to grade this assignment", 403)
      );
    }
    console.log("Teacher authorized for course:", course._id);

    const { grade, feedback } = req.body;
    console.log(
      `Grading with: ${grade} points, feedback: ${
        feedback ? "provided" : "not provided"
      }`
    );

    if (!grade || grade < 0 || grade > assignment.totalPoints) {
      console.log(
        `Invalid grade: ${grade}, total points: ${assignment.totalPoints}`
      );
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
      console.log(`Submission not found: ${req.params.submissionId}`);
      return next(new ErrorHandler("Submission not found", 404));
    }
    console.log("Submission found at index:", submissionIndex);

    // Update grade and feedback
    assignment.submissions[submissionIndex].grade = grade;
    assignment.submissions[submissionIndex].feedback = feedback;
    assignment.submissions[submissionIndex].status = "graded";
    console.log("Submission updated with grade and feedback");

    console.log("Saving assignment");
    await assignment.save({ session });
    console.log("Assignment saved with graded submission");

    console.log("Committing transaction");
    await session.commitTransaction();
    transactionStarted = false;
    console.log("Transaction committed");

    res.json({
      success: true,
      message: "Submission graded successfully",
    });
  } catch (error) {
    console.log("Error in gradeSubmission:", error.message);

    if (transactionStarted) {
      try {
        console.log("Aborting transaction");
        await session.abortTransaction();
        console.log("Transaction aborted");
      } catch (abortError) {
        console.error("Error aborting transaction:", abortError);
      }
    }
    return next(new ErrorHandler(error.message, 500));
  } finally {
    console.log("Ending session");
    await session.endSession();
    console.log("Session ended");
  }
});

// Get all assignments for a course
exports.getCourseAssignments = catchAsyncErrors(async (req, res, next) => {
  console.log("getCourseAssignments: Started");
  try {
    // Get the course ID from request parameters
    const { courseId } = req.params;
    console.log(`Fetching assignments for course: ${courseId}`);

    // Find the course
    const course = await Course.findById(courseId);
    if (!course) {
      console.log("Course not found");
      return next(new ErrorHandler("Course not found", 404));
    }
    console.log("Course found");

    // Verify that the user has access to this course
    if (req.user.role === "teacher") {
      console.log("Verifying teacher access");
      const teacher = await Teacher.findOne({ user: req.user.id });
      if (!teacher || !course.teacher.equals(teacher._id)) {
        console.log("Teacher not authorized for this course");
        return next(new ErrorHandler("Unauthorized access", 403));
      }
      console.log("Teacher authorized");
    } else if (req.user.role === "student") {
      console.log("Verifying student access");
      const student = await Student.findOne({ user: req.user.id });
      if (!student || !student.courses.some((id) => id.equals(course._id))) {
        console.log("Student not enrolled in this course");
        return next(new ErrorHandler("Unauthorized access", 403));
      }
      console.log("Student authorized");
    }

    // Find all assignments for this course
    console.log("Fetching assignments");
    const assignments = await Assignment.find({ course: courseId }).sort({
      dueDate: 1,
    });
    console.log(`Found ${assignments.length} assignments`);

    // Filter submissions for students (they should only see their own)
    if (req.user.role === "student") {
      console.log("Filtering submissions for student");
      const student = await Student.findOne({ user: req.user.id });

      assignments.forEach((assignment) => {
        assignment.submissions = assignment.submissions.filter((submission) =>
          submission.student.equals(student._id)
        );
      });
      console.log("Submissions filtered");
    }

    res.status(200).json({
      success: true,
      assignments,
    });
  } catch (error) {
    console.log("Error in getCourseAssignments:", error.message);
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get a specific assignment by ID
exports.getAssignmentById = catchAsyncErrors(async (req, res, next) => {
  console.log("getAssignmentById: Started");
  try {
    const { assignmentId } = req.params;
    console.log(`Fetching assignment: ${assignmentId}`);

    // Find the assignment with course information
    const assignment = await Assignment.findById(assignmentId).populate(
      "course",
      "title"
    );

    if (!assignment) {
      console.log("Assignment not found");
      return next(new ErrorHandler("Assignment not found", 404));
    }
    console.log("Assignment found");

    // Verify that the user has access to this assignment's course
    if (req.user.role === "teacher") {
      console.log("Verifying teacher access");
      const teacher = await Teacher.findOne({ user: req.user.id });
      const course = await Course.findById(assignment.course);

      if (!teacher || !course.teacher.equals(teacher._id)) {
        console.log("Teacher not authorized for this course");
        return next(new ErrorHandler("Unauthorized access", 403));
      }
      console.log("Teacher authorized");
    } else if (req.user.role === "student") {
      console.log("Verifying student access");
      const student = await Student.findOne({ user: req.user.id });

      // Check if student is enrolled in the course
      if (
        !student ||
        !student.courses.some((id) => id.equals(assignment.course._id))
      ) {
        console.log("Student not enrolled in this course");
        return next(new ErrorHandler("Unauthorized access", 403));
      }
      console.log("Student authorized");

      // Replace the student ID with req.user.id in each submission for this student
      assignment.submissions = assignment.submissions
        .filter((submission) => submission.student.equals(student._id))
        .map((submission) => {
          // Create a new object to avoid modifying the original
          const modifiedSubmission = {
            ...submission.toObject(), // Convert to plain object if it's a Mongoose document
            student: req.user.id, // Replace student field with req.user.id
          };
          return modifiedSubmission;
        });

      console.log("Submissions modified for student");
    }

    res.status(200).json({
      success: true,
      assignment,
    });
  } catch (error) {
    console.log("Error in getAssignmentById:", error.message);
    return next(new ErrorHandler(error.message, 500));
  }
});

exports.updateAssignment = catchAsyncErrors(async (req, res, next) => {
  console.log("updateAssignment: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;
    console.log("Transaction started");

    const { assignmentId } = req.params;
    console.log(`Updating assignment: ${assignmentId}`);

    // Verify teacher permissions
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      console.log("Teacher not found");
      return next(new ErrorHandler("Teacher not found", 404));
    }
    console.log("Teacher found:", teacher._id);

    // Get the assignment
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      console.log("Assignment not found");
      return next(new ErrorHandler("Assignment not found", 404));
    }
    console.log("Assignment found:", assignment._id);

    // Check if the teacher owns the course
    const course = await Course.findOne({
      _id: assignment.course,
      teacher: teacher._id,
    });

    if (!course) {
      console.log("Teacher not authorized for this course");
      return next(
        new ErrorHandler("Unauthorized to update this assignment", 403)
      );
    }
    console.log("Teacher authorized for course:", course._id);

    // Extract update fields
    const { title, description, dueDate, totalPoints, isActive } = req.body;

    // Update assignment fields if provided
    if (title) assignment.title = title;
    if (description) assignment.description = description;
    if (dueDate) assignment.dueDate = dueDate;
    if (totalPoints) assignment.totalPoints = totalPoints;
    if (isActive !== undefined) assignment.isActive = isActive;

    // Handle file uploads if any
    if (req.files && req.files.attachments) {
      console.log("Processing new file attachments");

      let attachmentsArray = Array.isArray(req.files.attachments)
        ? req.files.attachments
        : [req.files.attachments];

      console.log(`Found ${attachmentsArray.length} new attachments`);

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
        console.log(
          `Validating file: ${file.name}, type: ${file.mimetype}, size: ${file.size}`
        );

        if (!allowedTypes.includes(file.mimetype)) {
          console.log(`Invalid file type: ${file.mimetype}`);
          return next(
            new ErrorHandler(
              `Invalid file type. Allowed types: PDF, JPEG, PNG, DOC, DOCX, XLS, XLSX`,
              400
            )
          );
        }

        // Validate file size (5MB)
        if (file.size > 5 * 1024 * 1024) {
          console.log(`File too large: ${file.size} bytes`);
          return next(
            new ErrorHandler(`File too large. Maximum size allowed is 5MB`, 400)
          );
        }
      }

      // Upload new attachments to Azure
      try {
        console.log("Starting file uploads to Azure");

        const uploadPromises = attachmentsArray.map((file) =>
          uploadFileToAzure(file, "assignment-attachments")
        );

        const uploadedFiles = await Promise.all(uploadPromises);
        console.log(`Successfully uploaded ${uploadedFiles.length} files`);

        // Handle attachment replacement options
        const { replaceAttachments } = req.body;

        if (replaceAttachments === "true") {
          // Replace all existing attachments
          assignment.attachments = uploadedFiles.map((file) => ({
            name: file.key.split("/").pop(), // Extract filename from key
            url: file.url,
          }));
          console.log("Replaced all attachments");
        } else {
          // Append new attachments to existing ones
          const newAttachments = uploadedFiles.map((file) => ({
            name: file.key.split("/").pop(),
            url: file.url,
          }));

          assignment.attachments = [
            ...assignment.attachments,
            ...newAttachments,
          ];
          console.log("Added new attachments to existing ones");
        }
      } catch (uploadError) {
        console.error("Error uploading files:", uploadError);
        return next(new ErrorHandler("Failed to upload files", 500));
      }
    }

    // Remove specific attachments if requested
    if (req.body.removeAttachments) {
      const attachmentsToRemove = Array.isArray(req.body.removeAttachments)
        ? req.body.removeAttachments
        : [req.body.removeAttachments];

      console.log(`Removing ${attachmentsToRemove.length} attachments`);

      assignment.attachments = assignment.attachments.filter(
        (attachment) => !attachmentsToRemove.includes(attachment._id.toString())
      );

      console.log("Attachments removed");
    }

    console.log("Saving updated assignment");
    await assignment.save({ session });
    console.log("Assignment updated successfully");

    console.log("Committing transaction");
    await session.commitTransaction();
    transactionStarted = false;
    console.log("Transaction committed");

    res.status(200).json({
      success: true,
      message: "Assignment updated successfully",
      assignment,
    });
  } catch (error) {
    console.log(`Error in updateAssignment: ${error.message}`);

    if (transactionStarted) {
      try {
        console.log("Aborting transaction");
        await session.abortTransaction();
        console.log("Transaction aborted");
      } catch (abortError) {
        console.error("Error aborting transaction:", abortError);
      }
    }

    return next(new ErrorHandler(error.message, 500));
  } finally {
    console.log("Ending session");
    await session.endSession();
    console.log("Session ended");
  }
});

// Delete assignment
exports.deleteAssignment = catchAsyncErrors(async (req, res, next) => {
  console.log("deleteAssignment: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;
    console.log("Transaction started");

    const { assignmentId } = req.params;
    console.log(`Deleting assignment: ${assignmentId}`);

    // Verify teacher permissions
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      console.log("Teacher not found");
      return next(new ErrorHandler("Teacher not found", 404));
    }
    console.log("Teacher found:", teacher._id);

    // Get the assignment
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      console.log("Assignment not found");
      return next(new ErrorHandler("Assignment not found", 404));
    }
    console.log("Assignment found:", assignment._id);

    // Get the course and verify ownership
    const course = await Course.findOne({
      _id: assignment.course,
      teacher: teacher._id,
    });

    if (!course) {
      console.log("Teacher not authorized for this course");
      return next(
        new ErrorHandler("Unauthorized to delete this assignment", 403)
      );
    }
    console.log("Teacher authorized for course:", course._id);

    // Remove assignment from course
    console.log("Removing assignment from course");
    course.assignments = course.assignments.filter(
      (id) => !id.equals(assignment._id)
    );
    await course.save({ session });
    console.log("Course updated");

    // Delete Azure files if needed (optional in this implementation)
    // This would require listing and deleting objects with the prefix:
    // `assignment-attachments/${assignment._id}`
    // and `assignment-submissions/${assignment._id}`
    // For brevity, this is left as a comment

    // Delete the assignment
    console.log("Deleting assignment document");
    await Assignment.findByIdAndDelete(assignmentId).session(session);
    console.log("Assignment deleted");

    console.log("Committing transaction");
    await session.commitTransaction();
    transactionStarted = false;
    console.log("Transaction committed");

    res.status(200).json({
      success: true,
      message: "Assignment deleted successfully",
    });
  } catch (error) {
    console.log(`Error in deleteAssignment: ${error.message}`);

    if (transactionStarted) {
      try {
        console.log("Aborting transaction");
        await session.abortTransaction();
        console.log("Transaction aborted");
      } catch (abortError) {
        console.error("Error aborting transaction:", abortError);
      }
    }

    return next(new ErrorHandler(error.message, 500));
  } finally {
    console.log("Ending session");
    await session.endSession();
    console.log("Session ended");
  }
});
