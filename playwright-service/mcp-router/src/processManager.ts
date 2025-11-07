import { spawn, ChildProcess } from 'child_process';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';
import * as net from 'net';

interface ManagedProcess {
  process: ChildProcess;
  port: number;
  userId: string;
  lastUsed: number;
  cleanupTimer?: NodeJS.Timeout;
  logs: string[]; // 保存最近的日志
  maxLogs: number; // 最多保存的日志条数
}

export class XiaohongshuMCPProcessManager {
  private processes = new Map<string, ManagedProcess>();
  private basePort = 18060;
  private maxProcesses = 20; // 最多 20 个并发进程
  private cleanupTimeout = 10 * 60 * 1000; // 10 分钟不活动自动清理
  private mcpBinary: string;
  private cookieDir: string;

  constructor(mcpBinaryPath: string, cookieDir: string) {
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

    // 🧹 启动时清理全局符号链接（防止旧数据污染）
    this.cleanupGlobalSymlink();
  }

  /**
   * 启动时清理全局符号链接
   * 防止旧数据（如测试用户）的符号链接污染新启动的服务
   */
  private cleanupGlobalSymlink(): void {
    const mcpExpectedPath = '/app/data/cookies.json';

    try {
      const stats = fs.lstatSync(mcpExpectedPath);
      if (stats.isSymbolicLink()) {
        const target = fs.readlinkSync(mcpExpectedPath);
        console.log(`[ProcessManager] 🧹 Cleaning up old symlink at startup: ${mcpExpectedPath} -> ${target}`);
        fs.unlinkSync(mcpExpectedPath);
        console.log(`[ProcessManager] ✅ Cleaned up old symlink successfully`);
      } else if (stats.isFile()) {
        console.log(`[ProcessManager] 🧹 Found regular file at ${mcpExpectedPath}, removing...`);
        fs.unlinkSync(mcpExpectedPath);
        console.log(`[ProcessManager] ✅ Removed old file successfully`);
      }
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        // 文件不存在，无需清理（这是正常情况）
        console.log(`[ProcessManager] No existing symlink at ${mcpExpectedPath}, clean start`);
      } else {
        // 其他错误，记录但不抛出（不阻止服务启动）
        console.warn(`[ProcessManager] ⚠️ Could not clean up old symlink:`, err.message);
      }
    }
  }

  /**
   * 检查端口是否真正可用（操作系统级别）
   */
  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();

      server.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          resolve(false); // 端口被占用
        } else {
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
  private async allocatePort(): Promise<number> {
    const usedPorts = new Set(
      Array.from(this.processes.values()).map(p => p.port)
    );

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
      } else {
        console.log(`[ProcessManager] Port ${port} is occupied at OS level, trying next...`);
      }
    }

    throw new Error('No available ports');
  }

  /**
   * 启动用户专属的 MCP 进程
   */
  private async startProcess(userId: string): Promise<ManagedProcess> {
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
    } catch (error) {
      throw new Error(`xiaohongshu-mcp binary at ${this.mcpBinary} is not executable. Run: chmod +x ${this.mcpBinary}`);
    }

    // 为每个用户创建独立的工作目录
    // xiaohongshu-mcp 会在工作目录下创建 cookies.json
    const workDir = path.join(this.cookieDir, userId);
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }

    // 🔥 优先从数据库加载Cookie（持久化存储）
    const cookiesFile = path.join(workDir, 'cookies.json');
    if (!fs.existsSync(cookiesFile)) {
      // Cookie文件不存在，尝试从数据库加载
      try {
        console.log(`[MCP-Router] Cookie文件不存在，尝试从数据库加载...`);
        const axios = await import('axios');

        // 🔥 FIX: 根据运行环境自动选择后端服务URL
        // 生产环境：使用公网域名
        // 开发环境：使用 localhost
        const backendUrl = process.env.CLAUDE_AGENT_URL
          || process.env.BACKEND_URL
          || 'https://xiaohongshu-automation-ai.zeabur.app';

        console.log(`[MCP-Router] 使用后端服务: ${backendUrl}`);

        const response = await axios.default.post(
          `${backendUrl}/agent/xiaohongshu/load-cookies-from-db`,
          { userId },
          { timeout: 10000, headers: { 'Content-Type': 'application/json' } }
        );
        
        if (response.data?.success && response.data?.cookies?.length > 0) {
          fs.writeFileSync(cookiesFile, JSON.stringify(response.data.cookies, null, 2), 'utf8');
          console.log(`[ProcessManager] ✅ 从数据库加载了 ${response.data.cookies.length} 个Cookie`);
        } else {
          // 数据库也没有，创建空文件
          fs.writeFileSync(cookiesFile, '[]', 'utf8');
          console.log(`[ProcessManager] 数据库中没有Cookie，创建空文件`);
        }
      } catch (dbError) {
        console.warn(`[ProcessManager] 从数据库加载Cookie失败，创建空文件:`, dbError instanceof Error ? dbError.message : String(dbError));
        fs.writeFileSync(cookiesFile, '[]', 'utf8');
      }
    } else {
      console.log(`[ProcessManager] Cookie文件已存在: ${cookiesFile}`);
    }

    console.log(`[ProcessManager] Starting MCP process for user ${userId} on port ${port}`);
    console.log(`[ProcessManager] Working directory: ${workDir}`);
    console.log(`[ProcessManager] Cookie file: ${cookiesFile}`);

    // Ensure Go binary reads global symlink path rather than legacy /tmp
    process.env.COOKIES_PATH = '/app/data/cookies.json';

    const childProcess = spawn(this.mcpBinary, ['-port', `:${port}`], {
      cwd: workDir,  // 设置工作目录，确保Cookie文件隔离
      env: {
        ...process.env,
        USER_ID: userId,
        COOKIES_PATH: '/app/data/cookies.json',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // 创建临时引用，稍后更新为实际的 managed 对象
    let managedRef: ManagedProcess | null = null;

    // 保存日志的辅助函数
    const saveLog = (message: string) => {
      if (managedRef) {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${message}`;
        managedRef.logs.push(logEntry);

        // 限制日志数量
        if (managedRef.logs.length > managedRef.maxLogs) {
          managedRef.logs = managedRef.logs.slice(-managedRef.maxLogs);
        }
      }
    };

    // 捕获日志
    childProcess.stdout?.on('data', (data: Buffer) => {
      const message = `[MCP ${userId}] ${data.toString()}`;
      console.log(message);
      saveLog(message);
    });

    childProcess.stderr?.on('data', (data: Buffer) => {
      const message = `[MCP ${userId}] ERROR: ${data.toString()}`;
      console.error(message);
      saveLog(message);
    });

    childProcess.on('exit', (code: number | null) => {
      console.log(`[ProcessManager] Process for user ${userId} exited with code ${code}`);
      this.processes.delete(userId);
    });

    const managed: ManagedProcess = {
      process: childProcess,
      port,
      userId,
      lastUsed: Date.now(),
      logs: [], // 初始化日志数组
      maxLogs: 500, // 最多保存 500 条日志
    };

    // 设置引用，让日志处理器能访问
    managedRef = managed;

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
  private async waitForReady(port: number, timeout: number): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        await axios.get(`http://localhost:${port}/health`);
        console.log(`[ProcessManager] Service ready on port ${port}`);
        return;
      } catch (error) {
        // 服务未就绪，继续等待
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    throw new Error(`Service on port ${port} failed to start within ${timeout}ms`);
  }

  /**
   * 调度自动清理
   */
  private scheduleCleanup(userId: string): void {
    const managed = this.processes.get(userId);
    if (!managed) return;

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
  killProcess(userId: string): void {
    const managed = this.processes.get(userId);
    if (!managed) return;

    if (managed.cleanupTimer) {
      clearTimeout(managed.cleanupTimer);
    }

    managed.process.kill();
    this.processes.delete(userId);
  }

  /**
   * 获取或创建用户的 MCP 进程
   */
  async getOrCreateProcess(userId: string): Promise<number> {
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
   * 创建 MCP binary 所需的 cookies 符号链接
   * 🔥 每次调用前都需要创建，因为多个用户共享同一个符号链接路径
   *
   * 修复说明：
   * - 使用 lstatSync 而不是 existsSync，因为 existsSync 无法检测失效的符号链接
   * - 失效符号链接：指向不存在的目标文件，但符号链接本身存在
   * - 详细日志帮助调试和追踪问题
   */
  private ensureCookieSymlink(userId: string): void {
    const userCookieFile = path.join(this.cookieDir, userId, 'cookies.json');
    const mcpExpectedPath = '/app/data/cookies.json';
    const mcpDataDir = '/app/data';

    try {
      // 1. 确保 /app/data 目录存在
      if (!fs.existsSync(mcpDataDir)) {
        fs.mkdirSync(mcpDataDir, { recursive: true });
        console.log(`[ProcessManager] Created /app/data directory`);
      }

      // 2. 检查并清理现有文件/符号链接
      // 🔥 FIX: 使用 lstatSync 而不是 existsSync
      // existsSync 会跟随符号链接检查目标文件，对失效符号链接返回 false
      // lstatSync 检查符号链接本身，不跟随链接
      try {
        const stats = fs.lstatSync(mcpExpectedPath);

        if (stats.isSymbolicLink()) {
          // 读取符号链接指向的目标
          const target = fs.readlinkSync(mcpExpectedPath);
          console.log(`[ProcessManager] Found existing symlink: ${mcpExpectedPath} -> ${target}`);
          fs.unlinkSync(mcpExpectedPath);
          console.log(`[ProcessManager] ✅ Removed old symlink`);
        } else if (stats.isFile()) {
          console.log(`[ProcessManager] Found regular file at ${mcpExpectedPath}, removing...`);
          fs.unlinkSync(mcpExpectedPath);
          console.log(`[ProcessManager] ✅ Removed old file`);
        } else if (stats.isDirectory()) {
          console.error(`[ProcessManager] ❌ ${mcpExpectedPath} is a directory! This should not happen.`);
          throw new Error(`${mcpExpectedPath} is a directory, cannot create symlink`);
        }
      } catch (statError: any) {
        if (statError.code !== 'ENOENT') {
          // 非"文件不存在"的错误，抛出
          throw statError;
        }
        // ENOENT: 文件不存在，可以继续创建（这是正常情况）
        console.log(`[ProcessManager] No existing file at ${mcpExpectedPath}, will create new symlink`);
      }

      // 3. 创建新的符号链接
      fs.symlinkSync(userCookieFile, mcpExpectedPath);
      console.log(`[ProcessManager] ✅ Created cookie symlink for user ${userId}`);
      console.log(`[ProcessManager]    ${mcpExpectedPath} -> ${userCookieFile}`);

    } catch (symlinkError: any) {
      console.error(`[ProcessManager] ❌ Failed to create cookie symlink for user ${userId}:`, symlinkError.message);
      throw symlinkError;
    }
  }

  /**
   * 调用 MCP 工具
   */
  async callTool(userId: string, endpoint: string, method: string = 'POST', data?: any): Promise<any> {
    const port = await this.getOrCreateProcess(userId);

    // 🔥 CRITICAL FIX: 每次调用前创建符号链接，确保指向正确用户的 cookies
    // MCP binary 期望从 /app/data/cookies.json 读取 cookies
    // 由于多个用户共享此路径，必须在每次调用前动态创建
    this.ensureCookieSymlink(userId);

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
      // 🔥 FIX: GET 请求使用 params (query string)，POST 请求使用 data (request body)
      const axiosConfig: any = {
        method,
        url,
        headers: {
          'Content-Type': 'application/json',
        },
        timeout,
      };

      if (method.toUpperCase() === 'GET') {
        axiosConfig.params = data; // GET: 参数作为 query string
      } else {
        axiosConfig.data = data; // POST/PUT/etc: 参数作为 request body
      }

      const response = await axios(axiosConfig);

      const duration = Date.now() - startTime;
      console.log(`[ProcessManager] ✅ Request completed in ${duration}ms (${(duration / 1000).toFixed(2)}s)`);

      return response.data;
    } catch (error: any) {
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
      (enhancedError as any).originalError = error;
      (enhancedError as any).response = error.response;
      (enhancedError as any).status = error.response?.status;
      (enhancedError as any).data = error.response?.data;
      (enhancedError as any).duration = duration;

      throw enhancedError;
    }
  }

  /**
   * 刷新用户Cookie - 重启对应的MCP进程使用新Cookie
   */
  async refreshUserCookies(userId: string, cookies?: any[]): Promise<void> {
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
        } catch (restartError) {
          console.error(`[ProcessManager] Failed to restart process for user ${userId}:`, restartError);
        }
      }, 1000);

    } catch (error) {
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
  async cleanupUser(userId: string): Promise<void> {
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
        await new Promise<void>(resolve => {
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
    } else {
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

  /**
   * 获取指定用户的日志
   */
  getLogs(userId: string, limit?: number): string[] {
    const managedProcess = this.processes.get(userId);
    if (!managedProcess) {
      return [];
    }

    const logs = managedProcess.logs;
    if (limit && limit > 0) {
      return logs.slice(-limit);
    }
    return logs;
  }

  /**
   * 获取所有用户的日志（用于全局日志查看）
   */
  getAllLogs(limit?: number): { userId: string; logs: string[] }[] {
    const result: { userId: string; logs: string[] }[] = [];

    for (const [userId, managedProcess] of this.processes.entries()) {
      const logs = limit && limit > 0
        ? managedProcess.logs.slice(-limit)
        : managedProcess.logs;

      result.push({ userId, logs });
    }

    return result;
  }
}
