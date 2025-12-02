
import axios from 'axios';
import fs from 'fs';

async function testApiEndpoint() {
    const userId = 'test_user_api_debug';
    const url = `http://localhost:8080/api/xiaohongshu/login/qrcode?userId=${userId}&force_qr=1`;

    console.log(`Testing API endpoint: ${url}`);

    try {
        const response = await axios.get(url, { timeout: 60000 });
        console.log('Response status:', response.status);
        console.log('Response data:', JSON.stringify(response.data, null, 2));

        if (response.data.success && response.data.data && response.data.data.img) {
            const base64Data = response.data.data.img.replace(/^data:image\/\w+;base64,/, "");
            const buffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync('debug_api_qr_code.png', buffer);
            console.log('QR code image saved to debug_api_qr_code.png');
        } else {
            console.error('QR code data not found in response');
        }

    } catch (error: any) {
        console.error('API request failed:', error.message);
        if (error.response) {
            console.error('Error response data:', error.response.data);
        }
    }
}

testApiEndpoint();
