/**
 * 自动Cookie导入服务
 * 监控ultra-simple-login的Cookie文件，自动导入到系统
 */

import fs from 'fs';
import path from 'path';
import { CookieManager } from './cookieManager.js';

export interface PlaywrightCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export interface StandardCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
}

export interface AutoImportResult {
  success: boolean;
  cookieCount: number;
  userId: string;
  source: string;
  message: string;
  error?: string;
}

export class AutoCookieImporter {
  private cookieManager: CookieManager;
  private mcpRouterURL: string;
  private watchInterval: NodeJS.Timeout | null = null;
  private lastImportTime: number = 0;

  // 监控的Cookie文件路径 (按优先级排列)
  private readonly WATCH_PATHS = [
    // BMAD项目中的ultra-simple-login路径
    path.join(process.cwd(), '..', '..', 'BMAD-METHOD', 'bmad-demo-project', 'xiaohongshu-enhanced', 'playwright-service', 'mcp-router', 'cookies', 'latest.json'),
    // 本地开发路径
    path.join(process.cwd(), 'playwright-service', 'mcp-router', 'cookies', 'latest.json'),
    path.join(process.cwd(), '..', 'mcp-router', 'cookies', 'latest.json'),
    // 临时目录
    '/tmp/xiaohongshu_cookies.json',
    // Zeabur生产环境路径
    '/app/mcp-router/cookies/latest.json'
  ];

  constructor(mcpRouterURL: string = process.env.MCP_ROUTER_URL || 'http://127.0.0.1:3000') {
    this.cookieManager = new CookieManager();
    this.mcpRouterURL = mcpRouterURL;
  }

  /**
   * 启动自动监控
   */
  startAutoImport(intervalMs: number = 10000): void {
    console.log('[AutoCookieImporter] 启动自动Cookie导入监控...');

    if (this.watchInterval) {
      clearInterval(this.watchInterval);
    }

    // 立即执行一次
    this.checkAndImportCookies();

    // 定期检查
    this.watchInterval = setInterval(() => {
      this.checkAndImportCookies();
    }, intervalMs);

    console.log(`[AutoCookieImporter] 监控已启动，每${intervalMs/1000}秒检查一次`);
  }

