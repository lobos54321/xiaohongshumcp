#!/usr/bin/env node

/**
 * 企业级多用户Cookie管理系统
 * 适用于：多个员工在各自电脑登录，统一导入到MCP服务器
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EnterpriseCookieManager {
    constructor() {
        this.baseDir = '/Users/channyLiu/xiaohongshumcp';
        this.mcpRouterCookiesDir = path.join(this.baseDir, 'playwright-service/mcp-router/cookies');
        this.mainCookiesDir = path.join(this.baseDir, 'cookies');
        this.inboxDir = path.join(this.baseDir, 'cookie-inbox');
        this.logsDir = path.join(this.baseDir, 'logs');

        this.ensureDirectories();
    }

    ensureDirectories() {
        [this.mcpRouterCookiesDir, this.mainCookiesDir, this.inboxDir, this.logsDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    /**
     * 生成员工cookie导出包
     */
    generateEmployeePackage(employeeId, employeeName) {
        console.log(`📦 为员工生成cookie导出包...`);
        console.log(`员工ID: ${employeeId}`);
        console.log(`员工姓名: ${employeeName}\n`);

        // 创建员工专用目录
        const packageDir = path.join(this.inboxDir, `${employeeId}-package`);
        if (!fs.existsSync(packageDir)) {
            fs.mkdirSync(packageDir, { recursive: true });
        }

        // 生成员工专用的cookie导出脚本
        const exportScript = `
// 🍪 ${employeeName} 专用Cookie导出脚本
// 员工ID: ${employeeId}
// 生成时间: ${new Date().toLocaleString('zh-CN')}

console.log('🏢 企业Cookie导出工具启动');
console.log('员工: ${employeeName} (${employeeId})');
console.log('请确保已在小红书网站登录');

// 检查当前网站
if (!window.location.href.includes('xiaohongshu.com')) {
    alert('⚠️ 请在小红书网站 (xiaohongshu.com) 运行此脚本');
    throw new Error('请在小红书网站运行此脚本');
}

// 导出cookies
function exportCookiesForEmployee() {
    try {
        const cookies = document.cookie.split(';').map(cookie => {
            const [name, value] = cookie.trim().split('=');
            return {
                name: name,
                value: value || '',
                domain: '.xiaohongshu.com',
                path: '/',
                expires: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30天后过期
                httpOnly: false,
                secure: true,
                employeeId: '${employeeId}',
                employeeName: '${employeeName}',
                exportTime: new Date().toISOString()
            };
        }).filter(cookie => cookie.name);

        if (cookies.length === 0) {
            alert('❌ 未找到有效的cookies，请确保已登录小红书');
            return;
        }

        // 生成导出数据包
        const exportData = {
            employeeId: '${employeeId}',
            employeeName: '${employeeName}',
            exportTime: new Date().toISOString(),
            cookieCount: cookies.length,
            checksum: generateChecksum(cookies),
            cookies: cookies
        };

        console.log('✅ 成功导出cookies');
        console.log('员工:', '${employeeName}');
        console.log('Cookie数量:', cookies.length);
        console.log('导出时间:', new Date().toLocaleString('zh-CN'));

        console.log('\\n📋 请复制以下完整JSON数据包发送给IT管理员:');
        console.log('='.repeat(50));
        console.log(JSON.stringify(exportData, null, 2));
        console.log('='.repeat(50));

        // 尝试复制到剪贴板
        if (navigator.clipboard) {
            navigator.clipboard.writeText(JSON.stringify(exportData, null, 2))
                .then(() => console.log('✅ 数据已复制到剪贴板'))
                .catch(() => console.log('⚠️ 请手动复制上面的JSON数据'));
        }

        return exportData;

    } catch (error) {
        console.error('❌ 导出失败:', error.message);
        alert('Cookie导出失败: ' + error.message);
    }
}

// 生成校验和
function generateChecksum(cookies) {
    const data = cookies.map(c => c.name + c.value).join('');
    return btoa(data).substring(0, 16);
}

// 运行导出
exportCookiesForEmployee();
`;

        // 保存脚本文件
        const scriptFile = path.join(packageDir, `${employeeId}-cookie-export.js`);
        fs.writeFileSync(scriptFile, exportScript, 'utf8');

        // 生成使用说明
        const instructions = `
🏢 企业Cookie导出说明

员工: ${employeeName}
员工ID: ${employeeId}
生成时间: ${new Date().toLocaleString('zh-CN')}

操作步骤:
1. 在Chrome浏览器中打开 https://www.xiaohongshu.com
2. 确保已登录你的小红书账号
3. 按F12打开开发者工具
4. 点击 Console 标签页
5. 复制并粘贴 ${employeeId}-cookie-export.js 文件中的脚本
6. 按回车运行脚本
7. 复制输出的JSON数据包
8. 发送给IT管理员

注意事项:
- 请确保在公司网络环境下操作
- 导出的cookies包含敏感信息，请安全传输
- 有问题请联系IT部门

文件位置:
- 导出脚本: ${scriptFile}
- 使用说明: ${packageDir}/instructions.txt
`;

        const instructionsFile = path.join(packageDir, 'instructions.txt');
        fs.writeFileSync(instructionsFile, instructions, 'utf8');

        console.log(`✅ 员工包生成完成:`);
        console.log(`📁 包目录: ${packageDir}`);
        console.log(`📄 导出脚本: ${scriptFile}`);
        console.log(`📖 使用说明: ${instructionsFile}`);
        console.log(`\n💌 请将整个包目录发送给员工 ${employeeName}`);
    }

    /**
     * 导入员工提交的cookie数据包
     */
    async importEmployeeData(dataPackage) {
        console.log(`📥 导入员工cookie数据包...`);

        try {
            // 解析数据包
            let data;
            if (typeof dataPackage === 'string') {
                data = JSON.parse(dataPackage);
            } else {
                data = dataPackage;
            }

            // 验证数据包格式
            if (!data.employeeId || !data.employeeName || !data.cookies) {
                throw new Error('数据包格式不正确');
            }

            const { employeeId, employeeName, exportTime, cookieCount, checksum, cookies } = data;

            console.log(`👤 员工: ${employeeName} (${employeeId})`);
            console.log(`📅 导出时间: ${exportTime}`);
            console.log(`🍪 Cookie数量: ${cookieCount}`);
            console.log(`🔐 校验和: ${checksum}`);

            // 验证cookies
            if (!Array.isArray(cookies) || cookies.length === 0) {
                throw new Error('Cookie数据无效');
            }

            // 验证时间（不能超过24小时）
            const exportDate = new Date(exportTime);
            const now = new Date();
            const hoursDiff = (now - exportDate) / (1000 * 60 * 60);

            if (hoursDiff > 24) {
                console.warn(`⚠️ Cookie数据已超过24小时 (${hoursDiff.toFixed(1)}小时)，可能已过期`);
            }

            // 创建用户目录
            const userDir = path.join(this.mcpRouterCookiesDir, employeeId);
            if (!fs.existsSync(userDir)) {
                fs.mkdirSync(userDir, { recursive: true });
            }

            // 保存cookies
            const cookieFile = path.join(userDir, 'cookies.json');
            fs.writeFileSync(cookieFile, JSON.stringify(cookies, null, 2));

            // 备份到主目录
            const backupFile = path.join(this.mainCookiesDir, `${employeeId}.json`);
            fs.writeFileSync(backupFile, JSON.stringify(cookies, null, 2));

            // 记录导入日志
            const logEntry = {
                timestamp: new Date().toISOString(),
                action: 'import',
                employeeId,
                employeeName,
                cookieCount,
                exportTime,
                importTime: new Date().toISOString(),
                status: 'success'
            };

            const logFile = path.join(this.logsDir, 'cookie-imports.log');
            fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');

            console.log(`✅ 员工 ${employeeName} 的cookies导入成功`);
            console.log(`📁 用户目录: ${userDir}`);
            console.log(`💾 备份文件: ${backupFile}`);
            console.log(`📝 日志记录: ${logFile}`);

            return { success: true, employeeId, employeeName };

        } catch (error) {
            console.error('❌ 导入失败:', error.message);

            // 记录错误日志
            const errorLog = {
                timestamp: new Date().toISOString(),
                action: 'import',
                status: 'failed',
                error: error.message
            };

            const logFile = path.join(this.logsDir, 'cookie-imports.log');
            fs.appendFileSync(logFile, JSON.stringify(errorLog) + '\n');

            throw error;
        }
    }

    /**
     * 批量导入多个员工数据
     */
    async batchImport(dataPackages) {
        console.log(`🔄 开始批量导入 ${dataPackages.length} 个员工的数据...\n`);

        const results = [];

        for (let i = 0; i < dataPackages.length; i++) {
            const dataPackage = dataPackages[i];
            console.log(`处理第 ${i + 1}/${dataPackages.length} 个数据包...`);

            try {
                const result = await this.importEmployeeData(dataPackage);
                results.push(result);
                console.log(`✅ 成功\n`);
            } catch (error) {
                console.log(`❌ 失败: ${error.message}\n`);
                results.push({ success: false, error: error.message });
            }
        }

        // 统计结果
        const successCount = results.filter(r => r.success).length;
        const failCount = results.length - successCount;

        console.log(`📊 批量导入完成:`);
        console.log(`✅ 成功: ${successCount} 个`);
        console.log(`❌ 失败: ${failCount} 个`);

        return results;
    }

    /**
     * 列出所有员工状态
     */
    listEmployees() {
        console.log('👥 企业员工账号状态:\n');

        const users = this.getMCPUsers();

        if (users.length === 0) {
            console.log('❌ 暂无员工账号');
            return [];
        }

        users.forEach((userId, index) => {
            const cookieFile = path.join(this.mcpRouterCookiesDir, userId, 'cookies.json');
            const exists = fs.existsSync(cookieFile);
            const size = exists ? fs.statSync(cookieFile).size : 0;
            const status = exists && size > 10 ? '✅ 已配置' : '❌ 未配置';

            // 尝试读取cookie中的员工信息
            let employeeName = '未知';
            if (exists && size > 10) {
                try {
                    const cookieData = JSON.parse(fs.readFileSync(cookieFile, 'utf8'));
                    if (cookieData[0] && cookieData[0].employeeName) {
                        employeeName = cookieData[0].employeeName;
                    }
                } catch (error) {
                    // 忽略解析错误
                }
            }

            console.log(`  ${index + 1}. ${userId} (${employeeName}) ${status}`);
        });

        return users;
    }

    getMCPUsers() {
        if (!fs.existsSync(this.mcpRouterCookiesDir)) return [];

        return fs.readdirSync(this.mcpRouterCookiesDir)
            .filter(item => {
                const fullPath = path.join(this.mcpRouterCookiesDir, item);
                return fs.statSync(fullPath).isDirectory();
            });
    }

    /**
     * 生成部署报告
     */
    generateDeploymentReport() {
        console.log('📊 企业部署状态报告\n');

        const users = this.getMCPUsers();
        const totalUsers = users.length;
        let configuredUsers = 0;
        let lastActivity = null;

        // 分析日志文件
        const logFile = path.join(this.logsDir, 'cookie-imports.log');
        if (fs.existsSync(logFile)) {
            const logs = fs.readFileSync(logFile, 'utf8')
                .split('\n')
                .filter(line => line.trim())
                .map(line => {
                    try {
                        return JSON.parse(line);
                    } catch {
                        return null;
                    }
                })
                .filter(log => log !== null);

            const successfulImports = logs.filter(log => log.status === 'success');
            configuredUsers = successfulImports.length;

            if (successfulImports.length > 0) {
                lastActivity = successfulImports[successfulImports.length - 1].importTime;
            }
        }

        console.log(`👥 总员工数: ${totalUsers}`);
        console.log(`✅ 已配置: ${configuredUsers}`);
        console.log(`❌ 未配置: ${totalUsers - configuredUsers}`);
        console.log(`📅 最后活动: ${lastActivity ? new Date(lastActivity).toLocaleString('zh-CN') : '无'}`);
        console.log(`🔧 配置率: ${totalUsers > 0 ? Math.round(configuredUsers / totalUsers * 100) : 0}%`);

        return {
            totalUsers,
            configuredUsers,
            unconfiguredUsers: totalUsers - configuredUsers,
            lastActivity,
            configurationRate: totalUsers > 0 ? Math.round(configuredUsers / totalUsers * 100) : 0
        };
    }
}

