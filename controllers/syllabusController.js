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
      `Validating file: ${file.name}, type: ${file.mimetype}, size: ${file.size}`,
    );

    if (!allowedTypes.includes(file.mimetype)) {
      console.log(`Invalid file type: ${file.mimetype}`);
      throw new ErrorHandler(
        `Invalid file type. Allowed types: ${allowedTypes.join(", ")}`,
        400,
      );
    }

    // Validate file size (50MB for videos, 10MB for others)
    const maxSize = allowedTypes.includes("video/mp4")
      ? 50 * 1024 * 1024
      : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      console.log(`File too large: ${file.size} bytes`);
      throw new ErrorHandler(
        `File too large. Maximum size allowed is ${maxSize / (1024 * 1024)}MB`,
        400,
      );
    }
  }

  // Upload files to Azure
  console.log("Starting file uploads to Azure");
  const uploadPromises = filesArray.map((file) =>
    uploadFileToAzure(file, path),
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

// Add video to module
exports.addVideoToModule = catchAsyncErrors(async (req, res, next) => {
  console.log("addVideoToModule: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;
    console.log("Transaction started");

    const { courseId, moduleId } = req.params;
    const { name, description } = req.body;

    console.log(`Adding video to module ${moduleId} for course: ${courseId}`);

    // Validate inputs
    if (!name) {
      return next(new ErrorHandler("Video name is required", 400));
    }

    // Check if teacher is authorized
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      return next(new ErrorHandler("Teacher not found", 404));
    }

    const course = await Course.findOne({
      _id: courseId,
      teachers: teacher._id,
    });

    if (!course) {
      return next(new ErrorHandler("Course not found or unauthorized", 404));
    }

    // Find syllabus and module
    const syllabus = await CourseSyllabus.findOne({ course: courseId }).session(
      session,
    );
    if (!syllabus) {
      return next(new ErrorHandler("No syllabus found for this course", 404));
    }

    const module = syllabus.modules.id(moduleId);
    if (!module) {
      return next(new ErrorHandler("Module not found", 404));
    }

    // Handle video file upload
    if (!req.files || !req.files.video) {
      return next(new ErrorHandler("Video file is required", 400));
    }

    const allowedVideoTypes = [
      "video/mp4",
      "video/webm",
      "video/avi",
      "video/mov",
    ];
    const { filesArray, uploadedFiles } = await handleFileUploads(
      req.files.video,
      allowedVideoTypes,
      `syllabus-videos/course-${courseId}/module-${moduleId}`,
      next,
    );

    const videoFile = filesArray[0];
    const uploadedVideo = uploadedFiles[0];

    // Handle thumbnail upload if provided
    let thumbnailData = { thumbnailUrl: "", thumbnailKey: "" };
    if (req.files && req.files.thumbnail) {
      const allowedImageTypes = [
        "image/jpeg",
        "image/png",
        "image/jpg",
        "image/gif",
      ];
      const { uploadedFiles: thumbnailFiles } = await handleFileUploads(
        req.files.thumbnail,
        allowedImageTypes,
        `syllabus-thumbnails/course-${courseId}/module-${moduleId}`,
        next,
      );
      thumbnailData.thumbnailUrl = thumbnailFiles[0].url;
      thumbnailData.thumbnailKey = thumbnailFiles[0].key;
    }

    // Create video object
    const videoData = {
      name,
      description: description || "",
      thumbnail: thumbnailData,
      fileUrl: uploadedVideo.url,
      fileKey: uploadedVideo.key,
      createDate: new Date(),
      isActive: true,
    };

    // Add video to module
    if (!module.videos) {
      module.videos = [];
    }
    module.videos.push(videoData);

    await syllabus.save({ session });

    await session.commitTransaction();
    transactionStarted = false;

    res.status(201).json({
      success: true,
      message: "Video added to module successfully",
      video: module.videos[module.videos.length - 1],
    });
  } catch (error) {
    console.log(`Error in addVideoToModule: ${error.message}`);
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

// Add link to module
exports.addLinkToModule = catchAsyncErrors(async (req, res, next) => {
  console.log("addLinkToModule: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;

    const { courseId, moduleId } = req.params;
    const { name, description, fileUrl } = req.body;

    // Validate inputs
    if (!name || !fileUrl) {
      return next(new ErrorHandler("Link name and URL are required", 400));
    }

    // Check if teacher is authorized
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      return next(new ErrorHandler("Teacher not found", 404));
    }

    const course = await Course.findOne({
      _id: courseId,
      teachers: teacher._id,
    });

    if (!course) {
      return next(new ErrorHandler("Course not found or unauthorized", 404));
    }

    // Find syllabus and module
    const syllabus = await CourseSyllabus.findOne({ course: courseId }).session(
      session,
    );
    if (!syllabus) {
      return next(new ErrorHandler("No syllabus found for this course", 404));
    }

    const module = syllabus.modules.id(moduleId);
    if (!module) {
      return next(new ErrorHandler("Module not found", 404));
    }

    // Handle thumbnail upload if provided
    let thumbnailData = { thumbnailUrl: "", thumbnailKey: "" };
    if (req.files && req.files.thumbnail) {
      const allowedImageTypes = [
        "image/jpeg",
        "image/png",
        "image/jpg",
        "image/gif",
      ];
      const { uploadedFiles: thumbnailFiles } = await handleFileUploads(
        req.files.thumbnail,
        allowedImageTypes,
        `syllabus-thumbnails/course-${courseId}/module-${moduleId}`,
        next,
      );
      thumbnailData.thumbnailUrl = thumbnailFiles[0].url;
      thumbnailData.thumbnailKey = thumbnailFiles[0].key;
    }

    // Create link object
    const linkData = {
      name,
      description: description || "",
      thumbnail: thumbnailData,
      fileUrl,
      createDate: new Date(),
      isActive: true,
    };

    // Add link to module
    if (!module.links) {
      module.links = [];
    }
    module.links.push(linkData);

    await syllabus.save({ session });

    await session.commitTransaction();
    transactionStarted = false;

    res.status(201).json({
      success: true,
      message: "Link added to module successfully",
      link: module.links[module.links.length - 1],
    });
  } catch (error) {
    console.log(`Error in addLinkToModule: ${error.message}`);
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

// Add PDF to module
exports.addPdfToModule = catchAsyncErrors(async (req, res, next) => {
  console.log("addPdfToModule: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;

    const { courseId, moduleId } = req.params;
    const { name, description } = req.body;

    // Validate inputs
    if (!name) {
      return next(new ErrorHandler("PDF name is required", 400));
    }

    // Check if teacher is authorized
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      return next(new ErrorHandler("Teacher not found", 404));
    }

    const course = await Course.findOne({
      _id: courseId,
      teachers: teacher._id,
    });

    if (!course) {
      return next(new ErrorHandler("Course not found or unauthorized", 404));
    }

    // Find syllabus and module
    const syllabus = await CourseSyllabus.findOne({ course: courseId }).session(
      session,
    );
    if (!syllabus) {
      return next(new ErrorHandler("No syllabus found for this course", 404));
    }

    const module = syllabus.modules.id(moduleId);
    if (!module) {
      return next(new ErrorHandler("Module not found", 404));
    }

    // Handle PDF file upload
    if (!req.files || !req.files.pdf) {
      return next(new ErrorHandler("PDF file is required", 400));
    }

    const allowedPdfTypes = ["application/pdf"];
    const { filesArray, uploadedFiles } = await handleFileUploads(
      req.files.pdf,
      allowedPdfTypes,
      `syllabus-pdfs/course-${courseId}/module-${moduleId}`,
      next,
    );

    const uploadedPdf = uploadedFiles[0];

    // Handle thumbnail upload if provided
    let thumbnailData = { thumbnailUrl: "", thumbnailKey: "" };
    if (req.files && req.files.thumbnail) {
      const allowedImageTypes = [
        "image/jpeg",
        "image/png",
        "image/jpg",
        "image/gif",
      ];
      const { uploadedFiles: thumbnailFiles } = await handleFileUploads(
        req.files.thumbnail,
        allowedImageTypes,
        `syllabus-thumbnails/course-${courseId}/module-${moduleId}`,
        next,
      );
      thumbnailData.thumbnailUrl = thumbnailFiles[0].url;
      thumbnailData.thumbnailKey = thumbnailFiles[0].key;
    }

    // Create PDF object
    const pdfData = {
      name,
      description: description || "",
      thumbnail: thumbnailData,
      fileUrl: uploadedPdf.url,
      fileKey: uploadedPdf.key,
      createDate: new Date(),
      isActive: true,
    };

    // Add PDF to module
    if (!module.pdfs) {
      module.pdfs = [];
    }
    module.pdfs.push(pdfData);

    await syllabus.save({ session });

    await session.commitTransaction();
    transactionStarted = false;

    res.status(201).json({
      success: true,
      message: "PDF added to module successfully",
      pdf: module.pdfs[module.pdfs.length - 1],
    });
  } catch (error) {
    console.log(`Error in addPdfToModule: ${error.message}`);
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

// Add PPT to module
exports.addPptToModule = catchAsyncErrors(async (req, res, next) => {
  console.log("addPptToModule: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;

    const { courseId, moduleId } = req.params;
    const { name, description } = req.body;

    // Validate inputs
    if (!name) {
      return next(new ErrorHandler("PPT name is required", 400));
    }

    // Check if teacher is authorized
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      return next(new ErrorHandler("Teacher not found", 404));
    }

    const course = await Course.findOne({
      _id: courseId,
      teachers: teacher._id,
    });

    if (!course) {
      return next(new ErrorHandler("Course not found or unauthorized", 404));
    }

    // Find syllabus and module
    const syllabus = await CourseSyllabus.findOne({ course: courseId }).session(
      session,
    );
    if (!syllabus) {
      return next(new ErrorHandler("No syllabus found for this course", 404));
    }

    const module = syllabus.modules.id(moduleId);
    if (!module) {
      return next(new ErrorHandler("Module not found", 404));
    }

    // Handle PPT file upload
    if (!req.files || !req.files.ppt) {
      return next(new ErrorHandler("PPT file is required", 400));
    }

    const allowedPptTypes = [
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ];
    const { filesArray, uploadedFiles } = await handleFileUploads(
      req.files.ppt,
      allowedPptTypes,
      `syllabus-ppts/course-${courseId}/module-${moduleId}`,
      next,
    );

    const uploadedPpt = uploadedFiles[0];

    // Handle thumbnail upload if provided
    let thumbnailData = { thumbnailUrl: "", thumbnailKey: "" };
    if (req.files && req.files.thumbnail) {
      const allowedImageTypes = [
        "image/jpeg",
        "image/png",
        "image/jpg",
        "image/gif",
      ];
      const { uploadedFiles: thumbnailFiles } = await handleFileUploads(
        req.files.thumbnail,
        allowedImageTypes,
        `syllabus-thumbnails/course-${courseId}/module-${moduleId}`,
        next,
      );
      thumbnailData.thumbnailUrl = thumbnailFiles[0].url;
      thumbnailData.thumbnailKey = thumbnailFiles[0].key;
    }

    // Create PPT object
    const pptData = {
      name,
      description: description || "",
      thumbnail: thumbnailData,
      fileUrl: uploadedPpt.url,
      fileKey: uploadedPpt.key,
      createDate: new Date(),
      isActive: true,
    };

    // Add PPT to module
    if (!module.ppts) {
      module.ppts = [];
    }
    module.ppts.push(pptData);

    await syllabus.save({ session });

    await session.commitTransaction();
    transactionStarted = false;

    res.status(201).json({
      success: true,
      message: "PPT added to module successfully",
      ppt: module.ppts[module.ppts.length - 1],
    });
  } catch (error) {
    console.log(`Error in addPptToModule: ${error.message}`);
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

// Update module basic info
exports.updateModule = catchAsyncErrors(async (req, res, next) => {
  console.log("updateModule: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;

    const { moduleNumber, moduleTitle, description } = req.body;
    const { courseId, moduleId } = req.params;

    // Check if teacher is authorized
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      return next(new ErrorHandler("Teacher not found", 404));
    }

    const course = await Course.findOne({
      _id: courseId,
      teachers: teacher._id,
    });

    if (!course) {
      return next(new ErrorHandler("Course not found or unauthorized", 404));
    }

    // Find syllabus and module
    const syllabus = await CourseSyllabus.findOne({ course: courseId }).session(
      session,
    );
    if (!syllabus) {
      return next(new ErrorHandler("No syllabus found for this course", 404));
    }

    const module = syllabus.modules.id(moduleId);
    if (!module) {
      return next(new ErrorHandler("Module not found", 404));
    }

    // Update module details
    if (moduleNumber) module.moduleNumber = moduleNumber;
    if (moduleTitle) module.moduleTitle = moduleTitle;
    if (description !== undefined) module.description = description;

    await syllabus.save({ session });

    await session.commitTransaction();
    transactionStarted = false;

    res.status(200).json({
      success: true,
      message: "Module updated successfully",
      module: syllabus.modules.id(moduleId),
    });
  } catch (error) {
    console.log(`Error in updateModule: ${error.message}`);
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

// Delete video from module
exports.deleteVideoFromModule = catchAsyncErrors(async (req, res, next) => {
  console.log("deleteVideoFromModule: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;

            const { courseId, moduleId, videoId } = req.params;
    
            // Check authorization
            const teacher = await Teacher.findOne({ user: req.user.id });
            if (!teacher) {
              return next(new ErrorHandler("Teacher not found", 404));
            }
    
            const course = await Course.findOne({
              _id: courseId,
              teachers: teacher._id,
            });
    if (!course) {
      return next(new ErrorHandler("Course not found or unauthorized", 404));
    }

    // Find syllabus and module
    const syllabus = await CourseSyllabus.findOne({ course: courseId }).session(
      session,
    );
    if (!syllabus) {
      return next(new ErrorHandler("No syllabus found for this course", 404));
    }

    const module = syllabus.modules.id(moduleId);
    if (!module) {
      return next(new ErrorHandler("Module not found", 404));
    }

    // Find and remove video
    const videoIndex = module.videos.findIndex(
      (video) => video._id.toString() === videoId,
    );

    if (videoIndex === -1) {
      return next(new ErrorHandler("Video not found", 404));
    }

    const video = module.videos[videoIndex];

    // Delete files from Azure
    try {
      if (video.fileKey) {
        await deleteFileFromAzure(video.fileKey);
      }
      if (video.thumbnail.thumbnailKey) {
        await deleteFileFromAzure(video.thumbnail.thumbnailKey);
      }
    } catch (deleteError) {
      console.error("Error deleting files from Azure:", deleteError);
    }

    // Remove video from array
    module.videos.splice(videoIndex, 1);

    await syllabus.save({ session });

    await session.commitTransaction();
    transactionStarted = false;

    res.status(200).json({
      success: true,
      message: "Video deleted successfully",
    });
  } catch (error) {
    console.log(`Error in deleteVideoFromModule: ${error.message}`);
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

// Similar delete functions for links, PDFs, and PPTs
exports.deleteLinkFromModule = catchAsyncErrors(async (req, res, next) => {
  console.log("deleteLinkFromModule: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;

    const { courseId, moduleId, linkId } = req.params;

    // Check authorization
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      return next(new ErrorHandler("Teacher not found", 404));
    }

    const course = await Course.findOne({
      _id: courseId,
      teachers: teacher._id,
    });

    if (!course) {
      return next(new ErrorHandler("Course not found or unauthorized", 404));
    }

    // Find syllabus and module
    const syllabus = await CourseSyllabus.findOne({ course: courseId }).session(
      session,
    );
    if (!syllabus) {
      return next(new ErrorHandler("No syllabus found for this course", 404));
    }

    const module = syllabus.modules.id(moduleId);
    if (!module) {
      return next(new ErrorHandler("Module not found", 404));
    }

    // Find and remove link
    const linkIndex = module.links.findIndex(
      (link) => link._id.toString() === linkId,
    );

    if (linkIndex === -1) {
      return next(new ErrorHandler("Link not found", 404));
    }

    const link = module.links[linkIndex];

    // Delete thumbnail from Azure if exists
    try {
      if (link.thumbnail.thumbnailKey) {
        await deleteFileFromAzure(link.thumbnail.thumbnailKey);
      }
    } catch (deleteError) {
      console.error("Error deleting thumbnail from Azure:", deleteError);
    }

    // Remove link from array
    module.links.splice(linkIndex, 1);

    await syllabus.save({ session });

    await session.commitTransaction();
    transactionStarted = false;

    res.status(200).json({
      success: true,
      message: "Link deleted successfully",
    });
  } catch (error) {
    console.log(`Error in deleteLinkFromModule: ${error.message}`);
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

// Delete PDF from module
exports.deletePdfFromModule = catchAsyncErrors(async (req, res, next) => {
  console.log("deletePdfFromModule: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;

    const { courseId, moduleId, pdfId } = req.params;

    // Check authorization
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      return next(new ErrorHandler("Teacher not found", 404));
    }

    const course = await Course.findOne({
      _id: courseId,
      teachers: teacher._id,
    });

    if (!course) {
      return next(new ErrorHandler("Course not found or unauthorized", 404));
    }

    // Find syllabus and module
    const syllabus = await CourseSyllabus.findOne({ course: courseId }).session(
      session,
    );
    if (!syllabus) {
      return next(new ErrorHandler("No syllabus found for this course", 404));
    }

    const module = syllabus.modules.id(moduleId);
    if (!module) {
      return next(new ErrorHandler("Module not found", 404));
    }

    // Find and remove PDF
    const pdfIndex = module.pdfs.findIndex(
      (pdf) => pdf._id.toString() === pdfId,
    );

    if (pdfIndex === -1) {
      return next(new ErrorHandler("PDF not found", 404));
    }

    const pdf = module.pdfs[pdfIndex];

    // Delete files from Azure
    try {
      if (pdf.fileKey) {
        await deleteFileFromAzure(pdf.fileKey);
      }
      if (pdf.thumbnail.thumbnailKey) {
        await deleteFileFromAzure(pdf.thumbnail.thumbnailKey);
      }
    } catch (deleteError) {
      console.error("Error deleting files from Azure:", deleteError);
    }

    // Remove PDF from array
    module.pdfs.splice(pdfIndex, 1);

    await syllabus.save({ session });

    await session.commitTransaction();
    transactionStarted = false;

    res.status(200).json({
      success: true,
      message: "PDF deleted successfully",
    });
  } catch (error) {
    console.log(`Error in deletePdfFromModule: ${error.message}`);
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

// Delete PPT from module
exports.deletePptFromModule = catchAsyncErrors(async (req, res, next) => {
  console.log("deletePptFromModule: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;

    const { courseId, moduleId, pptId } = req.params;

    // Check authorization
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      return next(new ErrorHandler("Teacher not found", 404));
    }

    const course = await Course.findOne({
      _id: courseId,
      teachers: teacher._id,
    });

    if (!course) {
      return next(new ErrorHandler("Course not found or unauthorized", 404));
    }

    // Find syllabus and module
    const syllabus = await CourseSyllabus.findOne({ course: courseId }).session(
      session,
    );
    if (!syllabus) {
      return next(new ErrorHandler("No syllabus found for this course", 404));
    }

    const module = syllabus.modules.id(moduleId);
    if (!module) {
      return next(new ErrorHandler("Module not found", 404));
    }

    // Find and remove PPT
    const pptIndex = module.ppts.findIndex(
      (ppt) => ppt._id.toString() === pptId,
    );

    if (pptIndex === -1) {
      return next(new ErrorHandler("PPT not found", 404));
    }

    const ppt = module.ppts[pptIndex];

    // Delete files from Azure
    try {
      if (ppt.fileKey) {
        await deleteFileFromAzure(ppt.fileKey);
      }
      if (ppt.thumbnail.thumbnailKey) {
        await deleteFileFromAzure(ppt.thumbnail.thumbnailKey);
      }
    } catch (deleteError) {
      console.error("Error deleting files from Azure:", deleteError);
    }

    // Remove PPT from array
    module.ppts.splice(pptIndex, 1);

    await syllabus.save({ session });

    await session.commitTransaction();
    transactionStarted = false;

    res.status(200).json({
      success: true,
      message: "PPT deleted successfully",
    });
  } catch (error) {
    console.log(`Error in deletePptFromModule: ${error.message}`);
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

// Update video in module
exports.updateVideoInModule = catchAsyncErrors(async (req, res, next) => {
  console.log("updateVideoInModule: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;

    const { courseId, moduleId, videoId } = req.params;
    const { name, description, isActive } = req.body;

    // Check authorization
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      return next(new ErrorHandler("Teacher not found", 404));
    }

    const course = await Course.findOne({
      _id: courseId,
      teachers: teacher._id,
    });

    if (!course) {
      return next(new ErrorHandler("Course not found or unauthorized", 404));
    }

    // Find syllabus and module
    const syllabus = await CourseSyllabus.findOne({ course: courseId }).session(
      session,
    );
    if (!syllabus) {
      return next(new ErrorHandler("No syllabus found for this course", 404));
    }

    const module = syllabus.modules.id(moduleId);
    if (!module) {
      return next(new ErrorHandler("Module not found", 404));
    }

    // Find video
    const video = module.videos.id(videoId);
    if (!video) {
      return next(new ErrorHandler("Video not found", 404));
    }

    // Update video details
    if (name) video.name = name;
    if (description !== undefined) video.description = description;
    if (isActive !== undefined) video.isActive = isActive;

    // Handle new video file if provided
    if (req.files && req.files.video) {
      const allowedVideoTypes = [
        "video/mp4",
        "video/webm",
        "video/avi",
        "video/mov",
      ];
      const { uploadedFiles } = await handleFileUploads(
        req.files.video,
        allowedVideoTypes,
        `syllabus-videos/course-${courseId}/module-${moduleId}`,
        next,
      );

      // Delete old video file
      if (video.fileKey) {
        try {
          await deleteFileFromAzure(video.fileKey);
        } catch (deleteError) {
          console.error("Error deleting old video:", deleteError);
        }
      }

      // Update with new video
      video.fileUrl = uploadedFiles[0].url;
      video.fileKey = uploadedFiles[0].key;
    }

    // Handle new thumbnail if provided
    if (req.files && req.files.thumbnail) {
      const allowedImageTypes = [
        "image/jpeg",
        "image/png",
        "image/jpg",
        "image/gif",
      ];
      const { uploadedFiles: thumbnailFiles } = await handleFileUploads(
        req.files.thumbnail,
        allowedImageTypes,
        `syllabus-thumbnails/course-${courseId}/module-${moduleId}`,
        next,
      );

      // Delete old thumbnail
      if (video.thumbnail.thumbnailKey) {
        try {
          await deleteFileFromAzure(video.thumbnail.thumbnailKey);
        } catch (deleteError) {
          console.error("Error deleting old thumbnail:", deleteError);
        }
      }

      // Update with new thumbnail
      video.thumbnail.thumbnailUrl = thumbnailFiles[0].url;
      video.thumbnail.thumbnailKey = thumbnailFiles[0].key;
    }

    await syllabus.save({ session });

    await session.commitTransaction();
    transactionStarted = false;

    res.status(200).json({
      success: true,
      message: "Video updated successfully",
      video,
    });
  } catch (error) {
    console.log(`Error in updateVideoInModule: ${error.message}`);
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

// Update link in module
exports.updateLinkInModule = catchAsyncErrors(async (req, res, next) => {
  console.log("updateLinkInModule: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;

    const { courseId, moduleId, linkId } = req.params;
    const { name, description, fileUrl, isActive } = req.body;

    // Check authorization
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      return next(new ErrorHandler("Teacher not found", 404));
    }

    const course = await Course.findOne({
      _id: courseId,
      teachers: teacher._id,
    });

    if (!course) {
      return next(new ErrorHandler("Course not found or unauthorized", 404));
    }

    // Find syllabus and module
    const syllabus = await CourseSyllabus.findOne({ course: courseId }).session(
      session,
    );
    if (!syllabus) {
      return next(new ErrorHandler("No syllabus found for this course", 404));
    }

    const module = syllabus.modules.id(moduleId);
    if (!module) {
      return next(new ErrorHandler("Module not found", 404));
    }

    // Find link
    const link = module.links.id(linkId);
    if (!link) {
      return next(new ErrorHandler("Link not found", 404));
    }

    // Update link details
    if (name) link.name = name;
    if (description !== undefined) link.description = description;
    if (fileUrl) link.fileUrl = fileUrl;
    if (isActive !== undefined) link.isActive = isActive;

    // Handle new thumbnail if provided
    if (req.files && req.files.thumbnail) {
      const allowedImageTypes = [
        "image/jpeg",
        "image/png",
        "image/jpg",
        "image/gif",
      ];
      const { uploadedFiles: thumbnailFiles } = await handleFileUploads(
        req.files.thumbnail,
        allowedImageTypes,
        `syllabus-thumbnails/course-${courseId}/module-${moduleId}`,
        next,
      );

      // Delete old thumbnail
      if (link.thumbnail.thumbnailKey) {
        try {
          await deleteFileFromAzure(link.thumbnail.thumbnailKey);
        } catch (deleteError) {
          console.error("Error deleting old thumbnail:", deleteError);
        }
      }

      // Update with new thumbnail
      link.thumbnail.thumbnailUrl = thumbnailFiles[0].url;
      link.thumbnail.thumbnailKey = thumbnailFiles[0].key;
    }

    await syllabus.save({ session });

    await session.commitTransaction();
    transactionStarted = false;

    res.status(200).json({
      success: true,
      message: "Link updated successfully",
      link,
    });
  } catch (error) {
    console.log(`Error in updateLinkInModule: ${error.message}`);
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

// Update PDF in module
exports.updatePdfInModule = catchAsyncErrors(async (req, res, next) => {
  console.log("updatePdfInModule: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;

    const { courseId, moduleId, pdfId } = req.params;
    const { name, description, isActive } = req.body;

    // Check authorization
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      return next(new ErrorHandler("Teacher not found", 404));
    }

    const course = await Course.findOne({
      _id: courseId,
      teachers: teacher._id,
    });

    if (!course) {
      return next(new ErrorHandler("Course not found or unauthorized", 404));
    }

    // Find syllabus and module
    const syllabus = await CourseSyllabus.findOne({ course: courseId }).session(
      session,
    );
    if (!syllabus) {
      return next(new ErrorHandler("No syllabus found for this course", 404));
    }

    const module = syllabus.modules.id(moduleId);
    if (!module) {
      return next(new ErrorHandler("Module not found", 404));
    }

    // Find PDF
    const pdf = module.pdfs.id(pdfId);
    if (!pdf) {
      return next(new ErrorHandler("PDF not found", 404));
    }

    // Update PDF details
    if (name) pdf.name = name;
    if (description !== undefined) pdf.description = description;
    if (isActive !== undefined) pdf.isActive = isActive;

    // Handle new PDF file if provided
    if (req.files && req.files.pdf) {
      const allowedPdfTypes = ["application/pdf"];
      const { uploadedFiles } = await handleFileUploads(
        req.files.pdf,
        allowedPdfTypes,
        `syllabus-pdfs/course-${courseId}/module-${moduleId}`,
        next,
      );

      // Delete old PDF file
      if (pdf.fileKey) {
        try {
          await deleteFileFromAzure(pdf.fileKey);
        } catch (deleteError) {
          console.error("Error deleting old PDF:", deleteError);
        }
      }

      // Update with new PDF
      pdf.fileUrl = uploadedFiles[0].url;
      pdf.fileKey = uploadedFiles[0].key;
    }

    // Handle new thumbnail if provided
    if (req.files && req.files.thumbnail) {
      const allowedImageTypes = [
        "image/jpeg",
        "image/png",
        "image/jpg",
        "image/gif",
      ];
      const { uploadedFiles: thumbnailFiles } = await handleFileUploads(
        req.files.thumbnail,
        allowedImageTypes,
        `syllabus-thumbnails/course-${courseId}/module-${moduleId}`,
        next,
      );

      // Delete old thumbnail
      if (pdf.thumbnail.thumbnailKey) {
        try {
          await deleteFileFromAzure(pdf.thumbnail.thumbnailKey);
        } catch (deleteError) {
          console.error("Error deleting old thumbnail:", deleteError);
        }
      }

      // Update with new thumbnail
      pdf.thumbnail.thumbnailUrl = thumbnailFiles[0].url;
      pdf.thumbnail.thumbnailKey = thumbnailFiles[0].key;
    }

    await syllabus.save({ session });

    await session.commitTransaction();
    transactionStarted = false;

    res.status(200).json({
      success: true,
      message: "PDF updated successfully",
      pdf,
    });
  } catch (error) {
    console.log(`Error in updatePdfInModule: ${error.message}`);
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

// Update PPT in module
exports.updatePptInModule = catchAsyncErrors(async (req, res, next) => {
  console.log("updatePptInModule: Started");
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    await session.startTransaction();
    transactionStarted = true;

    const { courseId, moduleId, pptId } = req.params;
    const { name, description, isActive } = req.body;

    // Check authorization
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      return next(new ErrorHandler("Teacher not found", 404));
    }

    const course = await Course.findOne({
      _id: courseId,
      teachers: teacher._id,
    });

    if (!course) {
      return next(new ErrorHandler("Course not found or unauthorized", 404));
    }

    // Find syllabus and module
    const syllabus = await CourseSyllabus.findOne({ course: courseId }).session(
      session,
    );
    if (!syllabus) {
      return next(new ErrorHandler("No syllabus found for this course", 404));
    }

    const module = syllabus.modules.id(moduleId);
    if (!module) {
      return next(new ErrorHandler("Module not found", 404));
    }

    // Find PPT
    const ppt = module.ppts.id(pptId);
    if (!ppt) {
      return next(new ErrorHandler("PPT not found", 404));
    }

    // Update PPT details
    if (name) ppt.name = name;
    if (description !== undefined) ppt.description = description;
    if (isActive !== undefined) ppt.isActive = isActive;

    // Handle new PPT file if provided
    if (req.files && req.files.ppt) {
      const allowedPptTypes = [
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ];
      const { uploadedFiles } = await handleFileUploads(
        req.files.ppt,
        allowedPptTypes,
        `syllabus-ppts/course-${courseId}/module-${moduleId}`,
        next,
      );

      // Delete old PPT file
      if (ppt.fileKey) {
        try {
          await deleteFileFromAzure(ppt.fileKey);
        } catch (deleteError) {
          console.error("Error deleting old PPT:", deleteError);
        }
      }

      // Update with new PPT
      ppt.fileUrl = uploadedFiles[0].url;
      ppt.fileKey = uploadedFiles[0].key;
    }

    // Handle new thumbnail if provided
    if (req.files && req.files.thumbnail) {
      const allowedImageTypes = [
        "image/jpeg",
        "image/png",
        "image/jpg",
        "image/gif",
      ];
      const { uploadedFiles: thumbnailFiles } = await handleFileUploads(
        req.files.thumbnail,
        allowedImageTypes,
        `syllabus-thumbnails/course-${courseId}/module-${moduleId}`,
        next,
      );

      // Delete old thumbnail
      if (ppt.thumbnail.thumbnailKey) {
        try {
          await deleteFileFromAzure(ppt.thumbnail.thumbnailKey);
        } catch (deleteError) {
          console.error("Error deleting old thumbnail:", deleteError);
        }
      }

      // Update with new thumbnail
      ppt.thumbnail.thumbnailUrl = thumbnailFiles[0].url;
      ppt.thumbnail.thumbnailKey = thumbnailFiles[0].key;
    }

    await syllabus.save({ session });

    await session.commitTransaction();
    transactionStarted = false;

    res.status(200).json({
      success: true,
      message: "PPT updated successfully",
      ppt,
    });
  } catch (error) {
    console.log(`Error in updatePptInModule: ${error.message}`);
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

module.exports = exports;