  /**
   * 停止自动监控
   */
  stopAutoImport(): void {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
      console.log('[AutoCookieImporter] 自动监控已停止');
    }
  }

  /**
   * 检查并导入Cookie
   */
  private async checkAndImportCookies(): Promise<void> {
    try {
      for (const cookiePath of this.WATCH_PATHS) {
        if (await this.shouldImportFile(cookiePath)) {
          const result = await this.importCookieFile(cookiePath);
          if (result.success) {
            console.log(`[AutoCookieImporter] ✅ 自动导入成功: ${result.message}`);
            this.lastImportTime = Date.now();
            break; // 成功导入一个文件后停止
          }
        }
      }
    } catch (error: any) {
      console.error('[AutoCookieImporter] 检查过程出错:', error.message);
    }
  }

  /**
   * 检查文件是否需要导入
   */
  private async shouldImportFile(filePath: string): Promise<boolean> {
    try {
      if (!fs.existsSync(filePath)) {
        return false;
      }

      const stats = fs.statSync(filePath);
      const fileModTime = stats.mtime.getTime();

      // 如果文件比上次导入时间新，且大小合理，则需要导入
      if (fileModTime > this.lastImportTime && stats.size > 10 && stats.size < 1024 * 1024) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * 导入Cookie文件
   */
  private async importCookieFile(filePath: string): Promise<AutoImportResult> {
    try {
      console.log(`[AutoCookieImporter] 正在导入Cookie文件: ${filePath}`);

      const content = await fs.promises.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      // 处理不同的文件格式
      let cookies: PlaywrightCookie[];

      if (Array.isArray(data)) {
        // 直接是Cookie数组 (ultra-simple-login格式)
        cookies = data;
      } else if (data.cookies && Array.isArray(data.cookies)) {
        // 包装在cookies字段中
        cookies = data.cookies;
      } else {
        throw new Error('无法识别的Cookie文件格式');
      }

      // 过滤小红书相关的Cookie
      const xiaohongshuCookies = cookies.filter(cookie =>
        cookie.domain && cookie.domain.includes('xiaohongshu.com')
      );

      if (xiaohongshuCookies.length === 0) {
        return {
          success: false,
          cookieCount: 0,
          userId: 'unknown',
          source: filePath,
          message: '文件中没有小红书相关的Cookie'
        };
      }

      // 验证Cookie质量
      const sessionCookie = xiaohongshuCookies.find(c => c.name === 'web_session');
      const a1Cookie = xiaohongshuCookies.find(c => c.name === 'a1');

      if (!sessionCookie || !a1Cookie) {
        return {
          success: false,
          cookieCount: xiaohongshuCookies.length,
          userId: 'unknown',
          source: filePath,
          message: '缺少必要的Cookie字段 (web_session 或 a1)'
        };
      }

      // 检查是否为Guest会话
      if (sessionCookie.value.includes('Guest') || sessionCookie.value.startsWith('030037af')) {
        return {
          success: false,
          cookieCount: xiaohongshuCookies.length,
          userId: 'unknown',
          source: filePath,
          message: '检测到Guest会话，不是真实登录状态'
        };
      }

      // 转换为标准格式
      const standardCookies: StandardCookie[] = xiaohongshuCookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain || '.xiaohongshu.com',
        path: cookie.path || '/',
        secure: cookie.secure !== false,
        httpOnly: cookie.httpOnly || false,
        sameSite: cookie.sameSite || 'Lax'
      }));

      // 生成用户ID (基于session的一部分)
      const userId = `auto_${sessionCookie.value.substring(0, 8)}`;

      // 保存到本地加密存储
      await this.cookieManager.saveCookies(userId, standardCookies);

      // 同步到MCP Router
      const syncSuccess = await this.syncToMCPRouter(userId, standardCookies);

      return {
        success: true,
        cookieCount: standardCookies.length,
        userId,
        source: filePath,
        message: `自动导入${standardCookies.length}个Cookie，用户ID: ${userId}${syncSuccess ? '，已同步到MCP Router' : '，MCP Router同步失败'}`
      };

    } catch (error: any) {
      console.error(`[AutoCookieImporter] 导入失败:`, error.message);
      return {
        success: false,
        cookieCount: 0,
        userId: 'unknown',
        source: filePath,
        message: '导入失败',
        error: error.message
      };
    }
  }

  /**
   * 同步到MCP Router
   */
  private async syncToMCPRouter(userId: string, cookies: StandardCookie[]): Promise<boolean> {
    try {
      const axios = await import('axios');

      await axios.default.post(
        `${this.mcpRouterURL}/api/xiaohongshu/login/import-cookies`,
        {
          userId: userId,
          cookies: cookies
        },
        { timeout: 10000 }
      );

      console.log(`[AutoCookieImporter] ✅ 成功同步到MCP Router: ${userId}`);
      return true;
    } catch (error: any) {
      console.error(`[AutoCookieImporter] ❌ MCP Router同步失败:`, error.message);
      return false;
    }
  }

  /**
   * 手动触发导入
   */
  async manualImport(userId?: string): Promise<AutoImportResult> {
    console.log('[AutoCookieImporter] 手动触发Cookie导入...');

    for (const cookiePath of this.WATCH_PATHS) {
      if (fs.existsSync(cookiePath)) {
        const result = await this.importCookieFile(cookiePath);
        if (result.success) {
          // 如果指定了userId，重新保存为指定的userId
          if (userId && userId !== result.userId) {
            try {
              const content = await fs.promises.readFile(cookiePath, 'utf-8');
              const data = JSON.parse(content);
              const cookies = Array.isArray(data) ? data : data.cookies;

              const standardCookies: StandardCookie[] = cookies
                .filter((cookie: PlaywrightCookie) => cookie.domain && cookie.domain.includes('xiaohongshu.com'))
                .map((cookie: PlaywrightCookie) => ({
                  name: cookie.name,
                  value: cookie.value,
                  domain: cookie.domain || '.xiaohongshu.com',
                  path: cookie.path || '/',
                  secure: cookie.secure !== false,
                  httpOnly: cookie.httpOnly || false,
                  sameSite: cookie.sameSite || 'Lax'
                }));

              await this.cookieManager.saveCookies(userId, standardCookies);
              await this.syncToMCPRouter(userId, standardCookies);

              return {
                ...result,
                userId,
                message: `手动导入成功，用户ID: ${userId}`
              };
            } catch (error: any) {
              return {
                ...result,
                error: `重新保存为指定用户ID失败: ${error.message}`
              };
            }
          }

          return result;
        }
      }
    }

    return {
      success: false,
      cookieCount: 0,
      userId: userId || 'unknown',
      source: 'manual',
      message: '未找到可导入的Cookie文件'
    };
  }

  /**
   * 获取监控状态
   */
  getStatus(): {
    isRunning: boolean;
    lastImportTime: number;
    watchPaths: string[];
    availableFiles: string[];
  } {
    const availableFiles = this.WATCH_PATHS.filter(path => fs.existsSync(path));

    return {
      isRunning: this.watchInterval !== null,
      lastImportTime: this.lastImportTime,
      watchPaths: this.WATCH_PATHS,
      availableFiles
    };
  }
}
