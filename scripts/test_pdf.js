const { generateOrderPDF } = require('../utils/pdfService');
const fs = require('fs');

const mockOrder = {
    orderNumber: 'TEST-123',
    createdAt: new Date(),
    customerId: { name: 'Test Customer' },
    orderType: 'vector',
    files: [
        {
            filename: 'sample.jpg',
            url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg'
        }
    ]
};

(async () => {
    try {
        console.log('Starting PDF generation...');
        const buffer = await generateOrderPDF(mockOrder);
        console.log('PDF generated, size:', buffer.length);
        fs.writeFileSync('test_output.pdf', buffer);
        console.log('Saved to test_output.pdf');
    } catch (err) {
        console.error('Test failed:', err);
    }
})();
