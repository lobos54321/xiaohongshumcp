
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const API_URL = 'http://localhost:8080';
const USER_ID = 'test_user_qr_debug';

async function testQRGeneration() {
    console.log(`Testing QR code generation for user: ${USER_ID}`);
    try {
        const response = await axios.get(`${API_URL}/agent/xiaohongshu/login/qr?userId=${USER_ID}`, {
            timeout: 60000 // 60s timeout
        });

        console.log('Response status:', response.status);
        console.log('Response data success:', response.data.success);

        if (response.data.success && response.data.data && response.data.data.qrcode_url) {
            const qrDataUrl = response.data.data.qrcode_url;
            console.log('QR Code Data URL found (length):', qrDataUrl.length);

            if (qrDataUrl.startsWith('data:image')) {
                const base64Data = qrDataUrl.replace(/^data:image\/\w+;base64,/, "");
                const buffer = Buffer.from(base64Data, 'base64');
                const outputPath = path.join(process.cwd(), 'debug_qr_code.png');
                fs.writeFileSync(outputPath, buffer);
                console.log(`QR code image saved to: ${outputPath}`);
            } else {
                console.log('QR code is not a data URL:', qrDataUrl.substring(0, 50) + '...');
            }
        } else {
            console.error('Failed to get QR code from response:', JSON.stringify(response.data, null, 2));
        }

    } catch (error) {
        console.error('Error calling QR endpoint:', error.message);
        if (error.response) {
            console.error('Error response data:', error.response.data);
        }
    }
}

testQRGeneration();
