// Poll for login status completion
const https = require('http');

const userId = 'user_9dee489189a644ee8fe869097846e97d_prome';
let attempts = 0;
const maxAttempts = 60; // 60 attempts * 2 seconds = 2 minutes timeout

function checkLoginStatus() {
    const options = {
        hostname: 'localhost',
        port: 8080,
        path: `/api/xiaohongshu/login/status?userId=${encodeURIComponent(userId)}`,
        method: 'GET'
    };

    const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            try {
                const response = JSON.parse(data);
                const isLoggedIn = response.data?.isLoggedIn || response.isLoggedIn || false;

                if (isLoggedIn) {
                    console.log('✅ 登录成功！Cookie已保存');
                    process.exit(0);
                } else {
                    attempts++;
                    if (attempts >= maxAttempts) {
                        console.log('⏱️ 登录超时，请重试');
                        process.exit(1);
                    } else {
                        console.log(`⏳ 等待扫码... (${attempts}/${maxAttempts})`);
                        setTimeout(checkLoginStatus, 2000);
                    }
                }
            } catch (error) {
                console.error('解析响应失败:', error.message);
                attempts++;
                if (attempts < maxAttempts) {
                    setTimeout(checkLoginStatus, 2000);
                } else {
                    process.exit(1);
                }
            }
        });
    });

    req.on('error', (error) => {
        console.error('请求失败:', error.message);
        attempts++;
        if (attempts < maxAttempts) {
            setTimeout(checkLoginStatus, 2000);
        } else {
            process.exit(1);
        }
    });

    req.end();
}

console.log('🔍 开始监听登录状态...');
checkLoginStatus();
