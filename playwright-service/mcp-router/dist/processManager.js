import { spawn } from 'child_process';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';
export class XiaohongshuMCPProcessManager {
    constructor(mcpBinaryPath, cookieDir) {
        this.processes = new Map();
        this.basePort = 18060;
        this.maxProcesses = 20; // 最多 20 个并发进程
        this.cleanupTimeout = 10 * 60 * 1000; // 10 分钟不活动自动清理
        // 转换为绝对路径
        this.mcpBinary = path.isAbsolute(mcpBinaryPath)
            ? mcpBinaryPath
            : path.resolve(process.cwd(), mcpBinaryPath);
        this.cookieDir = path.isAbsolute(cookieDir)
            ? cookieDir
            : path.resolve(process.cwd(), cookieDir);
        // 确保 Cookie 目录存在
        if (!fs.existsSync(this.cookieDir)) {
            fs.mkdirSync(this.cookieDir, { recursive: true });
        }
    }
    /**
     * 检查端口是否真正可用（操作系统级别）
     */
    async isPortAvailable(port) {
        return new Promise((resolve) => {
            const server = net.createServer();
            server.once('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    resolve(false); // 端口被占用
                }
                else {
                    resolve(false); // 其他错误也视为不可用
                }
            });
            server.once('listening', () => {
                server.close(() => {
                    resolve(true); // 端口可用
                });
            });
            server.listen(port, '127.0.0.1');
        });
    }
    /**
     * 分配端口 - 改进版：检查操作系统级别的端口占用
     */
    async allocatePort() {
        const usedPorts = new Set(Array.from(this.processes.values()).map(p => p.port));
        for (let port = this.basePort; port < this.basePort + 1000; port++) {
            // 跳过内存中已使用的端口
            if (usedPorts.has(port)) {
                continue;
            }
            // 🔥 关键修复：检查操作系统级别的端口占用
            const available = await this.isPortAvailable(port);
            if (available) {
                console.log(`[ProcessManager] Allocated port ${port} (verified available at OS level)`);
                return port;
            }
            else {
                console.log(`[ProcessManager] Port ${port} is occupied at OS level, trying next...`);
            }
        }
        throw new Error('No available ports');
    }
    /**
     * 启动用户专属的 MCP 进程
     */
    async startProcess(userId) {
        // 🔥 FIX: 在创建新进程前，清除旧进程的定时器，防止定时器泄漏
        const oldManaged = this.processes.get(userId);
        if (oldManaged?.cleanupTimer) {
            console.log(`[ProcessManager] Clearing old cleanup timer for user ${userId} before creating new process`);
            clearTimeout(oldManaged.cleanupTimer);
            oldManaged.cleanupTimer = undefined;
        }
        const port = await this.allocatePort();
        // 检查二进制文件是否存在
        if (!fs.existsSync(this.mcpBinary)) {
            throw new Error(`xiaohongshu-mcp binary not found at: ${this.mcpBinary}. Please ensure the Linux binary is installed.`);
        }
        // 检查二进制文件是否可执行
        try {
            fs.accessSync(this.mcpBinary, fs.constants.X_OK);
        }
        catch (error) {
            throw new Error(`xiaohongshu-mcp binary at ${this.mcpBinary} is not executable. Run: chmod +x ${this.mcpBinary}`);
        }
        // 为每个用户创建独立的工作目录
        // xiaohongshu-mcp 会在工作目录下创建 cookies.json
        const workDir = path.join(this.cookieDir, userId);
        if (!fs.existsSync(workDir)) {
            fs.mkdirSync(workDir, { recursive: true });
        }
        // 确保cookies.json文件存在，防止MCP进程panic
        const cookiesFile = path.join(workDir, 'cookies.json');
        if (!fs.existsSync(cookiesFile)) {
            fs.writeFileSync(cookiesFile, '[]', 'utf8');
            console.log(`[ProcessManager] Created empty cookies.json for user ${userId}`);
        }
        // 🔥 CRITICAL FIX: MCP binary expects cookies at /app/data/cookies.json
        // Create symlink from /app/data/cookies.json to actual cookie file
        const mcpExpectedPath = '/app/data/cookies.json';
        const mcpDataDir = '/app/data';
        try {
            // Ensure /app/data directory exists
            if (!fs.existsSync(mcpDataDir)) {
                fs.mkdirSync(mcpDataDir, { recursive: true });
                console.log(`[ProcessManager] Created /app/data directory`);
            }
            // Remove existing symlink/file if present
            if (fs.existsSync(mcpExpectedPath)) {
                fs.unlinkSync(mcpExpectedPath);
            }
            // Create symlink from /app/data/cookies.json to user's actual cookie file
            fs.symlinkSync(cookiesFile, mcpExpectedPath);
            console.log(`[ProcessManager] Created symlink: ${mcpExpectedPath} -> ${cookiesFile}`);
        }
        catch (symlinkError) {
            console.error(`[ProcessManager] Failed to create symlink: ${symlinkError instanceof Error ? symlinkError.message : String(symlinkError)}`);
            // Continue anyway - let MCP binary report the error
        }
        console.log(`[ProcessManager] Starting MCP process for user ${userId} on port ${port}`);
        console.log(`[ProcessManager] Working directory: ${workDir}`);
        console.log(`[ProcessManager] Cookie file: ${cookiesFile}`);
        const childProcess = spawn(this.mcpBinary, ['-port', `:${port}`], {
            cwd: workDir, // 设置工作目录，确保Cookie文件隔离
            env: {
                ...process.env,
                USER_ID: userId,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        // 捕获日志
        childProcess.stdout?.on('data', (data) => {
            console.log(`[MCP ${userId}] ${data.toString()}`);
        });
        childProcess.stderr?.on('data', (data) => {
            console.error(`[MCP ${userId}] ERROR: ${data.toString()}`);
        });
        childProcess.on('exit', (code) => {
            console.log(`[ProcessManager] Process for user ${userId} exited with code ${code}`);
            this.processes.delete(userId);
        });
        const managed = {
            process: childProcess,
            port,
            userId,
            lastUsed: Date.now(),
        };
        this.processes.set(userId, managed);
        // 等待服务启动（最多 10 秒）
        await this.waitForReady(port, 10000);
        // 设置自动清理
        this.scheduleCleanup(userId);
        return managed;
    }
    /**
     * 等待服务就绪
     */
    async waitForReady(port, timeout) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            try {
                await axios.get(`http://localhost:${port}/health`);
                console.log(`[ProcessManager] Service ready on port ${port}`);
                return;
            }
            catch (error) {
                // 服务未就绪，继续等待
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        throw new Error(`Service on port ${port} failed to start within ${timeout}ms`);
    }
    /**
     * 调度自动清理
     */
    scheduleCleanup(userId) {
        const managed = this.processes.get(userId);
        if (!managed)
            return;
        // 清除旧的定时器
        if (managed.cleanupTimer) {
            clearTimeout(managed.cleanupTimer);
        }
        // 设置新的定时器
        managed.cleanupTimer = setTimeout(() => {
            const now = Date.now();
            if (now - managed.lastUsed > this.cleanupTimeout) {
                console.log(`[ProcessManager] Cleaning up inactive process for user ${userId}`);
                this.killProcess(userId);
            }
        }, this.cleanupTimeout);
    }
    /**
     * 杀死进程
     */
    killProcess(userId) {
        const managed = this.processes.get(userId);
        if (!managed)
            return;
        if (managed.cleanupTimer) {
            clearTimeout(managed.cleanupTimer);
        }
        managed.process.kill();
        this.processes.delete(userId);
    }
    /**
     * 获取或创建用户的 MCP 进程
     */
    async getOrCreateProcess(userId) {
        let managed = this.processes.get(userId);
        // 如果进程已存在
        if (managed) {
            managed.lastUsed = Date.now();
            this.scheduleCleanup(userId); // 重置清理计时器
            return managed.port;
        }
        // 检查进程数量限制
        if (this.processes.size >= this.maxProcesses) {
            // 清理最久未使用的进程
            const oldest = Array.from(this.processes.values())
                .sort((a, b) => a.lastUsed - b.lastUsed)[0];
            console.log(`[ProcessManager] Max processes reached, killing oldest: ${oldest.userId}`);
            this.killProcess(oldest.userId);
        }
        // 创建新进程
        managed = await this.startProcess(userId);
        return managed.port;
    }
    /**
     * 调用 MCP 工具
     */
    async callTool(userId, endpoint, method = 'POST', data) {
        const port = await this.getOrCreateProcess(userId);
        const url = `http://localhost:${port}${endpoint}`;
        // 🔥 根据操作类型设置不同的超时时间
        // 发布操作涉及浏览器自动化、图片上传等，需要更长时间
        // 🔥 修复：与 mcpAuthClient 保持一致，都是 10 分钟
        const isPublishOperation = endpoint.includes('/publish');
        const timeout = isPublishOperation ? 600000 : 120000; // 发布: 10分钟, 其他: 2分钟
        console.log(`[ProcessManager] Calling ${method} ${url} for user ${userId}`);
        console.log(`[ProcessManager] Timeout: ${timeout}ms (${timeout / 1000}s)`);
        // 🔥 DEBUG: 打印完整请求数据
        console.log(`[ProcessManager] Request data:`, JSON.stringify(data, null, 2));
        const startTime = Date.now();
        try {
            const response = await axios({
                method,
                url,
                data,
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout,
            });
            const duration = Date.now() - startTime;
            console.log(`[ProcessManager] ✅ Request completed in ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
            return response.data;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            // 🔥 捕获完整的错误信息，包括response.data
            const errorDetails = {
                message: error.message,
                duration: `${duration}ms (${(duration / 1000).toFixed(2)}s)`,
                timeout: `${timeout}ms`,
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                config: {
                    method: error.config?.method,
                    url: error.config?.url,
                }
            };
            console.error(`[ProcessManager] ❌ Tool call failed for user ${userId} after ${duration}ms:`, errorDetails);
            // 抛出包含完整错误信息的新错误
            const enhancedError = new Error(`MCP Process Error: ${error.message}`);
            enhancedError.originalError = error;
            enhancedError.response = error.response;
            enhancedError.status = error.response?.status;
            enhancedError.data = error.response?.data;
            enhancedError.duration = duration;
            throw enhancedError;
        }
    }
    /**
     * 刷新用户Cookie - 重启对应的MCP进程使用新Cookie
     */
    async refreshUserCookies(userId, cookies) {
        console.log(`[ProcessManager] Refreshing cookies for user ${userId}`);
        try {
            // 如果提供了cookies，先写入文件
            if (cookies && cookies.length > 0) {
                const userCookieDir = path.join(this.cookieDir, userId);
                const cookieFile = path.join(userCookieDir, 'cookies.json');
                // 确保用户目录存在
                if (!fs.existsSync(userCookieDir)) {
                    fs.mkdirSync(userCookieDir, { recursive: true });
                }
                // 写入新的cookies
                fs.writeFileSync(cookieFile, JSON.stringify(cookies, null, 2));
                console.log(`[ProcessManager] Updated cookie file: ${cookieFile}`);
            }
            // 检查是否有运行中的进程
            const managedProcess = this.processes.get(userId);
            if (managedProcess) {
                console.log(`[ProcessManager] Killing existing process for user ${userId} on port ${managedProcess.port}`);
                // 清理定时器
                if (managedProcess.cleanupTimer) {
                    clearTimeout(managedProcess.cleanupTimer);
                }
                // 终止进程
                if (managedProcess.process && !managedProcess.process.killed) {
                    managedProcess.process.kill('SIGTERM');
                    // 等待进程优雅退出
                    await new Promise(resolve => {
                        const timeout = setTimeout(() => {
                            if (!managedProcess.process.killed) {
                                managedProcess.process.kill('SIGKILL');
                            }
                            resolve(void 0);
                        }, 3000);
                        managedProcess.process.once('exit', () => {
                            clearTimeout(timeout);
                            resolve(void 0);
                        });
                    });
                }
                // 从管理器中移除
                this.processes.delete(userId);
                console.log(`[ProcessManager] Removed process for user ${userId}`);
            }
            // 重新启动进程（延迟启动，让资源释放）
            setTimeout(async () => {
                try {
                    console.log(`[ProcessManager] Restarting process for user ${userId} with updated cookies`);
                    await this.getOrCreateProcess(userId);
                    console.log(`[ProcessManager] Successfully restarted process for user ${userId}`);
                }
                catch (restartError) {
                    console.error(`[ProcessManager] Failed to restart process for user ${userId}:`, restartError);
                }
            }, 1000);
        }
        catch (error) {
            console.error(`[ProcessManager] Error refreshing cookies for user ${userId}:`, error);
            throw error;
        }
    }
    /**
     * 获取统计信息
     */
    getStats() {
        return {
            activeProcesses: this.processes.size,
            maxProcesses: this.maxProcesses,
            processes: Array.from(this.processes.entries()).map(([userId, p]) => ({
                userId,
                port: p.port,
                lastUsed: new Date(p.lastUsed).toISOString(),
                inactive: Date.now() - p.lastUsed,
            })),
        };
    }
    /**
     * 清理特定用户的进程
     */
    async cleanupUser(userId) {
        console.log(`[ProcessManager] Cleaning up process for user ${userId}`);
        const managedProcess = this.processes.get(userId);
        if (managedProcess) {
            // 清理定时器
            if (managedProcess.cleanupTimer) {
                clearTimeout(managedProcess.cleanupTimer);
            }
            // 终止进程
            if (managedProcess.process && !managedProcess.process.killed) {
                managedProcess.process.kill('SIGTERM');
                // 等待进程优雅退出
                await new Promise(resolve => {
                    const timeout = setTimeout(() => {
                        if (!managedProcess.process.killed) {
                            console.log(`[ProcessManager] Force killing process for user ${userId}`);
                            managedProcess.process.kill('SIGKILL');
                        }
                        resolve();
                    }, 3000);
                    managedProcess.process.once('exit', () => {
                        clearTimeout(timeout);
                        resolve();
                    });
                });
            }
            // 从进程映射中删除
            this.processes.delete(userId);
            console.log(`[ProcessManager] Successfully cleaned up process for user ${userId}`);
        }
        else {
            console.log(`[ProcessManager] No active process found for user ${userId}`);
        }
    }
    /**
     * 清理所有进程
     */
    cleanup() {
        console.log('[ProcessManager] Cleaning up all processes');
        for (const userId of this.processes.keys()) {
            this.killProcess(userId);
        }
    }
}
//# sourceMappingURL=processManager.js.map