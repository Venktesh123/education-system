const { BlobServiceClient } = require("@azure/storage-blob");

// Initialize Azure Blob Service Client
const blobServiceClient = BlobServiceClient.fromConnectionString(
  `DefaultEndpointsProtocol=https;AccountName=${process.env.AZURE_STORAGE_ACCOUNT_NAME};AccountKey=${process.env.AZURE_STORAGE_ACCOUNT_KEY};EndpointSuffix=core.windows.net`
);

// Get container client
const containerClient = blobServiceClient.getContainerClient(
  process.env.AZURE_STORAGE_CONTAINER_NAME
);

// Upload file to Azure Blob Storage
const uploadFileToAzure = async (file, path) => {
  console.log("Uploading file to Azure Blob Storage");
  try {
    // Make sure we have the file data
    const fileContent = file.data;
    if (!fileContent) {
      console.log("No file content found");
      throw new Error("No file content found");
    }

    // Generate a unique filename
    const fileName = `${path}/${Date.now()}-${file.name.replace(/\s+/g, "-")}`;

    console.log("Azure upload params prepared");

    // Get a block blob client
    const blockBlobClient = containerClient.getBlockBlobClient(fileName);

    // Upload data to the blob
    const uploadBlobResponse = await blockBlobClient.upload(
      fileContent,
      fileContent.length,
      {
        blobHTTPHeaders: {
          blobContentType: file.mimetype,
        },
      }
    );

    console.log("File uploaded successfully:", fileName);

    // Return the blob URL and key
    return {
      url: blockBlobClient.url,
      key: fileName,
    };
  } catch (error) {
    console.log("Azure upload error:", error);
    throw error;
  }
};

// Delete file from Azure Blob Storage
const deleteFileFromAzure = async (key) => {
  console.log("Deleting file from Azure Blob Storage:", key);
  try {
    if (!key) {
      console.log("No file key provided");
      return { message: "No file key provided" };
    }

    // Get a block blob client
    const blockBlobClient = containerClient.getBlockBlobClient(key);

    // Delete the blob
    await blockBlobClient.delete();

    console.log("File deleted successfully from Azure Blob Storage");
    return { message: "File deleted successfully" };
  } catch (error) {
    console.log("Azure delete error:", error);
    throw error;
  }
};

// Check if container exists and create if it doesn't
const initializeContainer = async () => {
  try {
    console.log("Checking if container exists...");
    const exists = await containerClient.exists();

    if (!exists) {
      console.log("Container does not exist, creating...");
      await containerClient.create({
        access: "blob", // This makes blobs publicly accessible
      });
      console.log("Container created successfully");
    } else {
      console.log("Container already exists");
    }
  } catch (error) {
    console.error("Error initializing container:", error);
    throw error;
  }
};

module.exports = {
  uploadFileToAzure,
  deleteFileFromAzure,
  initializeContainer,
  blobServiceClient,
  containerClient,
};
