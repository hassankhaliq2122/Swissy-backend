const { createUploadthing } = require("uploadthing/server");

const f = createUploadthing();

// Define your file router
const uploadRouter = {
    // Order files uploader (images, PDFs, design files)
    orderUploader: f({
        image: { maxFileSize: "16MB", maxFileCount: 5 },
        pdf: { maxFileSize: "16MB", maxFileCount: 5 },
        "application/octet-stream": { maxFileSize: "16MB", maxFileCount: 5 }, // For .ai, .eps, etc
    })
        .middleware(async ({ req }) => {
            // This runs before upload
            // You can add authentication here
            const token = req.headers.authorization?.split(' ')[1];
            if (!token) {
                throw new Error('Unauthorized');
            }

            return { userId: req.user?._id || 'anonymous' };
        })
        .onUploadComplete(async ({ metadata, file }) => {
            // This code runs after upload completes
            console.log("Upload complete for userId:", metadata.userId);
            console.log("File URL:", file.url);

            // Return data to client
            return { uploadedBy: metadata.userId, fileUrl: file.url };
        }),

    // Profile image uploader
    profileImage: f({ image: { maxFileSize: "4MB", maxFileCount: 1 } })
        .middleware(async ({ req }) => {
            const token = req.headers.authorization?.split(' ')[1];
            if (!token) {
                throw new Error('Unauthorized');
            }
            return { userId: req.user?._id };
        })
        .onUploadComplete(async ({ metadata, file }) => {
            console.log("Profile image uploaded:", file.url);
            return { fileUrl: file.url };
        }),
};

module.exports = { uploadRouter };
