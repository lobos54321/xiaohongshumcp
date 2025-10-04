import { spawn, ChildProcess } from 'child_process';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';

interface ManagedProcess {
  process: ChildProcess;
  port: number;
  userId: string;
  lastUsed: number;
  cleanupTimer?: NodeJS.Timeout;
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
  }

  /**
   * 分配端口
   */
  private allocatePort(): number {
    const usedPorts = new Set(
      Array.from(this.processes.values()).map(p => p.port)
    );

    for (let port = this.basePort; port < this.basePort + 1000; port++) {
      if (!usedPorts.has(port)) {
        return port;
      }
    }

    throw new Error('No available ports');
  }

  /**
   * 启动用户专属的 MCP 进程
   */
  private async startProcess(userId: string): Promise<ManagedProcess> {
    const port = this.allocatePort();

    // 为每个用户创建独立的工作目录
    // xiaohongshu-mcp 会在工作目录下创建 cookies.json
    const workDir = path.join(this.cookieDir, userId);
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }

    console.log(`[ProcessManager] Starting MCP process for user ${userId} on port ${port}`);
    console.log(`[ProcessManager] Working directory: ${workDir}`);

    const childProcess = spawn(this.mcpBinary, ['-port', `:${port}`], {
      cwd: workDir,  // 设置工作目录，确保Cookie文件隔离
      env: {
        ...process.env,
        USER_ID: userId,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // 捕获日志
    childProcess.stdout?.on('data', (data: Buffer) => {
      console.log(`[MCP ${userId}] ${data.toString()}`);
    });

    childProcess.stderr?.on('data', (data: Buffer) => {
      console.error(`[MCP ${userId}] ERROR: ${data.toString()}`);
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
  private killProcess(userId: string): void {
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
   * 调用 MCP 工具
   */
  async callTool(userId: string, endpoint: string, method: string = 'POST', data?: any): Promise<any> {
    const port = await this.getOrCreateProcess(userId);

    const url = `http://localhost:${port}${endpoint}`;

    console.log(`[ProcessManager] Calling ${method} ${url} for user ${userId}`);

    try {
      const response = await axios({
        method,
        url,
        data,
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 120000, // 2 分钟超时
      });

      return response.data;
    } catch (error: any) {
      console.error(`[ProcessManager] Tool call failed for user ${userId}:`, error.message);
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
   * 清理所有进程
   */
  cleanup() {
    console.log('[ProcessManager] Cleaning up all processes');
    for (const userId of this.processes.keys()) {
      this.killProcess(userId);
    }
  }
}
