const mongoose = require("mongoose");
const Course = require("../models/Course");
const CourseSyllabus = require("../models/CourseSyllabus");
const Teacher = require("../models/Teacher");
const { ErrorHandler } = require("../middleware/errorHandler");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const {
  uploadFileToAzure,
  deleteFileFromAzure,
} = require("../utils/azureConfig");

// Function to handle file uploads
const handleFileUploads = async (files, allowedTypes, path, next) => {
  console.log("Processing file uploads");

  let filesArray = Array.isArray(files) ? files : [files];
  console.log(`Found ${filesArray.length} files`);

  // Validate file types
  for (const file of filesArray) {
    console.log(
      `Validating file: ${file.name}, type: ${file.mimetype}, size: ${file.size}`
    );

    if (!allowedTypes.includes(file.mimetype)) {
      console.log(`Invalid file type: ${file.mimetype}`);
      throw new ErrorHandler(
        `Invalid file type. Allowed types: ${allowedTypes.join(", ")}`,
        400
      );
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      console.log(`File too large: ${file.size} bytes`);
      throw new ErrorHandler(
        `File too large. Maximum size allowed is 10MB`,
        400
      );
    }
  }

  // Upload files to Azure
  console.log("Starting file uploads to Azure");
  const uploadPromises = filesArray.map((file) =>
    uploadFileToAzure(file, path)
  );

  const uploadedFiles = await Promise.all(uploadPromises);
  console.log(`Successfully uploaded ${uploadedFiles.length} files`);

  return { filesArray, uploadedFiles };
};

// Get course syllabus
exports.getCourseSyllabus = catchAsyncErrors(async (req, res, next) => {
  console.log("getCourseSyllabus: Started");
  const { courseId } = req.params;

  console.log(`Fetching syllabus for course: ${courseId}`);

  // Check if course exists
  const course = await Course.findById(courseId);
  if (!course) {
    console.log(`Course not found: ${courseId}`);
    return next(new ErrorHandler("Course not found", 404));
  }

  // Find CourseSyllabus
  const syllabus = await CourseSyllabus.findOne({ course: courseId });
  if (!syllabus) {
    console.log(`No syllabus found for course: ${courseId}`);
    // Just return an empty result instead of an error
    return res.status(200).json({
      success: true,
      courseId: courseId,
      syllabus: { course: courseId, modules: [] },
    });
  }

  res.status(200).json({
    success: true,
    courseId: courseId,
    syllabus,
  });
});

// Get specific module by ID
exports.getModuleById = catchAsyncErrors(async (req, res, next) => {
  console.log("getModuleById: Started");
  const { courseId, moduleId } = req.params;

  console.log(`Fetching module ${moduleId} for course: ${courseId}`);

  // Find CourseSyllabus
  const syllabus = await CourseSyllabus.findOne({ course: courseId });
  if (!syllabus) {
    console.log(`No syllabus found for course: ${courseId}`);
    return next(new ErrorHandler("No syllabus found for this course", 404));
  }

  // Find specific module
  const module = syllabus.modules.id(moduleId);
  if (!module) {
    console.log(`Module not found: ${moduleId}`);
    return next(new ErrorHandler("Module not found", 404));
  }

  res.status(200).json({
    success: true,
    courseId: courseId,
    moduleId: moduleId,
    module,
  });
});

