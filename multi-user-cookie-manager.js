#!/usr/bin/env node

/**
 * 多用户Cookie自动导入管理器
 * 支持在一台电脑上管理多个小红书账号的cookies
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MultiUserCookieManager {
    constructor() {
        this.baseDir = '/Users/channyLiu/xiaohongshumcp';
        this.mcpRouterCookiesDir = path.join(this.baseDir, 'playwright-service/mcp-router/cookies');
        this.mainCookiesDir = path.join(this.baseDir, 'cookies');

        this.ensureDirectories();
    }

    ensureDirectories() {
        [this.mcpRouterCookiesDir, this.mainCookiesDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    /**
     * 列出所有已配置的用户
     */
    listUsers() {
        console.log('📋 当前配置的用户列表:\n');

        // 检查MCP Router用户
        const mcpUsers = this.getMCPUsers();
        const mainUsers = this.getMainUsers();

        if (mcpUsers.length === 0 && mainUsers.length === 0) {
            console.log('❌ 暂无已配置的用户');
            return [];
        }

        console.log('🔧 MCP Router 用户:');
        mcpUsers.forEach((user, index) => {
            const cookieFile = path.join(this.mcpRouterCookiesDir, user, 'cookies.json');
            const exists = fs.existsSync(cookieFile);
            const size = exists ? fs.statSync(cookieFile).size : 0;
            const status = exists && size > 10 ? '✅' : '❌';

            console.log(`  ${index + 1}. ${user} ${status} (${size} bytes)`);
        });

        console.log('\n📁 主Cookie目录:');
        mainUsers.forEach((user, index) => {
            const cookieFile = path.join(this.mainCookiesDir, user);
            const exists = fs.existsSync(cookieFile);
            const size = exists ? fs.statSync(cookieFile).size : 0;
            const status = exists && size > 10 ? '✅' : '❌';

            console.log(`  ${index + 1}. ${user} ${status} (${size} bytes)`);
        });

        return [...mcpUsers, ...mainUsers];
    }

    getMCPUsers() {
        if (!fs.existsSync(this.mcpRouterCookiesDir)) return [];

        return fs.readdirSync(this.mcpRouterCookiesDir)
            .filter(item => {
                const fullPath = path.join(this.mcpRouterCookiesDir, item);
                return fs.statSync(fullPath).isDirectory();
            });
    }

    getMainUsers() {
        if (!fs.existsSync(this.mainCookiesDir)) return [];

        return fs.readdirSync(this.mainCookiesDir)
            .filter(item => item.endsWith('.json'));
    }

    /**
     * 为新用户创建配置
     */
    async addUser(userId) {
        console.log(`🆕 为用户 "${userId}" 创建配置...\n`);

        // 创建MCP Router用户目录
        const userDir = path.join(this.mcpRouterCookiesDir, userId);
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
            console.log(`✅ 创建MCP用户目录: ${userDir}`);
        }

        // 创建空的cookies.json
        const cookieFile = path.join(userDir, 'cookies.json');
        if (!fs.existsSync(cookieFile)) {
            fs.writeFileSync(cookieFile, '[]', 'utf8');
            console.log(`✅ 创建空cookie文件: ${cookieFile}`);
        }

        console.log(`\n🎯 接下来请按照以下步骤为用户 "${userId}" 导入cookies:`);
        console.log(`\n1. 在浏览器中登录小红书账号 "${userId}"`);
        console.log(`2. 打开开发者工具(F12) → Console`);
        console.log(`3. 运行cookie导出脚本`);
        console.log(`4. 运行: node multi-user-cookie-manager.js import ${userId}`);
    }

    /**
     * 导入用户cookies
     */
    async importUserCookies(userId) {
        console.log(`🍪 为用户 "${userId}" 导入cookies...\n`);

        // 检查用户目录是否存在
        const userDir = path.join(this.mcpRouterCookiesDir, userId);
        if (!fs.existsSync(userDir)) {
            console.log(`❌ 用户目录不存在: ${userDir}`);
            console.log(`请先运行: node multi-user-cookie-manager.js add ${userId}`);
            return;
        }

        console.log('请粘贴从浏览器导出的cookies JSON数组，然后按两次回车：');

        let input = '';
        const stdin = process.stdin;
        stdin.setRawMode(false);
        stdin.resume();
        stdin.setEncoding('utf8');

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

        // 解析并验证cookies
        try {
            input = input.trim();
            const cookies = JSON.parse(input);

            if (!Array.isArray(cookies)) {
                throw new Error('数据必须是一个数组');
            }

            if (cookies.length === 0) {
                throw new Error('Cookie数组不能为空');
            }

            console.log(`✅ 成功解析 ${cookies.length} 个cookies`);

            // 保存到用户的cookie文件
            const cookieFile = path.join(userDir, 'cookies.json');
            fs.writeFileSync(cookieFile, JSON.stringify(cookies, null, 2));
            console.log(`✅ Cookies已保存到: ${cookieFile}`);

            // 也保存到主cookie目录（可选）
            const mainCookieFile = path.join(this.mainCookiesDir, `${userId}.json`);
            fs.writeFileSync(mainCookieFile, JSON.stringify(cookies, null, 2));
            console.log(`✅ 备份保存到: ${mainCookieFile}`);

            console.log(`\n🎉 用户 "${userId}" 的cookies导入完成！`);
            console.log(`现在可以测试MCP登录状态: curl "http://localhost:3001/api/xiaohongshu/login/status?userId=${userId}"`);

        } catch (error) {
            console.error('❌ Cookie导入失败:', error.message);
        }
    }

    /**
     * 删除用户配置
     */
    removeUser(userId) {
        console.log(`🗑️ 删除用户 "${userId}" 的配置...\n`);

        let removed = false;

        // 删除MCP Router用户目录
        const userDir = path.join(this.mcpRouterCookiesDir, userId);
        if (fs.existsSync(userDir)) {
            fs.rmSync(userDir, { recursive: true });
            console.log(`✅ 删除MCP用户目录: ${userDir}`);
            removed = true;
        }

        // 删除主cookie文件
        const mainCookieFile = path.join(this.mainCookiesDir, `${userId}.json`);
        if (fs.existsSync(mainCookieFile)) {
            fs.unlinkSync(mainCookieFile);
            console.log(`✅ 删除主cookie文件: ${mainCookieFile}`);
            removed = true;
        }

        if (!removed) {
            console.log(`⚠️ 用户 "${userId}" 不存在或已被删除`);
        } else {
            console.log(`\n🎉 用户 "${userId}" 配置删除完成！`);
        }
    }

    /**
     * 显示帮助信息
     */
    showHelp() {
        console.log(`
🍪 多用户Cookie管理器 - 使用说明

命令格式: node multi-user-cookie-manager.js <command> [arguments]

可用命令:
  list                     - 列出所有配置的用户
  add <userId>            - 为新用户创建配置
  import <userId>         - 导入用户的cookies
  remove <userId>         - 删除用户配置
  help                    - 显示此帮助信息

使用示例:
  node multi-user-cookie-manager.js list
  node multi-user-cookie-manager.js add user1
  node multi-user-cookie-manager.js import user1
  node multi-user-cookie-manager.js remove user1

工作流程:
  1. add - 创建用户配置
  2. 在浏览器登录对应账号
  3. 导出cookies
  4. import - 导入cookies
  5. 测试MCP登录状态
        `);
    }
}

// 主程序
async function main() {
    const manager = new MultiUserCookieManager();
    const args = process.argv.slice(2);

    if (args.length === 0) {
        manager.showHelp();
        return;
    }

    const command = args[0];
    const userId = args[1];

    switch (command) {
        case 'list':
            manager.listUsers();
            break;

        case 'add':
            if (!userId) {
                console.log('❌ 请提供用户ID: node multi-user-cookie-manager.js add <userId>');
                return;
            }
            await manager.addUser(userId);
            break;

        case 'import':
            if (!userId) {
                console.log('❌ 请提供用户ID: node multi-user-cookie-manager.js import <userId>');
                return;
            }
            await manager.importUserCookies(userId);
            break;

        case 'remove':
            if (!userId) {
                console.log('❌ 请提供用户ID: node multi-user-cookie-manager.js remove <userId>');
                return;
            }
            manager.removeUser(userId);
            break;

        case 'help':
        default:
            manager.showHelp();
            break;
    }
}

main().catch(console.error);