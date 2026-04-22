const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Helper to fetch image buffer from URL with timeout
const fetchImageBuffer = (url) => {
    return new Promise((resolve, reject) => {
        const req = https.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`Failed to fetch image: ${res.statusCode}`));
                return;
            }
            const data = [];
            res.on('data', (chunk) => data.push(chunk));
            res.on('end', () => resolve(Buffer.concat(data)));
            res.on('error', (err) => reject(err));
        });

        req.on('error', (err) => reject(err));
        req.setTimeout(10000, () => { // 10s timeout
            req.destroy();
            reject(new Error('Image fetch timeout'));
        });
    });
};

exports.generateOrderPDF = async (order) => {
    console.log(`📄 Generating PDF for Order #${order.orderNumber}`);

    return new Promise(async (resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            const buffers = [];

            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                console.log(`✅ PDF generated successfully for Order #${order.orderNumber}`);
                const pdfData = Buffer.concat(buffers);
                resolve(pdfData);
            });

            doc.on('error', (err) => {
                console.error('❌ PDFKit Error:', err);
                reject(err);
            });

            // Header
            doc.fontSize(24).text('ORDER DETAILS', { align: 'center' });
            doc.moveDown();
            doc.fontSize(12).text(`Order #: ${order.orderNumber}`, { align: 'right' });
            doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`, { align: 'right' });
            doc.moveDown();

            // Order Info Table
            const startX = 50;
            let currentY = doc.y;

            doc.font('Helvetica-Bold').text('Customer:', startX, currentY);
            doc.font('Helvetica').text(order.customerId?.name || 'N/A', startX + 100, currentY);
            currentY += 20;

            doc.font('Helvetica-Bold').text('Order Type:', startX, currentY);
            doc.font('Helvetica').text(order.orderType ? order.orderType.toUpperCase() : 'N/A', startX + 100, currentY);
            currentY += 20;

            const designName = order.orderType === 'patches' ? order.patchDesignName : order.designName;
            doc.font('Helvetica-Bold').text('Design Name:', startX, currentY);
            doc.font('Helvetica').text(designName || 'N/A', startX + 100, currentY);
            currentY += 30;

            // Specific Details based on Type
            doc.font('Helvetica-Bold').fontSize(14).text('Specifications', startX, currentY);
            currentY += 20;
            doc.fontSize(12);

            if (order.orderType === 'patches') {
                doc.text(`Quantity: ${order.patchQuantity || '-'}`);
                doc.text(`Size: ${order.patchLength || '-'} x ${order.patchWidth || '-'} ${order.patchUnit || ''}`);
                doc.text(`Style: ${order.patchStyle || '-'}`);
                doc.text(`Backing: ${order.patchBackingStyle || '-'}`);
            } else if (order.orderType === 'digitizing') {
                doc.text(`Size: ${order.length || '-'} x ${order.width || '-'} ${order.unit || ''}`);
                doc.text(`Placement: ${order.PlacementofDesign || '-'}`);
            } else if (order.orderType === 'vector') {
                doc.text(`Format: ${order.fileFormat || '-'}`);
            }

            doc.moveDown();
            if (order.notes) {
                doc.font('Helvetica-Bold').text('Notes:');
                doc.font('Helvetica').text(order.notes);
                doc.moveDown();
            }

            // Embed Images & Files
            if (order.files && order.files.length > 0) {
                doc.addPage();
                doc.font('Helvetica-Bold').fontSize(16).text('Design Files / Images', { align: 'center' });
                doc.moveDown();

                for (const file of order.files) {
                    const isImage = /\.(jpg|jpeg|png)$/i.test(file.filename);
                    const isCloudinary = file.url && file.url.startsWith('http');

                    doc.fontSize(12).font('Helvetica-Bold').fillColor('black').text(`File: ${file.filename}`);

                    // Add clickable link
                    const fileUrl = isCloudinary ? file.url : `http://localhost:5000${file.url}`;
                    doc.fontSize(10).font('Helvetica').fillColor('blue')
                        .text('Download / View File', { link: fileUrl, underline: true });
                    doc.fillColor('black').moveDown();

                    if (isImage) {
                        try {
                            let imageBuffer;
                            if (isCloudinary) {
                                console.log(`☁️ Fetching image from Cloudinary: ${file.url}`);
                                imageBuffer = await fetchImageBuffer(file.url);
                            } else {
                                const localPath = path.join(__dirname, '..', file.url);
                                if (fs.existsSync(localPath)) {
                                    imageBuffer = localPath;
                                }
                            }

                            if (imageBuffer) {
                                // Scale image to fit page width
                                doc.image(imageBuffer, {
                                    fit: [495, 400],
                                    align: 'center',
                                    valign: 'center'
                                });
                                doc.moveDown();
                            }
                        } catch (err) {
                            console.error(`⚠️ Failed to embed image ${file.filename}:`, err.message);
                            doc.text(`[Could not embed image: ${err.message}]`);
                        }
                    } else {
                        doc.text('[Preview not available for this file type]');
                    }
                    doc.moveDown(2);
                }
            }

            doc.end();
        } catch (err) {
            console.error('❌ Critical PDF Generation Error:', err);
            reject(err);
        }
    });
};
