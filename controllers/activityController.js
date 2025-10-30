const Activity = require("../models/Activity");
const Course = require("../models/Course");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const catchAsyncErrors = require("../middleware/catchAsyncErrors");
const { ErrorHandler } = require("../middleware/errorHandler");
const { withTransaction } = require("../utils/databaseHelper");
const {
  uploadFileToAzure,
  deleteFileFromAzure,
} = require("../utils/azureConfig");

// Create new activity -> Refactored
exports.createActivity = catchAsyncErrors(async (req, res, next) => {
  const { title, description, dueDate, totalPoints, links } = req.body;
  const { courseId } = req.params;

  const activity = await withTransaction(async (session) => {
    if (!title || !description || !dueDate || !totalPoints) {
      throw new ErrorHandler("All fields are required", 400);
    }

    const course = await Course.findById(courseId).session(session);
    if (!course) {
      throw new ErrorHandler("Course not found", 404);
    }

    const newActivity = new Activity({
      title,
      description,
      course: courseId,
      dueDate,
      totalPoints,
      isActive: true,
      links: links || [],
    });

    if (req.files && req.files.attachments) {
      let attachmentsArray = Array.isArray(req.files.attachments)
        ? req.files.attachments
        : [req.files.attachments];

      const uploadPath = `activities/course-${courseId}`;
      const uploadPromises = attachmentsArray.map((file) =>
        uploadFileToAzure(file, uploadPath)
      );
      const uploadedFiles = await Promise.all(uploadPromises);

      newActivity.attachments = uploadedFiles.map((uploadResult) => ({
        name: uploadResult.originalName,
        url: uploadResult.url,
        key: uploadResult.key,
      }));
    }

    await newActivity.save({ session });

    course.activities = course.activities || [];
    course.activities.push(newActivity._id);
    await course.save({ session });

    return newActivity;
  });

  res.status(201).json({
    success: true,
    message: "Activity created successfully",
    activity,
  });
});

// Submit activity (for students) -> Refactored
exports.submitActivity = catchAsyncErrors(async (req, res, next) => {
  const { activityId } = req.params;
  const submissionFile = req.files ? req.files.submissionFile : null;

  const { isLate } = await withTransaction(async (session) => {
    const student = await Student.findOne({ user: req.user.id });
    if (!student) {
      throw new ErrorHandler("Student not found", 404);
    }

    const activityToSubmit = await Activity.findById(activityId);
    if (!activityToSubmit) {
      throw new ErrorHandler("Activity not found", 404);
    }

    const course = await Course.findById(activityToSubmit.course);
    if (!course) {
      throw new ErrorHandler("Course not found", 404);
    }

    const isEnrolled = student.courses.some((id) => id.equals(course._id));
    if (!isEnrolled) {
      throw new ErrorHandler("Not enrolled in this course", 403);
    }

    if (!activityToSubmit.isActive) {
      throw new ErrorHandler(
        "This activity is no longer accepting submissions",
        400
      );
    }

    if (!submissionFile) {
      throw new ErrorHandler("Please upload your submission file", 400);
    }

    const now = new Date();
    const isLate = now > activityToSubmit.dueDate;

    const uploadPath = `activity-submissions/activity-${activityToSubmit._id}/student-${student._id}`;
    const uploadResult = await uploadFileToAzure(submissionFile, uploadPath);

    const existingSubmission = activityToSubmit.submissions.find((sub) =>
      sub.student.equals(student._id)
    );

    if (existingSubmission) {
      if (existingSubmission.submissionFileKey) {
        await deleteFileFromAzure(existingSubmission.submissionFileKey).catch(
          (err) => console.error("Error deleting old submission file:", err)
        );
      }
      existingSubmission.submissionFile = uploadResult.url;
      existingSubmission.submissionFileKey = uploadResult.key;
      existingSubmission.submissionDate = now;
      existingSubmission.status = "submitted";
      existingSubmission.isLate = isLate;
    } else {
      activityToSubmit.submissions.push({
        student: student._id,
        submissionFile: uploadResult.url,
        submissionFileKey: uploadResult.key,
        submissionDate: now,
        status: "submitted",
        isLate: isLate,
      });
    }

    await activityToSubmit.save({ session });

    return { isLate };
  });

  res.json({
    success: true,
    message: "Activity submitted successfully",
    isLate,
  });
});

