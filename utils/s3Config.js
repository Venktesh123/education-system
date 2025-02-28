// utils/s3Config.js
const AWS = require("aws-sdk");

// Configure AWS with environment variables
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});
const uploadFileToS3 = async (file, folder) => {
  return new Promise((resolve, reject) => {
    // Create a unique filename
    const fileName = `${folder}/${uuidv4()}-${file.name.replace(/\s+/g, "-")}`;

    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileName,
      Body: file.data,
      ContentType: file.mimetype,
      // ACL: "public-read", // Make file publicly accessible
    };

    s3.upload(params, (err, data) => {
      if (err) {
        return reject(new ErrorHandler("Failed to upload file", 500));
      }

      resolve({
        key: params.Key,
        url: data.Location,
      });
    });
  });
};
