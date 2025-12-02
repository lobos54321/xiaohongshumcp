const fs = require('fs');

// Read the QR code response
const response = JSON.parse(fs.readFileSync('qrcode-response.json', 'utf-8'));

// Extract the base64 image data
const base64Data = response.data?.img || response.img;

if (!base64Data) {
    console.error('No image data found in response');
    console.log('Response:', JSON.stringify(response, null, 2));
    process.exit(1);
}

// Check if it's a data URL
if (base64Data.startsWith('data:image')) {
    // Extract the actual base64 part (after "data:image/png;base64,")
    const base64String = base64Data.split(',')[1];
    const buffer = Buffer.from(base64String, 'base64');
    fs.writeFileSync('login-qrcode.png', buffer);
    console.log('✅ QR code saved to login-qrcode.png');
} else {
    console.error('Invalid image data format');
    process.exit(1);
}