// Grade a submission (for teachers) -> Refactored
exports.gradeSubmission = catchAsyncErrors(async (req, res, next) => {
  const { activityId, submissionId } = req.params;
  const { grade, feedback } = req.body;

  await withTransaction(async (session) => {
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      throw new ErrorHandler("Teacher not found", 404);
    }

    const activity = await Activity.findById(activityId);
    if (!activity) {
      throw new ErrorHandler("Activity not found", 404);
    }

    const course = await Course.findOne({
      _id: activity.course,
      teacher: teacher._id,
    });
    if (!course) {
      throw new ErrorHandler("Unauthorized to grade this activity", 403);
    }

    if (grade === undefined || grade < 0 || grade > activity.totalPoints) {
      throw new ErrorHandler(
        `Grade must be between 0 and ${activity.totalPoints}`,
        400
      );
    }

    const submissionIndex = activity.submissions.findIndex(
      (sub) => sub._id.toString() === submissionId
    );
    if (submissionIndex === -1) {
      throw new ErrorHandler("Submission not found", 404);
    }

    activity.submissions[submissionIndex].grade = grade;
    activity.submissions[submissionIndex].feedback = feedback || "";
    activity.submissions[submissionIndex].status = "graded";

    await activity.save({ session });
  });

  res.json({
    success: true,
    message: "Submission graded successfully",
  });
});

// Update activity -> Refactored
exports.updateActivity = catchAsyncErrors(async (req, res, next) => {
  const { activityId } = req.params;

  const activity = await withTransaction(async (session) => {
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      throw new ErrorHandler("Teacher not found", 404);
    }

    const activityToUpdate = await Activity.findById(activityId);
    if (!activityToUpdate) {
      throw new ErrorHandler("Activity not found", 404);
    }

    const course = await Course.findOne({
      _id: activityToUpdate.course,
      teacher: teacher._id,
    });
    if (!course) {
      throw new ErrorHandler("Unauthorized to update this activity", 403);
    }

    const { title, description, dueDate, totalPoints, isActive, links } = req.body;
    if (title) activityToUpdate.title = title;
    if (description) activityToUpdate.description = description;
    if (dueDate) activityToUpdate.dueDate = dueDate;
    if (totalPoints) activityToUpdate.totalPoints = totalPoints;
    if (isActive !== undefined) activityToUpdate.isActive = isActive;
    if (links) activityToUpdate.links = links;

    if (req.body.removeAttachments) {
      const attachmentsToRemove = Array.isArray(req.body.removeAttachments)
        ? req.body.removeAttachments
        : [req.body.removeAttachments];

      const deletePromises = activityToUpdate.attachments
        .filter((att) => attachmentsToRemove.includes(att._id.toString()))
        .map((att) => deleteFileFromAzure(att.key));
      await Promise.all(deletePromises);

      activityToUpdate.attachments = activityToUpdate.attachments.filter(
        (att) => !attachmentsToRemove.includes(att._id.toString())
      );
    }

    if (req.files && req.files.attachments) {
      const attachmentsArray = Array.isArray(req.files.attachments)
        ? req.files.attachments
        : [req.files.attachments];

      const uploadPath = `activities/course-${activityToUpdate.course}`;
      const uploadPromises = attachmentsArray.map((file) =>
        uploadFileToAzure(file, uploadPath)
      );
      const uploadedFiles = await Promise.all(uploadPromises);

      const newAttachments = uploadedFiles.map((uploadResult) => ({
        name: uploadResult.originalName,
        url: uploadResult.url,
        key: uploadResult.key,
      }));

      activityToUpdate.attachments.push(...newAttachments);
    }

    await activityToUpdate.save({ session });
    return activityToUpdate;
  });

  res.status(200).json({
    success: true,
    message: "Activity updated successfully",
    activity,
  });
});

