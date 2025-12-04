const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload file to Cloudinary
 * @param {String} filePath - Path to file on server
 * @param {String} folder - Cloudinary folder (e.g., 'orders', 'profiles')
 * @returns {Promise<Object>} Upload result with URL
 */
const uploadToCloudinary = async (filePath, folder = 'orders') => {
    try {
        console.log(`☁️ Uploading to Cloudinary: ${filePath}`);

        const result = await cloudinary.uploader.upload(filePath, {
            folder: `swiss-project/${folder}`,
            resource_type: 'auto', // Handles images, PDFs, and other files
            allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'ai', 'eps', 'cdr', 'svg', 'webp'],
        });

        console.log(`✅ Upload successful: ${result.secure_url}`);

        return {
            url: result.secure_url,
            publicId: result.public_id,
            format: result.format,
            resourceType: result.resource_type,
            bytes: result.bytes,
            originalFilename: result.original_filename,
        };
    } catch (error) {
        console.error('❌ Cloudinary upload error:', error);
        throw new Error(`Upload failed: ${error.message}`);
    }
};

/**
 * Upload multiple files to Cloudinary
 * @param {Array} files - Array of file paths
 * @param {String} folder - Cloudinary folder
 * @returns {Promise<Array>} Array of upload results
 */
const uploadMultipleToCloudinary = async (files, folder = 'orders') => {
    try {
        const uploadPromises = files.map(file => uploadToCloudinary(file, folder));
        return await Promise.all(uploadPromises);
    } catch (error) {
        console.error('❌ Multiple upload error:', error);
        throw error;
    }
};

/**
 * Delete file from Cloudinary
 * @param {String} publicId - Cloudinary public ID
 * @returns {Promise<Object>} Deletion result
 */
const deleteFromCloudinary = async (publicId) => {
    try {
        console.log(`🗑️ Deleting from Cloudinary: ${publicId}`);
        const result = await cloudinary.uploader.destroy(publicId);
        console.log(`✅ Deletion successful`);
        return result;
    } catch (error) {
        console.error('❌ Cloudinary deletion error:', error);
        throw new Error(`Deletion failed: ${error.message}`);
    }
};

/**
 * Upload from buffer (direct upload without saving to disk)
 * @param {Buffer} buffer - File buffer
 * @param {String} folder - Cloudinary folder
 * @param {String} filename - Original filename
 * @returns {Promise<Object>} Upload result
 */
const uploadBufferToCloudinary = (buffer, folder = 'orders', filename = 'file') => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: `swiss-project/${folder}`,
                resource_type: 'auto',
                public_id: filename,
            },
            (error, result) => {
                if (error) {
                    console.error('❌ Buffer upload error:', error);
                    reject(error);
                } else {
                    console.log(`✅ Buffer upload successful: ${result.secure_url}`);
                    resolve({
                        url: result.secure_url,
                        publicId: result.public_id,
                        format: result.format,
                        resourceType: result.resource_type,
                        bytes: result.bytes,
                    });
                }
            }
        );

        uploadStream.end(buffer);
    });
};

module.exports = {
    uploadToCloudinary,
    uploadMultipleToCloudinary,
    deleteFromCloudinary,
    uploadBufferToCloudinary,
    cloudinary,
};
