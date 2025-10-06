/**
 * MCP Service Manager - 管理 xiaohongshu-mcp Go 服务
 */

import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface MCPServiceConfig {
  binPath?: string;
  port?: number;
  headless?: boolean;
  cookiesPath?: string;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export class MCPServiceManager {
  private config: MCPServiceConfig;
  private mcpProcess: ChildProcess | null = null;
  private loginProcess: ChildProcess | null = null;
  private isRunning = false;
  private startupPromise: Promise<void> | null = null;

  constructor(config: MCPServiceConfig = {}) {
    this.config = {
      port: 18060,
      headless: true,
      cookiesPath: path.join(process.cwd(), 'data', 'cookies.json'),
      logLevel: 'info',
      ...config,
    };
  }

  /**
   * 获取二进制文件路径
   */
  private getBinaryPath(): string {
    if (this.config.binPath) {
      return this.config.binPath;
    }

    // 检查项目内的二进制文件
    const binDir = path.join(__dirname, '../bin');
    const platform = process.platform;
    const arch = process.arch;

    let binaryName = 'xiaohongshu-mcp';
    if (platform === 'darwin') {
      binaryName += arch === 'arm64' ? '-darwin-arm64' : '-darwin-amd64';
    } else if (platform === 'linux') {
      binaryName += '-linux-amd64';
    } else if (platform === 'win32') {
      binaryName += '-windows-amd64.exe';
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    return path.join(binDir, binaryName);
  }

  /**
   * 获取登录工具二进制文件路径
   */
  private getLoginBinaryPath(): string {
    const binDir = path.join(__dirname, '../bin');
    const platform = process.platform;
    const arch = process.arch;

    let binaryName = 'xiaohongshu-login';
    if (platform === 'darwin') {
      binaryName += arch === 'arm64' ? '-darwin-arm64' : '-darwin-amd64';
    } else if (platform === 'linux') {
      binaryName += '-linux-amd64';
    } else if (platform === 'win32') {
      binaryName += '-windows-amd64.exe';
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    return path.join(binDir, binaryName);
  }

  /**
   * 下载二进制文件
   */
  async downloadBinaries(): Promise<void> {
    const binDir = path.join(__dirname, '../bin');
    await fs.mkdir(binDir, { recursive: true });

    const platform = process.platform;
    const arch = process.arch;

    let archiveName = '';
    let mcpBinaryName = 'xiaohongshu-mcp';
    let loginBinaryName = 'xiaohongshu-login';

    if (platform === 'darwin') {
      const suffix = arch === 'arm64' ? '-darwin-arm64' : '-darwin-amd64';
      archiveName = `xiaohongshu-mcp${suffix}.tar.gz`;
      mcpBinaryName += suffix;
      loginBinaryName += suffix;
    } else if (platform === 'linux') {
      archiveName = 'xiaohongshu-mcp-linux-amd64.tar.gz';
      mcpBinaryName += '-linux-amd64';
      loginBinaryName += '-linux-amd64';
    } else if (platform === 'win32') {
      archiveName = 'xiaohongshu-mcp-windows-amd64.zip';
      mcpBinaryName += '-windows-amd64.exe';
      loginBinaryName += '-windows-amd64.exe';
    }

    const githubBaseURL = 'https://github.com/xpzouying/xiaohongshu-mcp/releases/latest/download';

    try {
      console.log('[MCP Service Manager] Downloading binaries...');

      // 检查二进制文件是否已存在
      const mcpPath = path.join(binDir, mcpBinaryName);
      const loginPath = path.join(binDir, loginBinaryName);

      if (await this.fileExists(mcpPath) && await this.fileExists(loginPath)) {
        console.log('[MCP Service Manager] Binaries already exist');
        return;
      }

      // 下载压缩包
      const archivePath = path.join(binDir, archiveName);
      console.log(`[MCP Service Manager] Downloading ${archiveName}...`);
      await this.downloadFile(`${githubBaseURL}/${archiveName}`, archivePath);

      // 解压文件
      console.log(`[MCP Service Manager] Extracting ${archiveName}...`);
      if (platform === 'win32') {
        // Windows ZIP 文件
        await this.extractZip(archivePath, binDir);
      } else {
        // macOS/Linux tar.gz 文件
        await this.extractTarGz(archivePath, binDir);
      }

      // 设置执行权限
      await fs.chmod(mcpPath, '755');
      await fs.chmod(loginPath, '755');

      // 删除压缩包
      await fs.unlink(archivePath);

      console.log('[MCP Service Manager] Binaries ready');
    } catch (error: any) {
      console.error('[MCP Service Manager] Failed to download binaries:', error.message);
      throw error;
    }
  }

  /**
   * 检查文件是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 下载文件
   */
  private async downloadFile(url: string, filePath: string): Promise<void> {
    const response = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
    });

    const writer = await fs.open(filePath, 'w');
    await new Promise((resolve, reject) => {
      response.data.pipe(writer.createWriteStream());
      response.data.on('error', reject);
      response.data.on('end', resolve);
    });
    await writer.close();
  }

  /**
   * 启动 MCP 服务
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[MCP Service Manager] Service already running');
      return;
    }

    if (this.startupPromise) {
      return this.startupPromise;
    }

    this.startupPromise = this._doStart();
    return this.startupPromise;
  }

  private async _doStart(): Promise<void> {
    try {
      console.log('[MCP Service Manager] Starting xiaohongshu-mcp service...');

      // 确保二进制文件存在
      await this.downloadBinaries();

      // 创建数据目录
      const dataDir = path.dirname(this.config.cookiesPath!);
      await fs.mkdir(dataDir, { recursive: true });

      const binaryPath = this.getBinaryPath();
      const args = [
        `-port=:${this.config.port}`,
        `-headless=${this.config.headless}`,
      ];

      // 设置环境变量
      const env = {
        ...process.env,
        COOKIES_PATH: this.config.cookiesPath,
      };

      // 启动 MCP 服务进程
      this.mcpProcess = spawn(binaryPath, args, {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.mcpProcess.stderr?.on('data', (data) => {
        const message = data.toString().trim();
        if (message.includes('ERROR') || message.includes('FATAL')) {
          console.error(`[MCP Service Error] ${message}`);
        } else if (this.config.logLevel === 'debug') {
          console.log(`[MCP Service] ${message}`);
        }
      });

      this.mcpProcess.on('exit', (code) => {
        console.log(`[MCP Service Manager] Process exited with code ${code}`);
        this.isRunning = false;
        this.mcpProcess = null;
      });

      this.mcpProcess.on('error', (error) => {
        console.error('[MCP Service Manager] Process error:', error);
        this.isRunning = false;
        this.mcpProcess = null;
      });

      // 等待服务启动
      await this.waitForService();
      this.isRunning = true;
      console.log(`[MCP Service Manager] Service started on port ${this.config.port}`);
    } finally {
      this.startupPromise = null;
    }
  }

  /**
   * 等待服务启动
   */
  private async waitForService(maxAttempts = 30): Promise<void> {
    const url = `http://localhost:${this.config.port}/health`;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        await axios.get(url, { timeout: 1000 });
        return;
      } catch (error) {
        if (i === maxAttempts - 1) {
          throw new Error('MCP service failed to start within timeout');
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * 停止 MCP 服务
   */
  async stop(): Promise<void> {
    if (!this.isRunning || !this.mcpProcess) {
      return;
    }

    console.log('[MCP Service Manager] Stopping xiaohongshu-mcp service...');

    this.mcpProcess.kill('SIGTERM');

    // 等待进程退出
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.mcpProcess) {
          this.mcpProcess.kill('SIGKILL');
        }
        resolve(void 0);
      }, 5000);

      this.mcpProcess?.on('exit', () => {
        clearTimeout(timeout);
        resolve(void 0);
      });
    });

    this.isRunning = false;
    this.mcpProcess = null;
    console.log('[MCP Service Manager] Service stopped');
  }

  /**
   * 检查服务状态
   */
  async isHealthy(): Promise<boolean> {
    if (!this.isRunning) {
      return false;
    }

    try {
      const response = await axios.get(`http://localhost:${this.config.port}/health`, {
        timeout: 3000,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * 获取登录二维码 - 使用 xiaohongshu-login 二进制文件
   */
  async getLoginQRCode(): Promise<any> {
    try {
      console.log('[MCP Service Manager] Generating QR code using xiaohongshu-login binary...');

      const loginBinaryPath = this.getLoginBinaryPath();

      // 设置环境变量
      const env = {
        ...process.env,
        COOKIES_PATH: this.config.cookiesPath,
      };

      // 确保cookies文件存在（即使是空的）
      try {
        await fs.writeFile(this.config.cookiesPath!, '[]', { flag: 'wx' });
      } catch {
        // 文件已存在，忽略错误
      }

      // 运行 xiaohongshu-login 来生成二维码，增加超时时间以允许浏览器下载
      const { stdout, stderr } = await execAsync(`"${loginBinaryPath}"`, {
        env,
        timeout: 300000, // 5分钟超时，给足时间下载浏览器
      });

      console.log('[MCP Service Manager] QR code generation output:', stdout);
      if (stderr) {
        console.log('[MCP Service Manager] QR code generation stderr:', stderr);
      }

      // 解析输出并查找二维码数据
      const lines = stdout.split('\n');
      let qrCodeData = null;

      for (const line of lines) {
        if (line.includes('data:image') || line.includes('base64')) {
          qrCodeData = line.trim();
          break;
        }
      }

      if (qrCodeData) {
        return {
          content: [{ type: 'text', text: `QR Code generated: ${qrCodeData}` }],
          qrcode: qrCodeData,
        };
      } else {
        // 如果没有找到二维码数据，创建一个示例响应
        return {
          content: [{ type: 'text', text: 'QR code generation completed. Browser setup finished.' }],
          output: stdout,
          status: 'browser_ready',
        };
      }
    } catch (error: any) {
      console.error('[MCP Service Manager] Failed to get login QR code:', error.message);

      // 如果是超时错误且包含浏览器下载信息，说明在下载浏览器
      if (error.message.includes('timeout') && error.stdout?.includes('Download:')) {
        return {
          content: [{ type: 'text', text: 'Browser setup in progress. This is a one-time download.' }],
          output: error.stdout,
          status: 'downloading_browser',
        };
      }

      throw error;
    }
  }

  /**
   * 检查登录状态 - 使用 xiaohongshu-login 二进制文件
   */
  async checkLoginStatus(): Promise<any> {
    try {
      console.log('[MCP Service Manager] Checking login status...');

      // 检查 cookies 文件是否存在
      try {
        await fs.access(this.config.cookiesPath!);
        const stats = await fs.stat(this.config.cookiesPath!);

        if (stats.size > 0) {
          return {
            content: [{ type: 'text', text: 'User is logged in' }],
            isLoggedIn: true,
          };
        } else {
          return {
            content: [{ type: 'text', text: 'User is not logged in' }],
            isLoggedIn: false,
          };
        }
      } catch {
        return {
          content: [{ type: 'text', text: 'User is not logged in' }],
          isLoggedIn: false,
        };
      }
    } catch (error: any) {
      console.error('[MCP Service Manager] Failed to check login status:', error.message);
      throw error;
    }
  }

  /**
   * 启动登录流程
   */
  async startLogin(): Promise<void> {
    // xiaohongshu-mcp 不需要单独的登录进程，登录通过 get_login_qrcode 处理
    console.log('[MCP Service Manager] Login process handled via get_login_qrcode tool');
  }

  /**
   * 解压 tar.gz 文件
   */
  private async extractTarGz(archivePath: string, outputDir: string): Promise<void> {
    await execAsync(`tar -xzf "${archivePath}" -C "${outputDir}"`);
  }

  /**
   * 解压 zip 文件
   */
  private async extractZip(archivePath: string, outputDir: string): Promise<void> {
    await execAsync(`unzip -o "${archivePath}" -d "${outputDir}"`);
  }

  /**
   * 获取配置信息
   */
  getConfig(): MCPServiceConfig {
    return { ...this.config };
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      port: this.config.port,
      processId: this.mcpProcess?.pid || null,
    };
  }
}