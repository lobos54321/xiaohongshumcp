/**
 * .NET XiaoHongShuMCP Stdio Client
 * 用于集成 mook-wenyu 的人性化行为模拟引擎
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

interface BrowserProfile {
  browserKey?: string;
  userAgent?: string;
  viewport?: { width: number; height: number };
  timezone?: string;
  locale?: string;
}

interface BehaviorProfile {
  name?: 'default' | 'cautious' | 'aggressive';
  preActionDelay?: { minMs: number; maxMs: number };
  postActionDelay?: { minMs: number; maxMs: number };
  hesitationProbability?: number;
  scrollRandomness?: number;
}

interface ToolCallRequest {
  name: string;
  arguments: Record<string, any>;
}

interface ToolCallResponse {
  success: boolean;
  content?: any;
  error?: string;
}

export class DotNetMcpClient {
  private process: ChildProcess | null = null;
  private dotnetBinaryPath: string;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }>();
  private isInitialized = false;

  constructor(dotnetProjectPath: string) {
    // .NET 项目的路径（DLL 或项目目录）
    this.dotnetBinaryPath = dotnetProjectPath;
  }

  /**
   * 启动 .NET MCP 进程
   */
  async start(): Promise<void> {
    if (this.process) {
      console.log('[DotNetMCP] Process already running');
      return;
    }

    console.log('[DotNetMCP] Starting .NET MCP server...');
    console.log('[DotNetMCP] Path:', this.dotnetBinaryPath);

    // 启动 .NET 进程
    this.process = spawn('dotnet', ['run', '--project', this.dotnetBinaryPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: path.dirname(this.dotnetBinaryPath),
    });

    if (!this.process.stdout || !this.process.stdin || !this.process.stderr) {
      throw new Error('Failed to create stdio streams');
    }

    // 处理标准输出（JSON-RPC 消息）
    this.process.stdout.on('data', (data: Buffer) => {
      const messages = data.toString().split('\n').filter(line => line.trim());
      for (const message of messages) {
        try {
          const response = JSON.parse(message);
          this.handleResponse(response);
        } catch (error) {
          console.log('[DotNetMCP] Output:', message);
        }
      }
    });

    // 处理错误输出
    this.process.stderr.on('data', (data: Buffer) => {
      console.error('[DotNetMCP] Error:', data.toString());
    });

    // 处理进程退出
    this.process.on('exit', (code) => {
      console.log(`[DotNetMCP] Process exited with code ${code}`);
      this.process = null;
      this.isInitialized = false;
    });

    // 等待初始化完成
    await this.waitForReady();
    this.isInitialized = true;
    console.log('[DotNetMCP] Server ready');
  }

  /**
   * 等待服务就绪
   */
  private async waitForReady(timeout = 10000): Promise<void> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          reject(new Error('Timeout waiting for .NET MCP server to start'));
        }

        // 尝试调用 initialize
        if (this.process && this.process.stdin) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * 停止 .NET MCP 进程
   */
  async stop(): Promise<void> {
    if (!this.process) return;

    console.log('[DotNetMCP] Stopping server...');
    this.process.kill();
    this.process = null;
    this.isInitialized = false;
  }

  /**
   * 发送工具调用请求
   */
  async callTool(request: ToolCallRequest): Promise<ToolCallResponse> {
    if (!this.isInitialized || !this.process || !this.process.stdin) {
      throw new Error('.NET MCP server not initialized');
    }

    const id = ++this.requestId;
    const rpcRequest = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: {
        name: request.name,
        arguments: request.arguments,
      },
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      const message = JSON.stringify(rpcRequest) + '\n';
      this.process!.stdin!.write(message);

      // 设置超时
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 60000); // 60秒超时
    });
  }

  /**
   * 处理响应
   */
  private handleResponse(response: any): void {
    if (!response.id) return;

    const pending = this.pendingRequests.get(response.id);
    if (!pending) return;

    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message || 'Unknown error'));
    } else {
      pending.resolve(response.result);
    }
  }

  /**
   * 高级 API: 打开浏览器会话
   */
  async openBrowser(profile: BrowserProfile): Promise<string> {
    const result = await this.callTool({
      name: 'browser_open',
      arguments: {
        browserKey: profile.browserKey || 'default',
        userAgent: profile.userAgent,
        viewport: profile.viewport,
        timezone: profile.timezone || 'Asia/Shanghai',
        locale: profile.locale || 'zh-CN',
      },
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to open browser');
    }

    return result.content?.sessionId || 'default';
  }

  /**
   * 高级 API: 随机浏览（人性化行为）
   */
  async randomBrowse(options: {
    browserKey?: string;
    duration?: number;
    behaviorProfile?: BehaviorProfile;
  }): Promise<{ visitedNotes: number; interactions: number }> {
    const result = await this.callTool({
      name: 'xhs_random_browse',
      arguments: {
        browserKey: options.browserKey || 'default',
        durationSeconds: options.duration || 60,
        behaviorProfile: options.behaviorProfile?.name || 'default',
        ...options.behaviorProfile,
      },
    });

    if (!result.success) {
      throw new Error(result.error || 'Random browse failed');
    }

    return {
      visitedNotes: result.content?.visitedNotes || 0,
      interactions: result.content?.interactions || 0,
    };
  }

  /**
   * 高级 API: 关键词浏览
   */
  async keywordBrowse(options: {
    browserKey?: string;
    keyword: string;
    maxNotes?: number;
    behaviorProfile?: BehaviorProfile;
  }): Promise<{ notes: any[] }> {
    const result = await this.callTool({
      name: 'xhs_keyword_browse',
      arguments: {
        browserKey: options.browserKey || 'default',
        keyword: options.keyword,
        maxNotes: options.maxNotes || 10,
        behaviorProfile: options.behaviorProfile?.name || 'default',
        ...options.behaviorProfile,
      },
    });

    if (!result.success) {
      throw new Error(result.error || 'Keyword browse failed');
    }

    return {
      notes: result.content?.notes || [],
    };
  }

  /**
   * 高级 API: 采集笔记数据
   */
  async captureNotes(options: {
    browserKey?: string;
    keyword: string;
    maxNotes?: number;
    exportFormat?: 'json' | 'csv';
  }): Promise<{ notes: any[]; exportPath?: string }> {
    const result = await this.callTool({
      name: 'xhs_note_capture',
      arguments: {
        browserKey: options.browserKey || 'default',
        keyword: options.keyword,
        maxNotes: options.maxNotes || 50,
        exportFormat: options.exportFormat || 'json',
      },
    });

    if (!result.success) {
      throw new Error(result.error || 'Note capture failed');
    }

    return {
      notes: result.content?.notes || [],
      exportPath: result.content?.exportPath,
    };
  }

  /**
   * 高级 API: 发布笔记（草稿模式）
   */
  async publishNoteDraft(options: {
    browserKey?: string;
    title: string;
    content: string;
    images?: string[];
    tags?: string[];
  }): Promise<{ draftId: string; url?: string }> {
    const result = await this.callTool({
      name: 'xhs_publish_note',
      arguments: {
        browserKey: options.browserKey || 'default',
        title: options.title,
        content: options.content,
        images: options.images || [],
        tags: options.tags || [],
      },
    });

    if (!result.success) {
      throw new Error(result.error || 'Note publish failed');
    }

    return {
      draftId: result.content?.draftId || '',
      url: result.content?.url,
    };
  }
}

/**
 * 全局单例
 */
let globalClient: DotNetMcpClient | null = null;

export function getDotNetMcpClient(projectPath?: string): DotNetMcpClient {
  if (!globalClient && projectPath) {
    globalClient = new DotNetMcpClient(projectPath);
  }

  if (!globalClient) {
    throw new Error('DotNetMcpClient not initialized. Call with projectPath first.');
  }

  return globalClient;
}
