const express = require("express");
const cors = require("cors");
const connectDB = require("./config/database");
const bodyParser = require("body-parser");
require("dotenv").config();
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// IMPORTANT: CORS must be configured FIRST before other middleware
app.use(
  cors({
    origin: [
      "https://kiit-lms.vercel.app",
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:3001",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
    credentials: true,
    optionsSuccessStatus: 200, // For legacy browser support
    preflightContinue: false,
  })
);

// Handle preflight requests
app.options("*", cors());

// Set headers for all responses
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin);
  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,PUT,POST,DELETE,OPTIONS,PATCH"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin"
  );

  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Increase payload limits BEFORE express.json()
app.use(express.urlencoded({ extended: true, limit: "200mb" }));

// Configure body-parser with larger limits
app.use(bodyParser.json({ limit: "200mb" }));
app.use(bodyParser.urlencoded({ limit: "200mb", extended: true }));

const fileUpload = require("express-fileupload");

// Configure express-fileupload with larger limits
app.use(
  fileUpload({
    createParentPath: true,
    limits: {
      fileSize: 200 * 1024 * 1024, // 200MB
    },
    abortOnLimit: true,
    useTempFiles: false,
    debug: false,
    parseNested: true,
  })
);

// These limits should come AFTER body-parser
app.use(express.json({ limit: "200mb" }));

// MongoDB Connection
connectDB();

// Routes
app.get("/", (req, res) => {
  res.send("<h1>Backend Working</h1>");
});

app.use("/api/admin", require("./routes/admin"));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/courses", require("./routes/courses"));
app.use("/api/lectures", require("./routes/lecture"));
app.use("/api/semesters", require("./routes/semester"));
app.use("/api/students", require("./routes/students"));
app.use("/api/teachers", require("./routes/teachers"));
app.use("/api/events", require("./routes/event"));
app.use("/api/assignment", require("./routes/assignment"));
app.use("/api/activity", require("./routes/activity"));
app.use("/api/econtent", require("./routes/econtent"));
app.use("/api/students", require("./routes/getStudents"));
app.use("/api/announcement", require("./routes/announcement"));
app.use("/api/syllabus", require("./routes/syllabus"));
app.use("/api/discussion", require("./routes/discussion"));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);

  // Handle file too large error
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: "File too large",
      message: "Maximum file size is 200MB",
    });
  }

  // Handle JSON payload too large
  if (err.type === "entity.too.large") {
    return res.status(413).json({
      error: "Payload too large",
      message: "Request payload exceeds maximum size of 200MB",
    });
  }

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
