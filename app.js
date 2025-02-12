require("dotenv").config();
const express = require("express");
const connectDB = require("./config/database");
const authRoutes = require("./routes/auth");
const courseRoutes = require("./routes/courses");
const teacherRoutes = require("./routes/teachers");
const studentRoutes = require("./routes/students");

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/teachers", teacherRoutes);
app.use("/api/students", studentRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
