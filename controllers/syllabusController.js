const mongoose = require("mongoose");
const Course = require("../models/Course");
const CourseSyllabus = require("../models/CourseSyllabus");
const Teacher = require("../models/Teacher");
const { ErrorHandler } = require("../middleware/errorHandler");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const AWS = require("aws-sdk");

// Configure AWS S3
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
    // Set up the S3 upload parameters without ACL
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

// Function to handle file uploads
const handleFileUploads = async (files, allowedTypes, next) => {
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
        `Invalid file type. Allowed types: PDF, PPT, PPTX`,
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

  // Upload files to S3
  console.log("Starting file uploads to S3");
  const uploadPromises = filesArray.map((file) =>
    uploadFileToS3(file, "syllabus-files")
  );

  const uploadedFiles = await Promise.all(uploadPromises);
  console.log(`Successfully uploaded ${uploadedFiles.length} files`);

  return { filesArray, uploadedFiles };
};

// Create file objects from uploaded files
const createFileObjects = (filesArray, uploadedFiles) => {
  const fileObjects = [];

  for (let i = 0; i < filesArray.length; i++) {
    const file = filesArray[i];
    const uploadedFile = uploadedFiles[i];
    const fileName = file.name;

    // Determine file type
    let fileType = "other";
    if (file.mimetype === "application/pdf") {
      fileType = "pdf";
    } else if (file.mimetype === "application/vnd.ms-powerpoint") {
      fileType = "ppt";
    } else if (
      file.mimetype ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    ) {
      fileType = "pptx";
    }

    fileObjects.push({
      fileType,
      fileUrl: uploadedFile.url,
      fileKey: uploadedFile.key,
      fileName,
      uploadDate: new Date(),
    });
  }

  return fileObjects;
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

// Update module with resources
exports.updateModule = catchAsyncErrors(async (req, res, next) => {
  console.log("updateModule: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;
  try {
    await session.startTransaction();
    transactionStarted = true;
    console.log("Transaction started");

    const { moduleNumber, moduleTitle, link } = req.body;
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

    // Update link if provided
    if (link !== undefined) {
      module.link = link;
    }

    // Initialize resources array if it doesn't exist
    if (!module.resources) {
      module.resources = [];
    }

    // Handle file uploads if any
    if (req.files && req.files.files) {
      try {
        const allowedTypes = [
          "application/pdf",
          "application/vnd.ms-powerpoint",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ];

        const { filesArray, uploadedFiles } = await handleFileUploads(
          req.files.files,
          allowedTypes,
          next
        );

        const fileObjects = createFileObjects(filesArray, uploadedFiles);

        // Add files to the module's resources
        module.resources.push(...fileObjects);
        console.log("New resources added to module");
      } catch (uploadError) {
        console.error("Error handling file uploads:", uploadError);
        return next(
          new ErrorHandler(
            uploadError.message || "Failed to upload files",
            uploadError.statusCode || 500
          )
        );
      }
    }

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

// Delete resource from module
exports.deleteResource = catchAsyncErrors(async (req, res, next) => {
  console.log("deleteResource: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;
    console.log("Transaction started");

    const { courseId, moduleId, resourceId } = req.params;

    console.log(
      `Deleting resource ${resourceId} from module ${moduleId} for course: ${courseId}`
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

    // Find the resource
    if (!module.resources) {
      console.log("No resources found in this module");
      return next(new ErrorHandler("No resources found in this module", 404));
    }

    const resourceIndex = module.resources.findIndex(
      (resource) => resource._id.toString() === resourceId
    );
    if (resourceIndex === -1) {
      console.log(`Resource not found: ${resourceId}`);
      return next(new ErrorHandler("Resource not found", 404));
    }

    // Get file key for S3 deletion
    const fileKey = module.resources[resourceIndex].fileKey;

    // Delete from S3 if needed
    try {
      console.log(`Deleting file from S3: ${fileKey}`);
      const params = {
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: fileKey,
      };

      await s3.deleteObject(params).promise();
      console.log("File deleted from S3");
    } catch (s3Error) {
      console.error("Error deleting file from S3:", s3Error);
      // Continue with the database deletion even if S3 deletion fails
    }

    // Remove resource from module
    module.resources.splice(resourceIndex, 1);

    console.log("Saving updated syllabus");
    await syllabus.save({ session });
    console.log("Resource removed from module");

    console.log("Committing transaction");
    await session.commitTransaction();
    transactionStarted = false;
    console.log("Transaction committed");

    res.status(200).json({
      success: true,
      message: "Resource deleted successfully",
      courseId: courseId,
      moduleId: moduleId,
      resourceId: resourceId,
    });
  } catch (error) {
    console.log(`Error in deleteResource: ${error.message}`);

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