// 命令行接口
async function main() {
    const manager = new EnterpriseCookieManager();
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log(`
🏢 企业级Cookie管理系统

命令格式: node enterprise-cookie-manager.js <command> [arguments]

可用命令:
  generate <employeeId> <employeeName>  - 为员工生成导出包
  import                                - 交互式导入员工数据
  list                                  - 列出所有员工状态
  report                               - 生成部署报告

使用示例:
  node enterprise-cookie-manager.js generate emp001 张三
  node enterprise-cookie-manager.js import
  node enterprise-cookie-manager.js list
  node enterprise-cookie-manager.js report
        `);
        return;
    }

    const command = args[0];

    try {
        switch (command) {
            case 'generate':
                if (args.length < 3) {
                    console.log('❌ 用法: generate <employeeId> <employeeName>');
                    return;
                }
                manager.generateEmployeePackage(args[1], args[2]);
                break;

            case 'import':
                console.log('请粘贴员工提交的完整JSON数据包，然后按两次回车：');
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

                await manager.importEmployeeData(input.trim());
                break;

            case 'list':
                manager.listEmployees();
                break;

            case 'report':
                manager.generateDeploymentReport();
                break;

            default:
                console.log('❌ 未知命令:', command);
                break;
        }
    } catch (error) {
        console.error('❌ 操作失败:', error.message);
    }
}

main().catch(console.error);