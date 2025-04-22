const mongoose = require("mongoose");
const Discussion = require("../models/Discussion");
const Course = require("../models/Course");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const { ErrorHandler } = require("../middleware/errorHandler");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const AWS = require("aws-sdk");

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// Helper function for uploading files to S3
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

// Helper function to delete files from S3
const deleteFileFromS3 = async (fileKey) => {
  console.log("Deleting file from S3:", fileKey);
  return new Promise((resolve, reject) => {
    if (!fileKey) {
      console.log("No file key provided");
      return resolve({ message: "No file key provided" });
    }

    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileKey,
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

// Create a new discussion
exports.createDiscussion = catchAsyncErrors(async (req, res, next) => {
  console.log("createDiscussion: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;
    console.log("Transaction started");

    const { title, content } = req.body;
    let { courseId } = req.params;

    // Determine discussion type based on route and courseId
    const type = courseId ? "course" : "teacher";

    // Validate inputs
    if (!title || !content) {
      console.log("Missing required fields");
      return next(new ErrorHandler("Title and content are required", 400));
    }

    // Find the teacher
    const teacher = await Teacher.findOne({ user: req.user._id }).session(
      session
    );
    if (!teacher) {
      console.log("Teacher not found");
      return next(new ErrorHandler("Teacher not found", 404));
    }

    // For course discussions, validate course
    if (type === "course") {
      if (!courseId) {
        console.log("Course ID required for course discussions");
        return next(
          new ErrorHandler("Course ID is required for course discussions", 400)
        );
      }

      const course = await Course.findOne({
        _id: courseId,
        teacher: teacher._id,
      }).session(session);

      if (!course) {
        console.log("Course not found or teacher doesn't have access");
        return next(new ErrorHandler("Course not found or unauthorized", 404));
      }
    }

    // Create discussion object
    const discussion = new Discussion({
      title,
      content,
      author: req.user._id,
      type,
      course: type === "course" ? courseId : null,
      attachments: [],
    });

    // Handle file uploads if any
    if (req.files && req.files.attachments) {
      try {
        let attachmentsArray = Array.isArray(req.files.attachments)
          ? req.files.attachments
          : [req.files.attachments];

        console.log(`Found ${attachmentsArray.length} attachments`);

        // Validate file types and sizes
        for (const file of attachmentsArray) {
          console.log(`Validating file: ${file.name}, size: ${file.size}`);

          // 5MB limit
          if (file.size > 5 * 1024 * 1024) {
            console.log(`File too large: ${file.size} bytes`);
            return next(
              new ErrorHandler(
                "File too large. Maximum size allowed is 5MB",
                400
              )
            );
          }
        }

        // Upload files to S3
        const uploadPromises = attachmentsArray.map((file) =>
          uploadFileToS3(file, "discussion-attachments")
        );

        const uploadedFiles = await Promise.all(uploadPromises);
        console.log(`Successfully uploaded ${uploadedFiles.length} files`);

        // Add attachments to discussion
        discussion.attachments = uploadedFiles.map((file) => ({
          fileUrl: file.url,
          fileKey: file.key,
          fileName: file.key.split("/").pop(), // Extract filename from key
        }));
      } catch (uploadError) {
        console.error("Error uploading files:", uploadError);
        return next(new ErrorHandler("Failed to upload files", 500));
      }
    }

    // Save discussion
    await discussion.save({ session });
    console.log(`Discussion saved with ID: ${discussion._id}`);

    await session.commitTransaction();
    transactionStarted = false;
    console.log("Transaction committed");

    res.status(201).json({
      success: true,
      message: "Discussion created successfully",
      discussion,
    });
  } catch (error) {
    console.log(`Error in createDiscussion: ${error.message}`);

    if (transactionStarted) {
      try {
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

// Get all teacher discussions
exports.getTeacherDiscussions = catchAsyncErrors(async (req, res, next) => {
  console.log("getTeacherDiscussions: Started");

  try {
    const discussions = await Discussion.find({ type: "teacher" })
      .populate({
        path: "author",
        select: "name email",
      })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: discussions.length,
      discussions,
    });
  } catch (error) {
    console.log(`Error in getTeacherDiscussions: ${error.message}`);
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get course discussions
exports.getCourseDiscussions = catchAsyncErrors(async (req, res, next) => {
  console.log("getCourseDiscussions: Started");
  const { courseId } = req.params;

  try {
    // Verify user has access to this course
    if (req.user.role === "teacher") {
      const teacher = await Teacher.findOne({ user: req.user._id });
      if (!teacher) {
        return next(new ErrorHandler("Teacher not found", 404));
      }

      const course = await Course.findOne({
        _id: courseId,
        teacher: teacher._id,
      });

      if (!course) {
        return next(new ErrorHandler("Course not found or unauthorized", 404));
      }
    } else if (req.user.role === "student") {
      const student = await Student.findOne({ user: req.user._id });
      if (!student) {
        return next(new ErrorHandler("Student not found", 404));
      }

      const isEnrolled = student.courses.some(
        (id) => id.toString() === courseId
      );
      if (!isEnrolled) {
        return next(
          new ErrorHandler("You are not enrolled in this course", 403)
        );
      }
    }

    // Get discussions for this course
    const discussions = await Discussion.find({
      course: courseId,
      type: "course",
    })
      .populate({
        path: "author",
        select: "name email",
      })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: discussions.length,
      discussions,
    });
  } catch (error) {
    console.log(`Error in getCourseDiscussions: ${error.message}`);
    return next(new ErrorHandler(error.message, 500));
  }
});

// Get a single discussion by ID
exports.getDiscussionById = catchAsyncErrors(async (req, res, next) => {
  console.log("getDiscussionById: Started");
  const { discussionId } = req.params;

  try {
    // Find the discussion and populate author info for the discussion and all comments
    const discussion = await Discussion.findById(discussionId)
      .populate({
        path: "author",
        select: "name email",
      })
      .populate({
        path: "comments.author",
        select: "name email",
      })
      .populate({
        path: "comments.replies.author",
        select: "name email",
      });

    if (!discussion) {
      return next(new ErrorHandler("Discussion not found", 404));
    }

    // If it's a course discussion, verify user has access
    if (discussion.type === "course") {
      if (req.user.role === "teacher") {
        const teacher = await Teacher.findOne({ user: req.user._id });
        if (!teacher) {
          return next(new ErrorHandler("Teacher not found", 404));
        }

        if (discussion.course) {
          const course = await Course.findOne({
            _id: discussion.course,
            teacher: teacher._id,
          });

          if (!course) {
            return next(new ErrorHandler("Unauthorized access", 403));
          }
        }
      } else if (req.user.role === "student") {
        const student = await Student.findOne({ user: req.user._id });
        if (!student) {
          return next(new ErrorHandler("Student not found", 404));
        }

        if (discussion.course) {
          const isEnrolled = student.courses.some(
            (id) => id.toString() === discussion.course.toString()
          );
          if (!isEnrolled) {
            return next(
              new ErrorHandler("You are not enrolled in this course", 403)
            );
          }
        }
      }
    }
    // If it's a teacher discussion, verify user is a teacher
    else if (discussion.type === "teacher" && req.user.role !== "teacher") {
      return next(new ErrorHandler("Unauthorized access", 403));
    }

    // Increment view count
    discussion.viewCount += 1;
    await discussion.save();

    res.status(200).json({
      success: true,
      discussion,
    });
  } catch (error) {
    console.log(`Error in getDiscussionById: ${error.message}`);
    return next(new ErrorHandler(error.message, 500));
  }
});

// Add comment to a discussion (top-level comment)
exports.addComment = catchAsyncErrors(async (req, res, next) => {
  console.log("addComment: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;

    const { discussionId } = req.params;
    const { content } = req.body;

    if (!content) {
      return next(new ErrorHandler("Comment content is required", 400));
    }

    const discussion = await Discussion.findById(discussionId).session(session);
    if (!discussion) {
      return next(new ErrorHandler("Discussion not found", 404));
    }

    // Verify user has permission to comment
    if (discussion.type === "teacher" && req.user.role !== "teacher") {
      return next(
        new ErrorHandler(
          "You are not authorized to comment on this discussion",
          403
        )
      );
    } else if (discussion.type === "course") {
      if (req.user.role === "teacher") {
        const teacher = await Teacher.findOne({ user: req.user._id });
        if (!teacher) {
          return next(new ErrorHandler("Teacher not found", 404));
        }

        if (discussion.course) {
          const course = await Course.findOne({
            _id: discussion.course,
            teacher: teacher._id,
          });

          if (!course) {
            return next(new ErrorHandler("Unauthorized access", 403));
          }
        }
      } else if (req.user.role === "student") {
        const student = await Student.findOne({ user: req.user._id });
        if (!student) {
          return next(new ErrorHandler("Student not found", 404));
        }

        if (discussion.course) {
          const isEnrolled = student.courses.some(
            (id) => id.toString() === discussion.course.toString()
          );
          if (!isEnrolled) {
            return next(
              new ErrorHandler("You are not enrolled in this course", 403)
            );
          }
        }
      }
    }

    // Create comment object
    const comment = {
      content,
      author: req.user._id,
      parentComment: null, // This is a top-level comment
      attachments: [],
      replies: [],
    };

    // Handle file uploads if any
    if (req.files && req.files.attachments) {
      try {
        let attachmentsArray = Array.isArray(req.files.attachments)
          ? req.files.attachments
          : [req.files.attachments];

        console.log(`Found ${attachmentsArray.length} attachments for comment`);

        // Validate file sizes (5MB limit)
        for (const file of attachmentsArray) {
          if (file.size > 5 * 1024 * 1024) {
            return next(
              new ErrorHandler(
                "File too large. Maximum size allowed is 5MB",
                400
              )
            );
          }
        }

        // Upload files to S3
        const uploadPromises = attachmentsArray.map((file) =>
          uploadFileToS3(file, "comment-attachments")
        );

        const uploadedFiles = await Promise.all(uploadPromises);

        // Add attachments to comment
        comment.attachments = uploadedFiles.map((file) => ({
          fileUrl: file.url,
          fileKey: file.key,
          fileName: file.key.split("/").pop(),
        }));
      } catch (uploadError) {
        console.error("Error uploading comment attachments:", uploadError);
        return next(new ErrorHandler("Failed to upload files", 500));
      }
    }

    // Add comment to discussion
    discussion.comments.push(comment);
    await discussion.save({ session });

    await session.commitTransaction();
    transactionStarted = false;

    // Populate author information for response
    await discussion.populate({
      path: "comments.author",
      select: "name email",
      model: "User",
    });

    const addedComment = discussion.comments[discussion.comments.length - 1];

    res.status(201).json({
      success: true,
      message: "Comment added successfully",
      comment: addedComment,
    });
  } catch (error) {
    console.log(`Error in addComment: ${error.message}`);

    if (transactionStarted) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error("Error aborting transaction:", abortError);
      }
    }

    return next(new ErrorHandler(error.message, 500));
  } finally {
    await session.endSession();
  }
});

// Add reply to a comment (nested comment)
exports.addReplyToComment = catchAsyncErrors(async (req, res, next) => {
  console.log("addReplyToComment: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;

    const { discussionId, commentId } = req.params;
    const { content } = req.body;

    if (!content) {
      return next(new ErrorHandler("Reply content is required", 400));
    }

    const discussion = await Discussion.findById(discussionId).session(session);
    if (!discussion) {
      return next(new ErrorHandler("Discussion not found", 404));
    }

    // Verify user has permission to comment (same as for regular comments)
    if (discussion.type === "teacher" && req.user.role !== "teacher") {
      return next(
        new ErrorHandler(
          "You are not authorized to comment on this discussion",
          403
        )
      );
    } else if (discussion.type === "course") {
      if (req.user.role === "teacher") {
        const teacher = await Teacher.findOne({ user: req.user._id });
        if (!teacher) {
          return next(new ErrorHandler("Teacher not found", 404));
        }

        if (discussion.course) {
          const course = await Course.findOne({
            _id: discussion.course,
            teacher: teacher._id,
          });

          if (!course) {
            return next(new ErrorHandler("Unauthorized access", 403));
          }
        }
      } else if (req.user.role === "student") {
        const student = await Student.findOne({ user: req.user._id });
        if (!student) {
          return next(new ErrorHandler("Student not found", 404));
        }

        if (discussion.course) {
          const isEnrolled = student.courses.some(
            (id) => id.toString() === discussion.course.toString()
          );
          if (!isEnrolled) {
            return next(
              new ErrorHandler("You are not enrolled in this course", 403)
            );
          }
        }
      }
    }

    // Find the comment to reply to
    // Helper function to find a comment in the nested structure
    const findCommentById = (comments, id) => {
      for (let i = 0; i < comments.length; i++) {
        if (comments[i]._id.toString() === id) {
          return { comment: comments[i], path: `comments.${i}` };
        }
        if (comments[i].replies && comments[i].replies.length > 0) {
          for (let j = 0; j < comments[i].replies.length; j++) {
            if (comments[i].replies[j]._id.toString() === id) {
              return {
                comment: comments[i].replies[j],
                path: `comments.${i}.replies.${j}`,
              };
            }
            // Could go deeper for more levels if needed
          }
        }
      }
      return null;
    };

    const result = findCommentById(discussion.comments, commentId);
    if (!result) {
      return next(new ErrorHandler("Comment not found", 404));
    }

    // Create reply object
    const reply = {
      content,
      author: req.user._id,
      parentComment: commentId,
      attachments: [],
    };

    // Handle file uploads if any
    if (req.files && req.files.attachments) {
      try {
        let attachmentsArray = Array.isArray(req.files.attachments)
          ? req.files.attachments
          : [req.files.attachments];

        console.log(`Found ${attachmentsArray.length} attachments for reply`);

        // Validate file sizes (5MB limit)
        for (const file of attachmentsArray) {
          if (file.size > 5 * 1024 * 1024) {
            return next(
              new ErrorHandler(
                "File too large. Maximum size allowed is 5MB",
                400
              )
            );
          }
        }

        // Upload files to S3
        const uploadPromises = attachmentsArray.map((file) =>
          uploadFileToS3(file, "comment-attachments")
        );

        const uploadedFiles = await Promise.all(uploadPromises);

        // Add attachments to reply
        reply.attachments = uploadedFiles.map((file) => ({
          fileUrl: file.url,
          fileKey: file.key,
          fileName: file.key.split("/").pop(),
        }));
      } catch (uploadError) {
        console.error("Error uploading reply attachments:", uploadError);
        return next(new ErrorHandler("Failed to upload files", 500));
      }
    }

    // Add reply to comment
    result.comment.replies = result.comment.replies || [];
    result.comment.replies.push(reply);
    await discussion.save({ session });

    await session.commitTransaction();
    transactionStarted = false;

    // Populate author information for response
    await discussion.populate({
      path: "comments.author comments.replies.author",
      select: "name email",
      model: "User",
    });

    // Find the added reply
    const updatedResult = findCommentById(discussion.comments, commentId);
    const addedReply =
      updatedResult.comment.replies[updatedResult.comment.replies.length - 1];

    res.status(201).json({
      success: true,
      message: "Reply added successfully",
      reply: addedReply,
    });
  } catch (error) {
    console.log(`Error in addReplyToComment: ${error.message}`);

    if (transactionStarted) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error("Error aborting transaction:", abortError);
      }
    }

    return next(new ErrorHandler(error.message, 500));
  } finally {
    await session.endSession();
  }
});

// Update a discussion
exports.updateDiscussion = catchAsyncErrors(async (req, res, next) => {
  console.log("updateDiscussion: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;

    const { discussionId } = req.params;
    const { title, content } = req.body;

    // Find the discussion
    const discussion = await Discussion.findById(discussionId).session(session);
    if (!discussion) {
      return next(new ErrorHandler("Discussion not found", 404));
    }

    // Verify the user is the author of the discussion
    if (discussion.author.toString() !== req.user._id.toString()) {
      return next(
        new ErrorHandler("You can only update your own discussions", 403)
      );
    }

    // Update discussion fields
    if (title) discussion.title = title;
    if (content) discussion.content = content;

    // Handle new attachments if any
    if (req.files && req.files.attachments) {
      try {
        let attachmentsArray = Array.isArray(req.files.attachments)
          ? req.files.attachments
          : [req.files.attachments];

        // Validate file sizes
        for (const file of attachmentsArray) {
          if (file.size > 5 * 1024 * 1024) {
            return next(
              new ErrorHandler(
                "File too large. Maximum size allowed is 5MB",
                400
              )
            );
          }
        }

        // Upload files to S3
        const uploadPromises = attachmentsArray.map((file) =>
          uploadFileToS3(file, "discussion-attachments")
        );

        const uploadedFiles = await Promise.all(uploadPromises);

        // Add new attachments to discussion
        const newAttachments = uploadedFiles.map((file) => ({
          fileUrl: file.url,
          fileKey: file.key,
          fileName: file.key.split("/").pop(),
        }));

        discussion.attachments = [...discussion.attachments, ...newAttachments];
      } catch (uploadError) {
        console.error("Error uploading files:", uploadError);
        return next(new ErrorHandler("Failed to upload files", 500));
      }
    }

    // Remove attachments if specified
    if (req.body.removeAttachments && req.body.removeAttachments.length > 0) {
      let removeIds = Array.isArray(req.body.removeAttachments)
        ? req.body.removeAttachments
        : [req.body.removeAttachments];

      // Get attachments to remove
      const attachmentsToRemove = discussion.attachments.filter((att) =>
        removeIds.includes(att._id.toString())
      );

      // Delete files from S3
      for (const attachment of attachmentsToRemove) {
        try {
          await deleteFileFromS3(attachment.fileKey);
        } catch (deleteError) {
          console.error("Error deleting file from S3:", deleteError);
          // Continue with update even if S3 deletion fails
        }
      }

      // Filter out removed attachments
      discussion.attachments = discussion.attachments.filter(
        (att) => !removeIds.includes(att._id.toString())
      );
    }

    await discussion.save({ session });

    await session.commitTransaction();
    transactionStarted = false;

    res.status(200).json({
      success: true,
      message: "Discussion updated successfully",
      discussion,
    });
  } catch (error) {
    console.log(`Error in updateDiscussion: ${error.message}`);

    if (transactionStarted) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error("Error aborting transaction:", abortError);
      }
    }

    return next(new ErrorHandler(error.message, 500));
  } finally {
    await session.endSession();
  }
});

// Update a comment
exports.updateComment = catchAsyncErrors(async (req, res, next) => {
  console.log("updateComment: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;

    const { discussionId, commentId } = req.params;
    const { content } = req.body;

    if (!content) {
      return next(new ErrorHandler("Comment content is required", 400));
    }

    // Find the discussion
    const discussion = await Discussion.findById(discussionId).session(session);
    if (!discussion) {
      return next(new ErrorHandler("Discussion not found", 404));
    }

    // Find the comment
    const findCommentById = (comments, id) => {
      for (let i = 0; i < comments.length; i++) {
        if (comments[i]._id.toString() === id) {
          return { comment: comments[i], path: `comments.${i}` };
        }
        if (comments[i].replies && comments[i].replies.length > 0) {
          for (let j = 0; j < comments[i].replies.length; j++) {
            if (comments[i].replies[j]._id.toString() === id) {
              return {
                comment: comments[i].replies[j],
                path: `comments.${i}.replies.${j}`,
              };
            }
            // Could go deeper for more levels if needed
          }
        }
      }
      return null;
    };

    const result = findCommentById(discussion.comments, commentId);
    if (!result) {
      return next(new ErrorHandler("Comment not found", 404));
    }

    // Verify the user is the author of the comment
    if (result.comment.author.toString() !== req.user._id.toString()) {
      return next(
        new ErrorHandler("You can only update your own comments", 403)
      );
    }

    // Update the comment
    result.comment.content = content;

    // Handle file attachment updates if needed
    if (req.files && req.files.attachments) {
      try {
        let attachmentsArray = Array.isArray(req.files.attachments)
          ? req.files.attachments
          : [req.files.attachments];

        // Validate file sizes
        for (const file of attachmentsArray) {
          if (file.size > 5 * 1024 * 1024) {
            return next(
              new ErrorHandler(
                "File too large. Maximum size allowed is 5MB",
                400
              )
            );
          }
        }

        // Upload files to S3
        const uploadPromises = attachmentsArray.map((file) =>
          uploadFileToS3(file, "comment-attachments")
        );

        const uploadedFiles = await Promise.all(uploadPromises);

        // Add new attachments to comment
        const newAttachments = uploadedFiles.map((file) => ({
          fileUrl: file.url,
          fileKey: file.key,
          fileName: file.key.split("/").pop(),
        }));

        result.comment.attachments = [
          ...result.comment.attachments,
          ...newAttachments,
        ];
      } catch (uploadError) {
        console.error("Error uploading files:", uploadError);
        return next(new ErrorHandler("Failed to upload files", 500));
      }
    }

    // Remove attachments if specified
    if (req.body.removeAttachments && req.body.removeAttachments.length > 0) {
      let removeIds = Array.isArray(req.body.removeAttachments)
        ? req.body.removeAttachments
        : [req.body.removeAttachments];

      // Get attachments to remove
      const attachmentsToRemove = result.comment.attachments.filter((att) =>
        removeIds.includes(att._id.toString())
      );

      // Delete files from S3
      for (const attachment of attachmentsToRemove) {
        try {
          await deleteFileFromS3(attachment.fileKey);
        } catch (deleteError) {
          console.error("Error deleting file from S3:", deleteError);
          // Continue with update even if S3 deletion fails
        }
      }

      // Filter out removed attachments
      result.comment.attachments = result.comment.attachments.filter(
        (att) => !removeIds.includes(att._id.toString())
      );
    }

    await discussion.save({ session });

    await session.commitTransaction();
    transactionStarted = false;

    // Populate author information for response
    await discussion.populate({
      path: "comments.author comments.replies.author",
      select: "name email",
      model: "User",
    });

    res.status(200).json({
      success: true,
      message: "Comment updated successfully",
      comment: result.comment,
    });
  } catch (error) {
    console.log(`Error in updateComment: ${error.message}`);

    if (transactionStarted) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error("Error aborting transaction:", abortError);
      }
    }

    return next(new ErrorHandler(error.message, 500));
  } finally {
    await session.endSession();
  }
});

