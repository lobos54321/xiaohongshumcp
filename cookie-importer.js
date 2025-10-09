#!/usr/bin/env node

// Cookie导入器 - 将浏览器cookies导入到MCP系统
// 使用方法: node cookie-importer.js

const fs = require('fs');
const path = require('path');

async function importCookies() {
    try {
        console.log('🍪 Cookie导入器启动');

        // 读取从浏览器导出的cookies
        console.log('\n请粘贴从浏览器导出的cookies JSON数组，然后按两次回车：');

        let input = '';
        const stdin = process.stdin;
        stdin.setRawMode(false);
        stdin.resume();
        stdin.setEncoding('utf8');

        // 等待用户输入
        await new Promise((resolve) => {
            let emptyLines = 0;
            stdin.on('data', (data) => {
                if (data === '\n') {
                    emptyLines++;
                    if (emptyLines >= 2) {
                        stdin.pause();
                        resolve();
                        return;
                    }
                } else {
                    emptyLines = 0;
                }
                input += data;
            });
        });

        // 清理输入，移除多余的换行符
        input = input.trim();

        // 尝试解析JSON
        let cookies;
        try {
            cookies = JSON.parse(input);
        } catch (error) {
            console.error('❌ JSON解析失败:', error.message);
            console.log('请确保粘贴的是有效的JSON数组');
            process.exit(1);
        }

        if (!Array.isArray(cookies)) {
            console.error('❌ 数据格式错误: 需要一个数组');
            process.exit(1);
        }

        console.log(`✅ 成功解析 ${cookies.length} 个cookies`);

        // 找到所有用户的cookie目录
        const routerCookiesDir = '/Users/channyLiu/xiaohongshumcp/playwright-service/mcp-router/cookies';
        const mcpCookiesDir = '/Users/channyLiu/xiaohongshumcp/cookies';

        const dirs = [];

        // 检查MCP Router的cookie目录
        if (fs.existsSync(routerCookiesDir)) {
            const userDirs = fs.readdirSync(routerCookiesDir).filter(dir => {
                const fullPath = path.join(routerCookiesDir, dir);
                return fs.statSync(fullPath).isDirectory();
            });

            userDirs.forEach(userDir => {
                dirs.push({
                    path: path.join(routerCookiesDir, userDir, 'cookies.json'),
                    user: userDir,
                    type: 'MCP Router'
                });
            });
        }

        // 检查主MCP目录
        if (fs.existsSync(mcpCookiesDir)) {
            dirs.push({
                path: path.join(mcpCookiesDir, 'cookies.json'),
                user: 'main',
                type: 'Main MCP'
            });
        }

        if (dirs.length === 0) {
            console.log('⚠️ 未找到MCP cookie目录，创建默认目录...');

            // 创建测试用户目录
            const testUserDir = path.join(routerCookiesDir, 'test-user');
            fs.mkdirSync(testUserDir, { recursive: true });

            dirs.push({
                path: path.join(testUserDir, 'cookies.json'),
                user: 'test-user',
                type: 'MCP Router'
            });
        }

        // 导入cookies到所有目录
        for (const dir of dirs) {
            try {
                fs.writeFileSync(dir.path, JSON.stringify(cookies, null, 2));
                console.log(`✅ 已导入到 ${dir.type} - ${dir.user}: ${dir.path}`);
            } catch (error) {
                console.error(`❌ 导入失败 ${dir.path}:`, error.message);
            }
        }

        console.log('\n🎉 Cookie导入完成！');
        console.log('现在可以测试MCP登录状态...');

    } catch (error) {
        console.error('❌ 导入失败:', error);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    importCookies();
}

module.exports = { importCookies };