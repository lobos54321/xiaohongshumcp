#!/usr/bin/env node

/**
 * Browser Cookie Extractor for Production MCP
 * 专为生产环境设计的浏览器Cookie导入工具
 * 解决浏览器登录状态与MCP进程隔离的问题
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class BrowserCookieExtractor {
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
     * 生成浏览器Cookie导出脚本
     * 用户在浏览器控制台运行此脚本来导出cookies
     */
    generateBrowserScript() {
        const script = `
// 🚀 小红书Cookie导出脚本 - 生产环境专用
// 运行环境检查
if (!window.location.href.includes('xiaohongshu.com')) {
    alert('⚠️ 请在小红书网站运行此脚本');
    throw new Error('请在小红书网站运行');
}

function exportXiaohongshuCookies() {
    try {
        console.log('🍪 开始导出小红书Cookies...');

        // 获取关键cookies
        const criticalCookies = [
            'web_session', 'webId', 'a1', 'websectiga', 'sec_poison_id',
            'xhsTrackerId', 'smidV2', 'gid', 'extra_data', 'webBuild',
            'timestamp', 'unread', 'xsecappid', 'cache_key'
        ];

        const allCookies = document.cookie.split(';').map(cookie => {
            const [name, ...valueParts] = cookie.trim().split('=');
            const value = valueParts.join('=');
            return {
                name: name.trim(),
                value: value || '',
                domain: '.xiaohongshu.com',
                path: '/',
                expires: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30天
                httpOnly: false,
                secure: true,
                sameSite: 'Lax'
            };
        }).filter(cookie => cookie.name && cookie.value);

        // 验证关键cookies是否存在
        const foundCritical = criticalCookies.filter(name =>
            allCookies.some(cookie => cookie.name === name)
        );

        console.log(\`✅ 找到 \${allCookies.length} 个cookies\`);
        console.log(\`🔑 关键cookies: \${foundCritical.length}/\${criticalCookies.length} 个\`);

        if (foundCritical.length < 3) {
            console.warn('⚠️ 关键cookies较少，可能需要重新登录');
        }

        // 生成导出数据
        const exportData = {
            timestamp: new Date().toISOString(),
            domain: 'xiaohongshu.com',
            cookieCount: allCookies.length,
            criticalCount: foundCritical.length,
            userAgent: navigator.userAgent,
            cookies: allCookies
        };

        console.log('\\n📋 Cookie导出完成！请复制以下JSON数据:');
        console.log('='.repeat(60));
        console.log(JSON.stringify(exportData, null, 2));
        console.log('='.repeat(60));

        // 尝试复制到剪贴板
        if (navigator.clipboard) {
            navigator.clipboard.writeText(JSON.stringify(exportData, null, 2))
                .then(() => console.log('✅ 已复制到剪贴板！'))
                .catch(() => console.log('⚠️ 请手动复制上面的JSON数据'));
        }

        return exportData;

    } catch (error) {
        console.error('❌ Cookie导出失败:', error.message);
        alert('Cookie导出失败: ' + error.message);
    }
}

// 运行导出
console.log('🏃‍♂️ 执行Cookie导出...');
exportXiaohongshuCookies();
`;

        console.log('📄 浏览器Cookie导出脚本:\n');
        console.log('='.repeat(80));
        console.log(script);
        console.log('='.repeat(80));

        return script;
    }

    /**
     * 导入浏览器导出的cookie数据
     */
    async importBrowserCookies() {
        console.log('📥 导入浏览器Cookie数据...\n');

        console.log('步骤说明:');
        console.log('1. 在Chrome中打开 https://www.xiaohongshu.com');
        console.log('2. 确保已登录');
        console.log('3. 按F12打开开发者工具');
        console.log('4. 运行上面的Cookie导出脚本');
        console.log('5. 复制导出的JSON数据');
        console.log('6. 粘贴到下方并按两次回车\n');

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

        try {
            input = input.trim();
            const data = JSON.parse(input);

            if (!data.cookies || !Array.isArray(data.cookies)) {
                throw new Error('无效的Cookie数据格式');
            }

            console.log(`✅ 解析成功: ${data.cookies.length} 个cookies`);
            console.log(`📅 导出时间: ${data.timestamp}`);
            console.log(`🔑 关键cookies: ${data.criticalCount} 个`);

            // 导入到所有MCP用户目录
            const userDirs = this.getMCPUserDirs();

            if (userDirs.length === 0) {
                // 创建默认用户目录
                const defaultUserDir = path.join(this.mcpRouterCookiesDir, 'xiaohongshu-user');
                fs.mkdirSync(defaultUserDir, { recursive: true });
                userDirs.push('xiaohongshu-user');
                console.log('📁 创建默认用户目录: xiaohongshu-user');
            }

            for (const userDir of userDirs) {
                const cookieFile = path.join(this.mcpRouterCookiesDir, userDir, 'cookies.json');
                fs.writeFileSync(cookieFile, JSON.stringify(data.cookies, null, 2));
                console.log(`✅ 导入到: ${userDir}`);
            }

            // 备份到主目录
            const mainCookieFile = path.join(this.mainCookiesDir, 'xiaohongshu-browser-cookies.json');
            fs.writeFileSync(mainCookieFile, JSON.stringify(data, null, 2));
            console.log(`💾 备份到: ${mainCookieFile}`);

            console.log('\n🎉 Cookie导入完成！');
            console.log('现在可以测试MCP登录状态了');

            return { success: true, userCount: userDirs.length, cookieCount: data.cookies.length };

        } catch (error) {
            console.error('❌ 导入失败:', error.message);
            throw error;
        }
    }

    getMCPUserDirs() {
        if (!fs.existsSync(this.mcpRouterCookiesDir)) return [];

        return fs.readdirSync(this.mcpRouterCookiesDir)
            .filter(item => {
                const fullPath = path.join(this.mcpRouterCookiesDir, item);
                return fs.statSync(fullPath).isDirectory();
            });
    }

    /**
     * 验证导入的cookies是否有效
     */
    async validateCookies() {
        console.log('🔍 验证Cookie状态...\n');

        const userDirs = this.getMCPUserDirs();

        for (const userDir of userDirs) {
            const cookieFile = path.join(this.mcpRouterCookiesDir, userDir, 'cookies.json');

            if (fs.existsSync(cookieFile)) {
                try {
                    const cookies = JSON.parse(fs.readFileSync(cookieFile, 'utf8'));
                    const criticalCookies = ['web_session', 'webId', 'a1'];
                    const hasCritical = criticalCookies.filter(name =>
                        cookies.some(cookie => cookie.name === name && cookie.value)
                    );

                    console.log(`📁 ${userDir}:`);
                    console.log(`  🍪 总cookies: ${cookies.length}`);
                    console.log(`  🔑 关键cookies: ${hasCritical.length}/${criticalCookies.length}`);
                    console.log(`  📊 状态: ${hasCritical.length >= 2 ? '✅ 良好' : '⚠️ 需要更新'}`);

                } catch (error) {
                    console.log(`📁 ${userDir}: ❌ Cookie文件损坏`);
                }
            } else {
                console.log(`📁 ${userDir}: ❌ Cookie文件不存在`);
            }
        }
    }
}

// 命令行接口
async function main() {
    const extractor = new BrowserCookieExtractor();
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log(`
🍪 浏览器Cookie导入工具 - 生产环境专用

用法: node browser-cookie-extractor.js <command>

命令:
  script    - 生成浏览器导出脚本
  import    - 导入浏览器cookies到MCP
  validate  - 验证已导入的cookies状态
  help      - 显示帮助

示例:
  node browser-cookie-extractor.js script
  node browser-cookie-extractor.js import
  node browser-cookie-extractor.js validate

工作流程:
  1. script  - 获取浏览器导出脚本
  2. 在浏览器中运行脚本导出cookies
  3. import  - 将导出的cookies导入MCP系统
  4. validate - 验证导入结果
        `);
        return;
    }

    const command = args[0];

    try {
        switch (command) {
            case 'script':
                extractor.generateBrowserScript();
                break;

            case 'import':
                await extractor.importBrowserCookies();
                break;

            case 'validate':
                await extractor.validateCookies();
                break;

            case 'help':
            default:
                console.log('请使用: node browser-cookie-extractor.js <script|import|validate|help>');
                break;
        }
    } catch (error) {
        console.error('❌ 操作失败:', error.message);
        process.exit(1);
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export { BrowserCookieExtractor };