// Delete a comment (soft delete)
exports.deleteComment = catchAsyncErrors(async (req, res, next) => {
  console.log("deleteComment: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;

    const { discussionId, commentId } = req.params;

    // Find the discussion
    const discussion = await Discussion.findById(discussionId).session(session);
    if (!discussion) {
      return next(new ErrorHandler("Discussion not found", 404));
    }

    // Find the comment
    const findCommentById = (comments, id) => {
      for (let i = 0; i < comments.length; i++) {
        if (comments[i]._id.toString() === id) {
          return { comment: comments[i], path: `comments.${i}` };
        }
        if (comments[i].replies && comments[i].replies.length > 0) {
          for (let j = 0; j < comments[i].replies.length; j++) {
            if (comments[i].replies[j]._id.toString() === id) {
              return {
                comment: comments[i].replies[j],
                path: `comments.${i}.replies.${j}`,
              };
            }
          }
        }
      }
      return null;
    };

    const result = findCommentById(discussion.comments, commentId);
    if (!result) {
      return next(new ErrorHandler("Comment not found", 404));
    }

    // Verify the user is the author of the comment or the discussion author (teachers can delete any comment in their discussions)
    if (
      result.comment.author.toString() !== req.user._id.toString() &&
      discussion.author.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return next(
        new ErrorHandler("You can only delete your own comments", 403)
      );
    }

    // Soft delete the comment (don't remove it from the database)
    result.comment.isDeleted = true;
    result.comment.content = "This comment has been deleted";

    // Keep attachments reference for auditing purposes, but we could delete them from S3 to save storage
    // For now, we'll leave S3 cleanup to a separate background process or admin function

    await discussion.save({ session });

    await session.commitTransaction();
    transactionStarted = false;

    res.status(200).json({
      success: true,
      message: "Comment deleted successfully",
    });
  } catch (error) {
    console.log(`Error in deleteComment: ${error.message}`);

    if (transactionStarted) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error("Error aborting transaction:", abortError);
      }
    }

    return next(new ErrorHandler(error.message, 500));
  } finally {
    await session.endSession();
  }
});

