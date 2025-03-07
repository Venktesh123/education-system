const express = require("express");
const cors = require("cors");
const connectDB = require("./config/database");

require("dotenv").config();
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.urlencoded({ extended: true }));

// Middleware
app.use(cors());
app.use(express.json());
const fileUpload = require("express-fileupload");

// IMPORTANT: Configure express-fileupload GLOBALLY rather than per-route
// This prevents multiple instances from conflicting
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Configure express-fileupload globally to handle file uploads
// This keeps the file in memory rather than writing to disk
app.use(
  fileUpload({
    createParentPath: true,
    limits: {
      fileSize: 2000 * 1024 * 1024, // 10MB
    },
    abortOnLimit: true,
    // Don't use tempFiles - we want to keep everything in memory
    useTempFiles: false,
    // Enable debug if needed
    debug: false,
  })
);

// MongoDB Connection
connectDB();

// Routes
app.get("/", (req, res) => {
  res.send("<h1>Backend Working</h1>");
});
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/courses", require("./routes/courses"));
app.use("/api/lectures", require("./routes/lecture"));
app.use("/api/semesters", require("./routes/semester"));
app.use("/api/students", require("./routes/students"));
app.use("/api/teachers", require("./routes/teachers"));
app.use("/api/events", require("./routes/event"));
app.use("/api/assignment", require("./routes/assignment"));
app.use("/api/econtent", require("./routes/econtent"));
app.use("/api/students", require("./routes/getStudents"));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal Server Error" });
});

// Handle 404 routes
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
