const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["teacher", "student"], required: true },
    courses: [{ type: mongoose.Schema.Types.ObjectId, ref: "Course" }],
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        return this.role === "student";
      },
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

const User = mongoose.model("User", userSchema);
module.exports = User;
