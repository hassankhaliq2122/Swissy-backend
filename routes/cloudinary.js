const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { uploadToCloudinary, uploadBufferToCloudinary } = require('../utils/cloudinaryService');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Configure multer for temporary file storage
const upload = multer({
    storage: multer.memoryStorage(), // Store in memory, not disk
    limits: { fileSize: 16 * 1024 * 1024 }, // 16MB limit
    fileFilter: (req, file, cb) => {
        // Extract file extension
        const ext = file.originalname.toLowerCase().split('.').pop();

        // Common image MIME types
        const imageMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml'];

        // Design files (check by extension since MIME types vary)
        const designExtensions = ['ai', 'eps', 'cdr', 'pdf', 'dst','dgt', 'emb'];

        const isImage = imageMimeTypes.includes(file.mimetype);
        const isDesignFile = designExtensions.includes(ext);

        if (isImage || isDesignFile) {
            return cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only images and design files (.ai, .eps, .cdr, .pdf, .svg, .dst,.dgt, .emb) allowed.'));
        }
    }
});

/**
 * POST /api/cloudinary/upload
 * Upload single or multiple files to Cloudinary
 */
router.post('/upload', protect, upload.array('files', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No files provided'
            });
        }

        console.log(`📤 Uploading ${req.files.length} file(s) to Cloudinary...`);

        // Upload files from memory buffer
        const uploadPromises = req.files.map(file =>
            uploadBufferToCloudinary(
                file.buffer,
                req.body.folder || 'orders',
                file.originalname
            )
        );

        const results = await Promise.all(uploadPromises);

        // Format results for frontend
        const files = results.map((result, index) => ({
            url: result.url,
            publicId: result.publicId,
            filename: req.files[index].originalname,
            size: result.bytes,
            format: result.format,
            resourceType: result.resourceType,
        }));

        console.log(`✅ Successfully uploaded ${files.length} file(s)`);

        res.json({
            success: true,
            message: `${files.length} file(s) uploaded successfully`,
            files,
        });

    } catch (error) {
        console.error('❌ Upload error:', error);
        res.status(500).json({
            success: false,
            message: 'Upload failed',
            error: error.message,
        });
    }
});

/**
 * POST /api/cloudinary/upload-single
 * Upload single file (simplified endpoint)
 */
router.post('/upload-single', protect, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file provided'
            });
        }

        const result = await uploadBufferToCloudinary(
            req.file.buffer,
            req.body.folder || 'orders',
            req.file.originalname
        );

        res.json({
            success: true,
            message: 'File uploaded successfully',
            file: {
                url: result.url,
                publicId: result.publicId,
                filename: req.file.originalname,
                size: result.bytes,
                format: result.format,
            },
        });

    } catch (error) {
        console.error('❌ Upload error:', error);
        res.status(500).json({
            success: false,
            message: 'Upload failed',
            error: error.message,
        });
    }
});

module.exports = router;
