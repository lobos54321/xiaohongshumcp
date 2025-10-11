/**
 * Cookie Orchestrator - 统一Cookie管理系统
 * 实现Cookie的智能检测、提取、验证、存储和同步
 */

import fs from 'fs';
import path from 'path';
import { CookieManager } from './cookieManager.js';
import { AutoCookieDetector } from './autoCookieDetector.js';

// 类型定义
export interface RawCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: string;
}

export interface ValidCookie extends RawCookie {
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'Lax' | 'Strict' | 'None';
}

export interface CookieSource {
  type: 'ultra-simple-login' | 'browser-detection' | 'manual-import' | 'existing-storage';
  path?: string;
  confidence: number; // 0-1 置信度
  data?: any;
}

export interface ValidationResult {
  isValid: boolean;
  hasRequiredCookies: boolean;
  missingCookies: string[];
  cookieCount: number;
  sessionType: 'guest' | 'authenticated' | 'unknown';
}

export interface SyncResult {
  mcpRouterSuccess: boolean;
  localStorageSuccess: boolean;
  errors: string[];
}

export interface AuthStatus {
  isAuthenticated: boolean;
  userId: string;
  source: string;
  lastValidated: Date;
  cookieCount: number;
  sessionInfo?: {
    sessionId: string;
    isGuest: boolean;
  };
}

export class CookieOrchestrator {
  private cookieManager: CookieManager;
  private cookieDetector: AutoCookieDetector;
  private mcpRouterURL: string;

  constructor(mcpRouterURL: string = process.env.MCP_ROUTER_URL || 'http://localhost:3001') {
    this.cookieManager = new CookieManager();
    this.cookieDetector = new AutoCookieDetector();
    this.mcpRouterURL = mcpRouterURL;
  }

  /**
   * 1. 智能检测Cookie源
   */
  async detectCookieSource(): Promise<CookieSource[]> {
    const sources: CookieSource[] = [];

    console.log('[CookieOrchestrator] 开始智能检测Cookie源...');

    // 检测1: ultra-simple-login源
    const ultraSimplePaths = [
      // Zeabur生产环境路径
      path.join(process.cwd(), '..', 'mcp-router', 'latest.json'),
      path.join('/app', 'mcp-router', 'latest.json'),
      // 本地开发路径
      path.join(process.cwd(), 'playwright-service', 'mcp-router', 'latest.json'),
      path.join(process.cwd(), 'latest.json'),
      // 其他可能路径
      '/tmp/latest.json',
      '/workspace/mcp-router/latest.json'
    ];

    for (const filePath of ultraSimplePaths) {
      try {
        if (fs.existsSync(filePath)) {
          const content = await fs.promises.readFile(filePath, 'utf-8');
          const data = JSON.parse(content);
          if (data.cookies && Array.isArray(data.cookies) && data.cookies.length > 0) {
            sources.push({
              type: 'ultra-simple-login',
              path: filePath,
              confidence: 0.9,
              data: data
            });
            console.log(`[CookieOrchestrator] 找到ultra-simple-login源: ${filePath}`);
            break; // 找到一个就够了
          }
        }
      } catch (error) {
        console.warn(`[CookieOrchestrator] 读取${filePath}失败:`, error);
      }
    }

    // 检测2: 浏览器自动检测
    try {
      const browserResult = await this.cookieDetector.autoDetectCookies();
      if (browserResult.success && browserResult.cookies && browserResult.cookies.length > 0) {
        sources.push({
          type: 'browser-detection',
          confidence: 0.7,
          data: { cookies: browserResult.cookies }
        });
        console.log('[CookieOrchestrator] 找到浏览器检测源');
      }
    } catch (error) {
      console.warn('[CookieOrchestrator] 浏览器检测失败:', error);
    }

    // 检测3: 现有存储
    // TODO: 检查是否已有存储的Cookie

    console.log(`[CookieOrchestrator] 检测到${sources.length}个Cookie源`);
    return sources.sort((a, b) => b.confidence - a.confidence); // 按置信度排序
  }

  /**
   * 2. 从指定源提取Cookie
   */
  async extractCookies(source: CookieSource): Promise<RawCookie[]> {
    console.log(`[CookieOrchestrator] 从${source.type}提取Cookie...`);

    switch (source.type) {
      case 'ultra-simple-login':
        if (source.data && source.data.cookies) {
          return source.data.cookies;
        }
        break;

      case 'browser-detection':
        if (source.data && source.data.cookies) {
          return source.data.cookies;
        }
        break;

      case 'manual-import':
        // TODO: 实现手动导入
        break;

      case 'existing-storage':
        // TODO: 从现有存储读取
        break;
    }

    throw new Error(`无法从${source.type}提取Cookie`);
  }

  /**
   * 3. 验证Cookie有效性
   */
  validateCookies(cookies: RawCookie[]): ValidationResult {
    console.log(`[CookieOrchestrator] 验证${cookies.length}个Cookie...`);

    const requiredCookies = ['web_session', 'a1'];
    const foundCookies = cookies.map(c => c.name);
    const missingCookies = requiredCookies.filter(required => !foundCookies.includes(required));

    // 检查session类型
    const sessionCookie = cookies.find(c => c.name === 'web_session');
    let sessionType: 'guest' | 'authenticated' | 'unknown' = 'unknown';

    if (sessionCookie) {
      if (sessionCookie.value.includes('Guest')) {
        sessionType = 'guest';
      } else if (sessionCookie.value && sessionCookie.value.length > 20) {
        sessionType = 'authenticated';
      }
    }

    const result: ValidationResult = {
      isValid: missingCookies.length === 0 && sessionType === 'authenticated',
      hasRequiredCookies: missingCookies.length === 0,
      missingCookies,
      cookieCount: cookies.length,
      sessionType
    };

    console.log('[CookieOrchestrator] Cookie验证结果:', {
      isValid: result.isValid,
      sessionType: result.sessionType,
      missingCookies: result.missingCookies
    });

    return result;
  }

