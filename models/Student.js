const mongoose = require("mongoose");
const studentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: true,
    },
    courses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
      },
    ],
    // Add teacherEmail for direct lookups
    teacherEmail: {
      type: String,
      required: true,
      lowercase: true,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save middleware to ensure teacherEmail matches teacher's email
studentSchema.pre("save", async function (next) {
  if (this.isNew || this.isModified("teacher")) {
    const teacher = await this.model("Teacher").findById(this.teacher);
    if (teacher) {
      this.teacherEmail = teacher.email;
    }
  }
  next();
});

// Index for efficient lookups
studentSchema.index({ teacherEmail: 1 });
studentSchema.index({ teacher: 1 });

module.exports = mongoose.model("Student", studentSchema);