// Delete activity -> Refactored
exports.deleteActivity = catchAsyncErrors(async (req, res, next) => {
  const { activityId } = req.params;

  await withTransaction(async (session) => {
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher) {
      throw new ErrorHandler("Teacher not found", 404);
    }

    const activity = await Activity.findById(activityId);
    if (!activity) {
      throw new ErrorHandler("Activity not found", 404);
    }

    const course = await Course.findOne({
      _id: activity.course,
      teacher: teacher._id,
    });
    if (!course) {
      throw new ErrorHandler("Unauthorized to delete this activity", 403);
    }

    if (activity.attachments && activity.attachments.length > 0) {
      const deletePromises = activity.attachments.map((att) =>
        deleteFileFromAzure(att.key)
      );
      await Promise.all(deletePromises);
    }

    if (activity.submissions && activity.submissions.length > 0) {
      const deletePromises = activity.submissions
        .filter((sub) => sub.submissionFileKey)
        .map((sub) => deleteFileFromAzure(sub.submissionFileKey));
      await Promise.all(deletePromises);
    }

    course.activities = course.activities.filter(
      (id) => !id.equals(activity._id)
    );
    await course.save({ session });

    await Activity.findByIdAndDelete(activityId).session(session);
  });

  res.status(200).json({
    success: true,
    message: "Activity deleted successfully",
  });
});


// Get all activities for a course
exports.getCourseActivities = catchAsyncErrors(async (req, res, next) => {
  const { courseId } = req.params;

  const course = await Course.findById(courseId);
  if (!course) {
    return next(new ErrorHandler("Course not found", 404));
  }

  if (req.user.role === "teacher") {
    const teacher = await Teacher.findOne({ user: req.user.id });
    if (!teacher || !course.teacher.equals(teacher._id)) {
      return next(new ErrorHandler("Unauthorized access", 403));
    }
  } else if (req.user.role === "student") {
    const student = await Student.findOne({ user: req.user.id });
    if (!student || !student.courses.some((id) => id.equals(course._id))) {
      return next(new ErrorHandler("Unauthorized access", 403));
    }
  }

  const activities = await Activity.find({ course: courseId }).sort({
    dueDate: 1,
  });

  if (req.user.role === "student") {
    const student = await Student.findOne({ user: req.user.id });
    activities.forEach((activity) => {
      activity.submissions = activity.submissions.filter((submission) =>
        submission.student.equals(student._id)
      );
    });
  }

  res.status(200).json({
    success: true,
    activities,
  });
});

// Get a specific activity by ID
exports.getActivityById = catchAsyncErrors(async (req, res, next) => {
  const { activityId } = req.params;

  const activity = await Activity.findById(activityId).populate(
    "course",
    "title"
  );

  if (!activity) {
    return next(new ErrorHandler("Activity not found", 404));
  }

  if (req.user.role === "teacher") {
    const teacher = await Teacher.findOne({ user: req.user.id });
    const course = await Course.findById(activity.course);
    if (!teacher || !course.teacher.equals(teacher._id)) {
      return next(new ErrorHandler("Unauthorized access", 403));
    }
  } else if (req.user.role === "student") {
    const student = await Student.findOne({ user: req.user.id });
    if (!student || !student.courses.some((id) => id.equals(activity.course._id))) {
      return next(new ErrorHandler("Unauthorized access", 403));
    }
    activity.submissions = activity.submissions
      .filter((submission) => submission.student.equals(student._id))
      .map((submission) => {
        const modifiedSubmission = {
          ...submission.toObject(),
          student: req.user.id,
        };
        return modifiedSubmission;
      });
  }

  res.status(200).json({
    success: true,
    activity,
  });
});