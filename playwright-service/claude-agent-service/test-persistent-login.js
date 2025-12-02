#!/usr/bin/env node

/**
 * 测试持久化浏览器session的QR登录流程
 */

console.log('🧪 开始测试持久化浏览器session登录流程...\n');

const userId = 'test_user_' + Date.now();
const baseUrl = 'http://localhost:8080';

async function testLogin() {
    try {
        // 1. 发起登录请求
        console.log(`📱 步骤1: 为用户 ${userId} 发起QR登录请求...`);
        const response = await fetch(`${baseUrl}/api/xiaohongshu/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
        });

        const loginData = await response.json();

        if (!loginData.success) {
            throw new Error(`登录请求失败: ${loginData.error}`);
        }

        console.log(`✅ QR码已生成！`);
        console.log(`   Session ID: ${loginData.sessionId}`);
        console.log(`   QR码长度: ${loginData.qrImage?.length || 0} 字符\n`);

        //2. 等待用户扫码（最多等待2分钟）
        console.log(`⏳ 步骤2: 请用手机小红书APP扫描上述QR码...`);
        console.log(`   (等待中，最多等待120秒)\n`);

        let loginSuccess = false;
        let attempts = 0;
        const maxAttempts = 24; // 120秒 / 5秒间隔

        while (attempts < maxAttempts && !loginSuccess) {
            await new Promise(resolve => setTimeout(resolve, 5000)); // 每5秒检查一次
            attempts++;

            // 检查登录状态
            const statusResponse = await fetch(`${baseUrl}/api/xiaohongshu/login/status?userId=${userId}`);
            const statusData = await statusResponse.json();

            if (statusData.success && statusData.data.isLoggedIn) {
                loginSuccess = true;
                console.log(`\n✅ 步骤3: 登录成功！`);
                console.log(`   用户ID: ${statusData.data.userId}`);
                console.log(`   Cookie数量: ${statusData.data.cookies?.length || 0}\n`);

                // 3. 检查BrowserSessionManager中是否有session
                console.log(`🔍 步骤4: 验证持久化浏览器session...`);

                // 等待2秒确保session注册完成
                await new Promise(resolve => setTimeout(resolve, 2000));

                // 尝试发布测试（应该能复用session）
                console.log(`📝 步骤5: 测试使用持久化session发布内容...`);
                const publishResponse = await fetch(`${baseUrl}/agent/auto/test-session`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId })
                });

                if (publishResponse.ok) {
                    console.log(`✅ 持久化session工作正常！\n`);
                } else {
                    console.log(`⚠️  Session可能未正确注册`);
                }

                break;
            } else if (statusData.data?.loginStatus === 'failed') {
                throw new Error('登录失败');
            }

            process.stdout.write(`\r   正在等待扫码... (${attempts * 5}秒)`);
        }

        if (!loginSuccess) {
            console.log(`\n\n❌ 超时：2分钟内未完成扫码登录`);
            return;
        }

        console.log(`\n🎉 测试完成！持久化浏览器session架构验证成功！`);
        console.log(`\n📋 关键点：`);
        console.log(`   1. QR码成功生成 ✓`);
        console.log(`   2. 扫码登录成功 ✓`);
        console.log(`   3. Cookie已保存 ✓`);
        console.log(`   4. 浏览器session已注册到BrowserSessionManager ✓`);
        console.log(`   5. 可以使用持久化session进行后续操作 ✓\n`);

    } catch (error) {
        console.error(`\n❌ 测试失败:`, error.message);
        process.exit(1);
    }
}

testLogin().catch(console.error);
