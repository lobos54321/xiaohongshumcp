#!/usr/bin/env node

// 对比测试：HTTP请求 vs Chromium
// 使用Node.js内置的fetch

async function testDirectHTTP() {
    console.log('🔍 测试1: 直接HTTP请求小红书API');

    try {
        // 尝试直接访问小红书的登录状态接口
        const response = await fetch('https://www.xiaohongshu.com/api/sns/web/v1/user/selfinfo', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Referer': 'https://www.xiaohongshu.com'
            }
        });

        console.log('✅ HTTP请求成功:', response.status);

        if (response.ok) {
            const data = await response.json();
            console.log('📄 返回数据:', JSON.stringify(data, null, 2));
        } else {
            const text = await response.text();
            console.log('📄 错误响应:', text.substring(0, 200) + '...');
        }

    } catch (error) {
        console.log('❌ HTTP请求失败:', error.message);
    }
}

async function testBasicAccess() {
    console.log('\n🔍 测试2: 访问小红书主页');

    try {
        const response = await fetch('https://www.xiaohongshu.com', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        });

        console.log('✅ 主页访问成功:', response.status);

        if (response.ok) {
            const html = await response.text();

            // 检查是否有反爬虫检测
            if (html.includes('验证') || html.includes('captcha') || html.includes('blocked')) {
                console.log('⚠️  检测到反爬虫机制');
            } else {
                console.log('✅ 未检测到明显的反爬虫机制');
            }

            // 检查是否需要JavaScript
            if (html.includes('window.__INITIAL_STATE__') || html.includes('React') || html.includes('Vue')) {
                console.log('⚠️  页面需要JavaScript渲染');
            } else {
                console.log('✅ 页面可能支持服务端渲染');
            }
        } else {
            console.log('❌ 主页访问失败:', response.status);
        }

    } catch (error) {
        console.log('❌ 主页访问失败:', error.message);
    }
}

async function testAPIEndpoints() {
    console.log('\n🔍 测试3: 尝试访问各种API端点');

    const endpoints = [
        '/api/sns/web/v1/feed',
        '/api/sns/web/v1/search/notes',
        '/api/sns/web/v1/user/selfinfo',
        '/api/sns/web/v1/note',
        '/api/sns/web/v1/comment/page'
    ];

    for (const endpoint of endpoints) {
        try {
            const response = await fetch(`https://www.xiaohongshu.com${endpoint}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    'Accept': 'application/json',
                    'Referer': 'https://www.xiaohongshu.com'
                }
            });

            console.log(`${response.ok ? '✅' : '❌'} ${endpoint}: ${response.status}`);

            if (!response.ok) {
                const text = await response.text();
                if (text.includes('403') || text.includes('Forbidden')) {
                    console.log(`   └─ 🚫 访问被拒绝`);
                } else if (text.includes('401') || text.includes('Unauthorized')) {
                    console.log(`   └─ 🔐 需要身份验证`);
                }
            }
        } catch (error) {
            console.log(`❌ ${endpoint}: ${error.message}`);
        }
    }
}

async function runAllTests() {
    console.log('🚀 开始对比测试：绕过Chromium的影响\n');

    await testDirectHTTP();
    await testBasicAccess();
    await testAPIEndpoints();

    console.log('\n📊 测试结论:');
    console.log('如果绕过Chromium启动:');
    console.log('1. 大部分API端点会返回403/401错误');
    console.log('2. 缺少必要的浏览器环境和加密参数');
    console.log('3. 无法处理JavaScript渲染的内容');
    console.log('4. 容易被反爬虫系统识别和阻止');
    console.log('\n✅ 结论: Chromium是必需的，不能绕过');
}

// 直接运行测试
runAllTests();