// Delete a discussion
exports.deleteDiscussion = catchAsyncErrors(async (req, res, next) => {
  console.log("deleteDiscussion: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;

    const { discussionId } = req.params;

    // Find the discussion
    const discussion = await Discussion.findById(discussionId).session(session);
    if (!discussion) {
      return next(new ErrorHandler("Discussion not found", 404));
    }

    // Verify the user is the author of the discussion or an admin
    if (
      discussion.author.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return next(
        new ErrorHandler("You can only delete your own discussions", 403)
      );
    }

    // Delete all attachments from S3 (both from the discussion itself and its comments)
    const allAttachments = [...discussion.attachments];

    // Function to collect all attachments from comments and their replies
    const collectAttachments = (comments) => {
      let attachments = [];
      for (const comment of comments) {
        if (comment.attachments && comment.attachments.length > 0) {
          attachments.push(...comment.attachments);
        }
        if (comment.replies && comment.replies.length > 0) {
          attachments.push(...collectAttachments(comment.replies));
        }
      }
      return attachments;
    };

    // Add comment attachments
    allAttachments.push(...collectAttachments(discussion.comments));

    // Delete files from S3
    for (const attachment of allAttachments) {
      try {
        await deleteFileFromS3(attachment.fileKey);
      } catch (deleteError) {
        console.error("Error deleting file from S3:", deleteError);
        // Continue with deletion even if S3 deletion fails
      }
    }

    // Delete the discussion
    await Discussion.findByIdAndDelete(discussionId).session(session);

    await session.commitTransaction();
    transactionStarted = false;

    res.status(200).json({
      success: true,
      message: "Discussion deleted successfully",
    });
  } catch (error) {
    console.log(`Error in deleteDiscussion: ${error.message}`);

    if (transactionStarted) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error("Error aborting transaction:", abortError);
      }
    }

    return next(new ErrorHandler(error.message, 500));
  } finally {
    await session.endSession();
  }
});

