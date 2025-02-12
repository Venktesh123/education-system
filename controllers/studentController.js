exports.enrollCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    if (course.teacher.toString() !== req.user.teacher.toString()) {
      return res
        .status(403)
        .json({
          error:
            "You can only enroll in courses taught by your assigned teacher",
        });
    }

    if (!course.students.includes(req.user._id)) {
      course.students.push(req.user._id);
      await course.save();
    }

    res.json(course);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