// Add content to module - handles all content types
exports.addModuleContent = catchAsyncErrors(async (req, res, next) => {
  console.log("addModuleContent: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;
    console.log("Transaction started");

    const { courseId, moduleId } = req.params;
    const { contentType, title, description } = req.body;

    console.log(
      `Adding ${contentType} content to module ${moduleId} for course: ${courseId}`
    );

    // Validate content type
    if (!["file", "link", "video", "text"].includes(contentType)) {
      return next(
        new ErrorHandler(
          "Invalid content type. Must be file, link, video, or text",
          400
        )
      );
    }

    // Check if teacher is authorized to modify this course
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      console.log("Teacher not found");
      return next(new ErrorHandler("Teacher not found", 404));
    }

    const course = await Course.findOne({
      _id: courseId,
      teacher: teacher._id,
    });

    if (!course) {
      console.log("Course not found or teacher not authorized");
      return next(new ErrorHandler("Course not found or unauthorized", 404));
    }

    // Find CourseSyllabus
    const syllabus = await CourseSyllabus.findOne({ course: courseId }).session(
      session
    );
    if (!syllabus) {
      console.log(`No syllabus found for course: ${courseId}`);
      return next(new ErrorHandler("No syllabus found for this course", 404));
    }

    // Find specific module
    const module = syllabus.modules.id(moduleId);
    if (!module) {
      console.log(`Module not found: ${moduleId}`);
      return next(new ErrorHandler("Module not found", 404));
    }

    // Initialize contentItems array if it doesn't exist
    if (!module.contentItems) {
      module.contentItems = [];
    }

    // Create base content item
    const contentItem = {
      type: contentType,
      title: title || "Untitled Content",
      description: description || "",
      order: module.contentItems.length + 1,
    };

    // Process content based on type
    switch (contentType) {
      case "file":
        // Handle file upload
        if (!req.files || !req.files.file) {
          return next(new ErrorHandler("No file uploaded", 400));
        }

        try {
          const allowedTypes = [
            "application/pdf",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "image/jpeg",
            "image/png",
            "image/gif",
          ];

          const { filesArray, uploadedFiles } = await handleFileUploads(
            req.files.file,
            allowedTypes,
            "syllabus-files",
            next
          );

          const file = filesArray[0];
          const uploadedFile = uploadedFiles[0];

          // Determine file type
          let fileType = "other";
          if (file.mimetype === "application/pdf") {
            fileType = "pdf";
          } else if (
            file.mimetype === "application/vnd.ms-powerpoint" ||
            file.mimetype ===
              "application/vnd.openxmlformats-officedocument.presentationml.presentation"
          ) {
            fileType = "presentation";
          } else if (
            file.mimetype === "application/msword" ||
            file.mimetype ===
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          ) {
            fileType = "document";
          } else if (file.mimetype.startsWith("image/")) {
            fileType = "image";
          }

          // Add file-specific properties
          contentItem.fileType = fileType;
          contentItem.fileName = file.name;
          contentItem.fileUrl = uploadedFile.url;
          contentItem.fileKey = uploadedFile.key;
        } catch (uploadError) {
          console.error("Error handling file upload:", uploadError);
          return next(
            new ErrorHandler(
              uploadError.message || "Failed to upload file",
              uploadError.statusCode || 500
            )
          );
        }
        break;

      case "link":
        // Handle link
        const { url } = req.body;
        if (!url) {
          return next(
            new ErrorHandler("URL is required for link content type", 400)
          );
        }

        contentItem.url = url;
        break;

      case "video":
        // Handle video
        const { videoUrl, videoProvider } = req.body;
        if (!videoUrl) {
          return next(
            new ErrorHandler(
              "Video URL is required for video content type",
              400
            )
          );
        }

        contentItem.videoUrl = videoUrl;
        contentItem.videoProvider = videoProvider || "other";

        // If video file is uploaded instead of URL
        if (req.files && req.files.videoFile) {
          try {
            const allowedTypes = ["video/mp4", "video/webm", "video/ogg"];

            const { filesArray, uploadedFiles } = await handleFileUploads(
              req.files.videoFile,
              allowedTypes,
              "syllabus-videos",
              next
            );

            const uploadedFile = uploadedFiles[0];

            // Override videoUrl with the uploaded file URL
            contentItem.videoUrl = uploadedFile.url;
            contentItem.videoKey = uploadedFile.key;
          } catch (uploadError) {
            console.error("Error handling video upload:", uploadError);
            return next(
              new ErrorHandler(
                uploadError.message || "Failed to upload video",
                uploadError.statusCode || 500
              )
            );
          }
        }
        break;

      case "text":
        // Handle text content
        const { content } = req.body;
        if (!content) {
          return next(
            new ErrorHandler("Content is required for text content type", 400)
          );
        }

        contentItem.content = content;
        break;
    }

    // Add new content item to module
    module.contentItems.push(contentItem);

    console.log("Saving updated syllabus");
    await syllabus.save({ session });
    console.log("Syllabus updated with new content item");

    console.log("Committing transaction");
    await session.commitTransaction();
    transactionStarted = false;
    console.log("Transaction committed");

    res.status(201).json({
      success: true,
      message: "Content added to module successfully",
      contentItem: module.contentItems[module.contentItems.length - 1],
    });
  } catch (error) {
    console.log(`Error in addModuleContent: ${error.message}`);
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

// Update module with resources
exports.updateModule = catchAsyncErrors(async (req, res, next) => {
  console.log("updateModule: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;
  try {
    await session.startTransaction();
    transactionStarted = true;
    console.log("Transaction started");

    const { moduleNumber, moduleTitle, description } = req.body;
    const { courseId, moduleId } = req.params;

    console.log(`Updating module ${moduleId} for course: ${courseId}`);

    // Check if teacher is authorized to modify this course
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      console.log("Teacher not found");
      return next(new ErrorHandler("Teacher not found", 404));
    }

    const course = await Course.findOne({
      _id: courseId,
      teacher: teacher._id,
    });

    if (!course) {
      console.log("Course not found or teacher not authorized");
      return next(new ErrorHandler("Course not found or unauthorized", 404));
    }

    // Find CourseSyllabus
    const syllabus = await CourseSyllabus.findOne({ course: courseId }).session(
      session
    );
    if (!syllabus) {
      console.log(`No syllabus found for course: ${courseId}`);
      return next(new ErrorHandler("No syllabus found for this course", 404));
    }

    // Find specific module
    const module = syllabus.modules.id(moduleId);
    if (!module) {
      console.log(`Module not found: ${moduleId}`);
      return next(new ErrorHandler("Module not found", 404));
    }

    // Update module details
    if (moduleNumber) module.moduleNumber = moduleNumber;
    if (moduleTitle) module.moduleTitle = moduleTitle;
    if (description !== undefined) module.description = description;

    console.log("Saving updated syllabus");
    await syllabus.save({ session });
    console.log("Syllabus updated");

    console.log("Committing transaction");
    await session.commitTransaction();
    transactionStarted = false;
    console.log("Transaction committed");

    res.status(200).json({
      success: true,
      message: "Module updated successfully",
      courseId: courseId,
      moduleId: moduleId,
      module: syllabus.modules.id(moduleId),
    });
  } catch (error) {
    console.log(`Error in updateModule: ${error.message}`);
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

// Update content item
exports.updateContentItem = catchAsyncErrors(async (req, res, next) => {
  console.log("updateContentItem: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;
    console.log("Transaction started");

    const { courseId, moduleId, contentId } = req.params;
    const { title, description } = req.body;

    console.log(
      `Updating content ${contentId} in module ${moduleId} for course: ${courseId}`
    );

    // Check if teacher is authorized to modify this course
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      console.log("Teacher not found");
      return next(new ErrorHandler("Teacher not found", 404));
    }

    const course = await Course.findOne({
      _id: courseId,
      teacher: teacher._id,
    });

    if (!course) {
      console.log("Course not found or teacher not authorized");
      return next(new ErrorHandler("Course not found or unauthorized", 404));
    }

    // Find CourseSyllabus
    const syllabus = await CourseSyllabus.findOne({ course: courseId }).session(
      session
    );
    if (!syllabus) {
      console.log(`No syllabus found for course: ${courseId}`);
      return next(new ErrorHandler("No syllabus found for this course", 404));
    }

    // Find specific module
    const module = syllabus.modules.id(moduleId);
    if (!module) {
      console.log(`Module not found: ${moduleId}`);
      return next(new ErrorHandler("Module not found", 404));
    }

    // Find content item
    if (!module.contentItems) {
      console.log("No content items found in this module");
      return next(
        new ErrorHandler("No content items found in this module", 404)
      );
    }

    const contentIndex = module.contentItems.findIndex(
      (item) => item._id.toString() === contentId
    );

    if (contentIndex === -1) {
      console.log(`Content item not found: ${contentId}`);
      return next(new ErrorHandler("Content item not found", 404));
    }

    const contentItem = module.contentItems[contentIndex];

    // Update basic fields
    if (title) contentItem.title = title;
    if (description !== undefined) contentItem.description = description;

    // Update specific fields based on content type
    switch (contentItem.type) {
      case "file":
        // Handle file replacement if new file is uploaded
        if (req.files && req.files.file) {
          try {
            const allowedTypes = [
              "application/pdf",
              "application/vnd.ms-powerpoint",
              "application/vnd.openxmlformats-officedocument.presentationml.presentation",
              "application/msword",
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              "image/jpeg",
              "image/png",
              "image/gif",
            ];

            const { filesArray, uploadedFiles } = await handleFileUploads(
              req.files.file,
              allowedTypes,
              "syllabus-files",
              next
            );

            const file = filesArray[0];
            const uploadedFile = uploadedFiles[0];

            // Delete old file from Azure if it exists
            if (contentItem.fileKey) {
              try {
                console.log(`Deleting file from Azure: ${contentItem.fileKey}`);
                await deleteFileFromAzure(contentItem.fileKey);
                console.log("Old file deleted from Azure");
              } catch (azureError) {
                console.error("Error deleting file from Azure:", azureError);
                // Continue with update even if Azure deletion fails
              }
            }

            // Determine file type
            let fileType = "other";
            if (file.mimetype === "application/pdf") {
              fileType = "pdf";
            } else if (
              file.mimetype === "application/vnd.ms-powerpoint" ||
              file.mimetype ===
                "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            ) {
              fileType = "presentation";
            } else if (
              file.mimetype === "application/msword" ||
              file.mimetype ===
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ) {
              fileType = "document";
            } else if (file.mimetype.startsWith("image/")) {
              fileType = "image";
            }

            // Update file properties
            contentItem.fileType = fileType;
            contentItem.fileName = file.name;
            contentItem.fileUrl = uploadedFile.url;
            contentItem.fileKey = uploadedFile.key;
          } catch (uploadError) {
            console.error("Error handling file upload:", uploadError);
            return next(
              new ErrorHandler(
                uploadError.message || "Failed to upload file",
                uploadError.statusCode || 500
              )
            );
          }
        }
        break;

      case "link":
        // Update link URL
        const { url } = req.body;
        if (url) {
          contentItem.url = url;
        }
        break;

      case "video":
        // Update video details
        const { videoUrl, videoProvider } = req.body;
        if (videoUrl) {
          contentItem.videoUrl = videoUrl;
        }
        if (videoProvider) {
          contentItem.videoProvider = videoProvider;
        }

        // If video file is uploaded instead of URL
        if (req.files && req.files.videoFile) {
          try {
            const allowedTypes = ["video/mp4", "video/webm", "video/ogg"];

            const { filesArray, uploadedFiles } = await handleFileUploads(
              req.files.videoFile,
              allowedTypes,
              "syllabus-videos",
              next
            );

            const uploadedFile = uploadedFiles[0];

            // Delete old video from Azure if it exists
            if (contentItem.videoKey) {
              try {
                console.log(
                  `Deleting video from Azure: ${contentItem.videoKey}`
                );
                await deleteFileFromAzure(contentItem.videoKey);
                console.log("Old video deleted from Azure");
              } catch (azureError) {
                console.error("Error deleting video from Azure:", azureError);
                // Continue with update even if Azure deletion fails
              }
            }

            // Override videoUrl with the uploaded file URL
            contentItem.videoUrl = uploadedFile.url;
            contentItem.videoKey = uploadedFile.key;
          } catch (uploadError) {
            console.error("Error handling video upload:", uploadError);
            return next(
              new ErrorHandler(
                uploadError.message || "Failed to upload video",
                uploadError.statusCode || 500
              )
            );
          }
        }
        break;

      case "text":
        // Update text content
        const { content } = req.body;
        if (content) {
          contentItem.content = content;
        }
        break;
    }

    // Update the item in the array
    module.contentItems[contentIndex] = contentItem;

    console.log("Saving updated syllabus");
    await syllabus.save({ session });
    console.log("Syllabus updated with modified content item");

    console.log("Committing transaction");
    await session.commitTransaction();
    transactionStarted = false;
    console.log("Transaction committed");

    res.status(200).json({
      success: true,
      message: "Content item updated successfully",
      contentItem: module.contentItems[contentIndex],
    });
  } catch (error) {
    console.log(`Error in updateContentItem: ${error.message}`);
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

// Delete content item
exports.deleteContentItem = catchAsyncErrors(async (req, res, next) => {
  console.log("deleteContentItem: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;
    console.log("Transaction started");

    const { courseId, moduleId, contentId } = req.params;

    console.log(
      `Deleting content ${contentId} from module ${moduleId} for course: ${courseId}`
    );

    // Check if teacher is authorized to modify this course
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      console.log("Teacher not found");
      return next(new ErrorHandler("Teacher not found", 404));
    }

    const course = await Course.findOne({
      _id: courseId,
      teacher: teacher._id,
    });

    if (!course) {
      console.log("Course not found or teacher not authorized");
      return next(new ErrorHandler("Course not found or unauthorized", 404));
    }

    // Find CourseSyllabus
    const syllabus = await CourseSyllabus.findOne({ course: courseId }).session(
      session
    );
    if (!syllabus) {
      console.log(`No syllabus found for course: ${courseId}`);
      return next(new ErrorHandler("No syllabus found for this course", 404));
    }

    // Find specific module
    const module = syllabus.modules.id(moduleId);
    if (!module) {
      console.log(`Module not found: ${moduleId}`);
      return next(new ErrorHandler("Module not found", 404));
    }

    // Find the content item
    if (!module.contentItems) {
      console.log("No content items found in this module");
      return next(
        new ErrorHandler("No content items found in this module", 404)
      );
    }

    const contentIndex = module.contentItems.findIndex(
      (item) => item._id.toString() === contentId
    );

    if (contentIndex === -1) {
      console.log(`Content item not found: ${contentId}`);
      return next(new ErrorHandler("Content item not found", 404));
    }

    const contentItem = module.contentItems[contentIndex];

    // Delete file from Azure if it's a file or video
    if (
      (contentItem.type === "file" && contentItem.fileKey) ||
      (contentItem.type === "video" && contentItem.videoKey)
    ) {
      const fileKey = contentItem.fileKey || contentItem.videoKey;
      try {
        console.log(`Deleting file from Azure: ${fileKey}`);
        await deleteFileFromAzure(fileKey);
        console.log("File deleted from Azure");
      } catch (azureError) {
        console.error("Error deleting file from Azure:", azureError);
        // Continue with the database deletion even if Azure deletion fails
      }
    }

    // Remove content item from module
    module.contentItems.splice(contentIndex, 1);

    console.log("Saving updated syllabus");
    await syllabus.save({ session });
    console.log("Content item removed from module");

    console.log("Committing transaction");
    await session.commitTransaction();
    transactionStarted = false;
    console.log("Transaction committed");

    res.status(200).json({
      success: true,
      message: "Content item deleted successfully",
      courseId: courseId,
      moduleId: moduleId,
      contentId: contentId,
    });
  } catch (error) {
    console.log(`Error in deleteContentItem: ${error.message}`);

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

module.exports = exports;