  /**
   * 4. 标准化并存储Cookie
   */
  async storeCookies(cookies: RawCookie[], userId: string): Promise<void> {
    console.log(`[CookieOrchestrator] 为用户${userId}存储${cookies.length}个Cookie...`);

    // 标准化Cookie格式
    const standardCookies: ValidCookie[] = cookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain || '.xiaohongshu.com',
      path: cookie.path || '/',
      secure: cookie.secure !== false,
      httpOnly: cookie.httpOnly || false,
      sameSite: (cookie.sameSite as 'Lax' | 'Strict' | 'None') || 'Lax'
    }));

    // 使用现有的CookieManager存储
    await this.cookieManager.saveCookies(userId, standardCookies);
    console.log(`[CookieOrchestrator] Cookie已加密存储到本地`);
  }

  /**
   * 5. 同步到各个服务
   */
  async syncToServices(userId: string, cookies: ValidCookie[]): Promise<SyncResult> {
    console.log(`[CookieOrchestrator] 同步Cookie到各个服务...`);

    const result: SyncResult = {
      mcpRouterSuccess: false,
      localStorageSuccess: true, // 已经存储到本地了
      errors: []
    };

    // 同步到MCP Router
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
      result.mcpRouterSuccess = true;
      console.log(`[CookieOrchestrator] 成功同步到MCP Router`);
    } catch (error: any) {
      result.errors.push(`MCP Router同步失败: ${error.message}`);
      console.error(`[CookieOrchestrator] MCP Router同步失败:`, error.message);
    }

    return result;
  }

  /**
   * 6. 获取认证状态
   */
  async getAuthStatus(userId: string): Promise<AuthStatus> {
    console.log(`[CookieOrchestrator] 获取用户${userId}的认证状态...`);

    try {
      // 检查本地存储的Cookie
      const cookies = await this.cookieManager.getCookies(userId);

      if (!cookies || cookies.length === 0) {
        return {
          isAuthenticated: false,
          userId,
          source: 'none',
          lastValidated: new Date(),
          cookieCount: 0
        };
      }

      // 验证Cookie
      const validation = this.validateCookies(cookies);
      const sessionCookie = cookies.find(c => c.name === 'web_session');

      return {
        isAuthenticated: validation.isValid,
        userId,
        source: 'local_storage',
        lastValidated: new Date(),
        cookieCount: cookies.length,
        sessionInfo: sessionCookie ? {
          sessionId: sessionCookie.value.substring(0, 8) + '...',
          isGuest: sessionCookie.value.includes('Guest')
        } : undefined
      };

    } catch (error: any) {
      console.error(`[CookieOrchestrator] 获取认证状态失败:`, error);
      return {
        isAuthenticated: false,
        userId,
        source: 'error',
        lastValidated: new Date(),
        cookieCount: 0
      };
    }
  }

  /**
   * 完整的Cookie处理流程
   */
  async processUserAuthentication(userId: string): Promise<{
    success: boolean;
    authStatus: AuthStatus;
    message: string;
    actions?: string[];
  }> {
    console.log(`[CookieOrchestrator] 开始处理用户${userId}的完整认证流程...`);

    try {
      // 1. 检查现有状态
      const currentStatus = await this.getAuthStatus(userId);
      if (currentStatus.isAuthenticated) {
        return {
          success: true,
          authStatus: currentStatus,
          message: '用户已认证，无需重新处理'
        };
      }

      // 2. 检测Cookie源
      const sources = await this.detectCookieSource();
      if (sources.length === 0) {
        return {
          success: false,
          authStatus: currentStatus,
          message: '未找到任何Cookie源',
          actions: ['请先完成小红书登录', '确保Cookie已保存到浏览器或文件']
        };
      }

      // 3. 尝试从最佳源提取Cookie
      const bestSource = sources[0];
      const cookies = await this.extractCookies(bestSource);

      // 4. 验证Cookie
      const validation = this.validateCookies(cookies);
      if (!validation.isValid) {
        return {
          success: false,
          authStatus: currentStatus,
          message: `Cookie验证失败: ${validation.sessionType === 'guest' ? '检测到游客会话' : '缺少必要Cookie'}`,
          actions: validation.missingCookies.length > 0 ?
            [`缺少Cookie: ${validation.missingCookies.join(', ')}`] :
            ['请确保已完成真实登录（非游客模式）']
        };
      }

      // 5. 存储Cookie
      await this.storeCookies(cookies, userId);

      // 6. 同步到服务
      const syncResult = await this.syncToServices(userId, cookies as ValidCookie[]);

      // 7. 返回最终状态
      const finalStatus = await this.getAuthStatus(userId);

      return {
        success: true,
        authStatus: finalStatus,
        message: `认证流程完成，从${bestSource.type}源获取了${cookies.length}个Cookie`,
        actions: syncResult.errors.length > 0 ? [`同步警告: ${syncResult.errors.join(', ')}`] : undefined
      };

    } catch (error: any) {
      console.error(`[CookieOrchestrator] 认证流程失败:`, error);
      const errorStatus = await this.getAuthStatus(userId);
      return {
        success: false,
        authStatus: errorStatus,
        message: `认证流程失败: ${error.message}`,
        actions: ['请检查网络连接', '确认服务状态正常']
      };
    }
  }
}