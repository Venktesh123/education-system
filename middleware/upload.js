const path = require("path");
const fs = require("fs");

// Define upload directory
const uploadDir = path.join(__dirname, "../uploads");

// Create directory if it doesn't exist
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// This middleware processes the already uploaded file
module.exports = (req, res, next) => {
  console.log("Processing uploaded file...");

  try {
    // Check if we have any files (from the global middleware)
    if (!req.files || Object.keys(req.files).length === 0) {
      console.log("No files were uploaded");
      return res.status(400).json({ error: "No files were uploaded" });
    }

    // Get the uploaded file
    const uploadedFile = req.files.file;

    if (!uploadedFile) {
      return res.status(400).json({
        error: 'No file with name "file" was found',
        availableFields: Object.keys(req.files),
      });
    }

    console.log("File details:", {
      name: uploadedFile.name,
      size: uploadedFile.size,
      mimetype: uploadedFile.mimetype,
    });

    // Check for valid Excel file based on BOTH extension AND mimetype
    const validExtensions = [".xlsx", ".xls", ".lsx"];
    const validMimetypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/excel",
      "application/x-excel",
    ];

    const fileExtension = path.extname(uploadedFile.name).toLowerCase();
    const isValidExtension = validExtensions.includes(fileExtension);
    const isValidMimetype = validMimetypes.includes(uploadedFile.mimetype);

    // Accept file if EITHER extension OR mimetype is valid Excel
    if (!isValidExtension && !isValidMimetype) {
      return res.status(400).json({
        error: "Invalid file type. Only Excel files are allowed",
        details: {
          extension: fileExtension,
          mimetype: uploadedFile.mimetype,
          validExtensions: validExtensions.join(", "),
          validMimetypes: validMimetypes.join(", "),
        },
      });
    }

    // Move file to uploads directory
    const fileName = `${Date.now()}-${uploadedFile.name.replace(
      /[^a-zA-Z0-9.-]/g,
      "_"
    )}`;
    const filePath = path.join(uploadDir, fileName);

    uploadedFile.mv(filePath, (err) => {
      if (err) {
        console.error("Error moving file:", err);
        return res
          .status(500)
          .json({ error: "Error saving file", details: err.message });
      }

      // Create file object with multer-compatible format
      req.file = {
        fieldname: "file",
        originalname: uploadedFile.name,
        encoding: "utf8",
        mimetype: uploadedFile.mimetype,
        size: uploadedFile.size,
        destination: uploadDir,
        filename: fileName,
        path: filePath,
      };

      console.log("File successfully saved to", filePath);
      next();
    });
  } catch (error) {
    console.error("File processing error:", error);
    return res.status(500).json({
      error: "Error processing uploaded file",
      details: error.message,
    });
  }
};
