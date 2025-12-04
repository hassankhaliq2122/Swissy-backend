const express = require('express');
const { createUploadthing } = require("uploadthing/server");

const router = express.Router();

// Initialize UploadThing
const f = createUploadthing();

// Define file router
const uploadRouter = {
    orderUploader: f({
        image: { maxFileSize: "16MB", maxFileCount: 5 },
        pdf: { maxFileSize: "16MB", maxFileCount: 5 },
    })
        .middleware(async ({ req }) => {
            console.log("📤 Upload middleware triggered");
            // For now, allow all uploads
            return { userId: req.user?._id || 'anonymous' };
        })
        .onUploadComplete(async ({ metadata, file }) => {
            console.log("✅ Upload complete!");
            console.log("File URL:", file.url);
            console.log("File name:", file.name);
            return { fileUrl: file.url };
        }),
};

// Export for UploadThing to use
router.post('/', async (req, res) => {
    try {
        console.log("🎯 UploadThing POST request received");
        console.log("Headers:", req.headers);

        // UploadThing expects specific handling
        // For now, send a response that the frontend can work with
        res.json({
            message: "UploadThing endpoint reached",
            url: "/api/uploadthing"
        });
    } catch (error) {
        console.error('❌ UploadThing error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Handle OPTIONS for CORS
router.options('/', (req, res) => {
    res.status(200).end();
});

module.exports = router;