// Search discussions
exports.searchDiscussions = catchAsyncErrors(async (req, res, next) => {
  console.log("searchDiscussions: Started");

  try {
    const { query, type, courseId } = req.query;

    if (!query) {
      return next(new ErrorHandler("Search query is required", 400));
    }

    // Build search criteria
    const searchCriteria = {
      $text: { $search: query },
    };

    // Add type filter if provided
    if (type && ["teacher", "course"].includes(type)) {
      searchCriteria.type = type;
    }

    // Add course filter if provided
    if (courseId) {
      searchCriteria.course = courseId;
    }

    // For teacher-only discussions, ensure user is a teacher
    if (type === "teacher" && req.user.role !== "teacher") {
      return next(new ErrorHandler("Unauthorized access", 403));
    }

    // If searching course discussions, verify user has access to the course
    if (type === "course" && courseId) {
      if (req.user.role === "teacher") {
        const teacher = await Teacher.findOne({ user: req.user._id });
        if (!teacher) {
          return next(new ErrorHandler("Teacher not found", 404));
        }

        const course = await Course.findOne({
          _id: courseId,
          teacher: teacher._id,
        });

        if (!course) {
          return next(
            new ErrorHandler("Course not found or unauthorized", 404)
          );
        }
      } else if (req.user.role === "student") {
        const student = await Student.findOne({ user: req.user._id });
        if (!student) {
          return next(new ErrorHandler("Student not found", 404));
        }

        const isEnrolled = student.courses.some(
          (id) => id.toString() === courseId
        );
        if (!isEnrolled) {
          return next(
            new ErrorHandler("You are not enrolled in this course", 403)
          );
        }
      }
    }

    // Perform the search
    const discussions = await Discussion.find(searchCriteria)
      .populate({
        path: "author",
        select: "name email",
      })
      .sort({ score: { $meta: "textScore" } })
      .limit(20);

    res.status(200).json({
      success: true,
      count: discussions.length,
      discussions,
    });
  } catch (error) {
    console.log(`Error in searchDiscussions: ${error.message}`);
    return next(new ErrorHandler(error.message, 500));
  }
});

module.exports = exports;
