/**
 * 浮窗登录服务 - 创建一个小的浮窗浏览器用于小红书登录
 */

import { BrowserContext, chromium, Page, Frame, Response } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

export interface FloatingLoginOptions {
  userId: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
}

export interface LoginResult {
  success: boolean;
  cookies?: any[];
  error?: string;
}

export class FloatingLoginService {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private isLoggedIn = false;
  private cookiesSaved = false;

  constructor() {
    // 确保cookies目录存在
    const cookiesDir = path.join(process.cwd(), 'cookies');
    if (!fs.existsSync(cookiesDir)) {
      fs.mkdirSync(cookiesDir, { recursive: true });
    }
  }

  /**
   * 启动浮窗登录
   */
  async startFloatingLogin(options: FloatingLoginOptions): Promise<LoginResult> {
    const { userId, width = 450, height = 650, x = 200, y = 100 } = options;

    try {
      console.log(`[FloatingLogin] Starting floating login for user ${userId}`);

      // 启动Chromium浏览器 - 使用绝对路径确保找到已下载的Chromium
      const browser = await chromium.launch({
        headless: false,
        args: [
          `--window-size=${width},${height}`,
          `--window-position=${x},${y}`,
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-extensions',
          '--disable-plugins'
        ]
      });

      this.context = await browser.newContext({
        viewport: { width, height },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      this.page = await this.context.newPage();

      // 设置页面标题
      await this.page.setExtraHTTPHeaders({
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      });

      // 监听Cookie变化
      this.setupCookieMonitoring(userId);

      // 导航到小红书登录页面
      console.log(`[FloatingLogin] Navigating to xiaohongshu login page`);
      await this.page.goto('https://www.xiaohongshu.com/login', {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // 等待登录完成
      const result = await this.waitForLogin(userId);

      return result;

    } catch (error: any) {
      console.error(`[FloatingLogin] Error during floating login:`, error);

      // 如果Playwright失败，回退到系统浏览器
      console.log(`[FloatingLogin] Falling back to system browser`);
      const { spawn } = await import('child_process');
      const loginUrl = 'https://www.xiaohongshu.com/login';

      console.log(`[FloatingLogin] Opening login page in system browser: ${loginUrl}`);
      spawn('open', [loginUrl], { detached: true });

      return {
        success: false,
        error: `系统浏览器已启动登录页面`
      };
    }
  }

  /**
   * 设置Cookie监听
   */
  private setupCookieMonitoring(userId: string) {
    if (!this.page) return;

    // 监听页面变化，检测登录状态
    this.page.on('framenavigated', async (frame: Frame) => {
      if (frame === this.page?.mainFrame()) {
        const url = frame.url();
        console.log(`[FloatingLogin] Page navigated to: ${url}`);

        // 检查是否已经登录（URL变化或存在特定元素）
        if (url.includes('xiaohongshu.com') && !url.includes('/login')) {
          await this.checkLoginSuccess(userId);
        }
      }
    });

    // 监听网络请求，检测登录API调用
    this.page.on('response', async (response: Response) => {
      const url = response.url();
      if (url.includes('/api/sns/red/v1/auth/') ||
          url.includes('/api/sns/red/login') ||
          url.includes('/login/submit')) {
        console.log(`[FloatingLogin] Login-related request: ${url}, status: ${response.status()}`);

        if (response.status() === 200) {
          // 延迟检查登录状态
          setTimeout(() => this.checkLoginSuccess(userId), 2000);
        }
      }
    });
  }

  /**
   * 检查登录是否成功
   */
  private async checkLoginSuccess(userId: string) {
    if (this.isLoggedIn || this.cookiesSaved || !this.page) return;

    try {
      // 检查页面URL是否变化（最简单的方法）
      const currentUrl = this.page.url();
      console.log(`[FloatingLogin] Current URL: ${currentUrl}`);

      // 如果不在登录页面，认为登录成功
      if (!currentUrl.includes('/login') && currentUrl.includes('xiaohongshu.com')) {
        console.log(`[FloatingLogin] Login detected for user ${userId} - URL changed from login page`);
        this.isLoggedIn = true;
        await this.saveCookiesAndHide(userId);
      }

    } catch (error) {
      console.error(`[FloatingLogin] Error checking login status:`, error);
    }
  }

  /**
   * 保存Cookie并隐藏浏览器
   */
  private async saveCookiesAndHide(userId: string) {
    if (this.cookiesSaved || !this.context) return;

    try {
      console.log(`[FloatingLogin] Saving cookies for user ${userId}`);

      // 获取所有Cookie
      const cookies = await this.context.cookies();

      // 过滤小红书相关的Cookie
      const xhsCookies = cookies.filter((cookie: any) =>
        cookie.domain.includes('xiaohongshu.com') ||
        cookie.domain.includes('.xiaohongshu.com')
      );

      if (xhsCookies.length > 0) {
        // 保存到临时文件，供CookieManager读取
        const cookieFile = path.join(process.cwd(), 'cookies', `${userId}.json`);
        fs.writeFileSync(cookieFile, JSON.stringify(xhsCookies, null, 2));

        console.log(`[FloatingLogin] Cookies saved to ${cookieFile} (${xhsCookies.length} cookies)`);
        this.cookiesSaved = true;

        // 延迟隐藏浏览器
        setTimeout(async () => {
          await this.hideBrowser();
        }, 3000);

      } else {
        console.log(`[FloatingLogin] No xiaohongshu cookies found`);
      }

    } catch (error) {
      console.error(`[FloatingLogin] Error saving cookies:`, error);
    }
  }

  /**
   * 隐藏浏览器
   */
  private async hideBrowser() {
    try {
      if (this.page) {
        console.log(`[FloatingLogin] Hiding browser window`);

        // 直接关闭页面和上下文
        await this.page.close();
        if (this.context) {
          await this.context.close();
        }

        console.log(`[FloatingLogin] Browser hidden successfully`);
      }
    } catch (error) {
      console.error(`[FloatingLogin] Error hiding browser:`, error);
    }
  }

  /**
   * 等待登录完成
   */
  private async waitForLogin(userId: string, timeout = 300000): Promise<LoginResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const checkInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;

        if (this.cookiesSaved) {
          clearInterval(checkInterval);
          resolve({
            success: true,
            cookies: []
          });
        } else if (elapsed > timeout) {
          clearInterval(checkInterval);
          resolve({
            success: false,
            error: 'Login timeout'
          });
        }
      }, 1000);

      // 手动检查（用户可能已经快速登录）
      setTimeout(() => this.checkLoginSuccess(userId), 5000);
    });
  }

  /**
   * 强制关闭浏览器
   */
  async cleanup() {
    try {
      if (this.page) {
        await this.page.close();
      }
      if (this.context) {
        await this.context.close();
      }
    } catch (error) {
      console.error(`[FloatingLogin] Error during cleanup:`, error);
    }
  }
}