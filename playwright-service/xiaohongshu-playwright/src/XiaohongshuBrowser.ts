/**
 * 小红书浏览器管理器
 * 负责浏览器实例和多用户上下文管理
 */
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

export interface BrowserConfig {
  headless?: boolean;
  cookiesDir?: string;
  userDataDir?: string;
}

export class XiaohongshuBrowser {
  private browser: Browser | null = null;
  private contexts = new Map<string, BrowserContext>();
  private config: Required<BrowserConfig>;

  constructor(config: BrowserConfig = {}) {
    this.config = {
      headless: config.headless ?? true,
      cookiesDir: config.cookiesDir ?? './data/cookies',
      userDataDir: config.userDataDir ?? './data/user-data',
    };

    // 确保目录存在
    this.ensureDirectories();
  }

  private ensureDirectories() {
    [this.config.cookiesDir, this.config.userDataDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * 初始化浏览器
   */
  async init(): Promise<void> {
    if (this.browser) {
      return;
    }

    console.log('[XiaohongshuBrowser] 正在启动浏览器...');

    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    console.log('[XiaohongshuBrowser] ✅ 浏览器启动成功');
  }

  /**
   * 获取或创建用户的浏览器上下文
   * 每个用户独立的 Cookie 和存储
   */
  async getUserContext(userId: string): Promise<BrowserContext> {
    if (!this.browser) {
      await this.init();
    }

    // 如果上下文已存在，直接返回
    if (this.contexts.has(userId)) {
      return this.contexts.get(userId)!;
    }

    console.log(`[XiaohongshuBrowser] 为用户 ${userId} 创建浏览器上下文`);

    const cookiesPath = path.join(this.config.cookiesDir, `${userId}.json`);

    // 加载已保存的 Cookie（如果存在）
    let storageState: any = undefined;
    if (fs.existsSync(cookiesPath)) {
      try {
        storageState = JSON.parse(fs.readFileSync(cookiesPath, 'utf-8'));
        console.log(`[XiaohongshuBrowser] 加载用户 ${userId} 的 Cookie`);
      } catch (error) {
        console.warn(`[XiaohongshuBrowser] 加载 Cookie 失败:`, error);
      }
    }

    // 创建新的浏览器上下文
    const context = await this.browser!.newContext({
      storageState,
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      // 反爬虫检测
      extraHTTPHeaders: {
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });

    // 注入反检测脚本
    await context.addInitScript(() => {
      // 覆盖 webdriver 标识
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });

      // 覆盖 plugins 和 languages
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
    });

    this.contexts.set(userId, context);
    return context;
  }

  /**
   * 保存用户的 Cookie
   */
  async saveUserCookies(userId: string): Promise<void> {
    const context = this.contexts.get(userId);
    if (!context) {
      console.warn(`[XiaohongshuBrowser] 用户 ${userId} 的上下文不存在`);
      return;
    }

    const cookiesPath = path.join(this.config.cookiesDir, `${userId}.json`);

    try {
      await context.storageState({ path: cookiesPath });
      console.log(`[XiaohongshuBrowser] ✅ 已保存用户 ${userId} 的 Cookie`);
    } catch (error) {
      console.error(`[XiaohongshuBrowser] ❌ 保存 Cookie 失败:`, error);
      throw error;
    }
  }

  /**
   * 清除用户的 Cookie
   */
  async clearUserCookies(userId: string): Promise<void> {
    const cookiesPath = path.join(this.config.cookiesDir, `${userId}.json`);

    if (fs.existsSync(cookiesPath)) {
      fs.unlinkSync(cookiesPath);
      console.log(`[XiaohongshuBrowser] ✅ 已清除用户 ${userId} 的 Cookie`);
    }

    // 关闭并删除上下文
    const context = this.contexts.get(userId);
    if (context) {
      await context.close();
      this.contexts.delete(userId);
    }
  }

  /**
   * 创建新页面
   */
  async createPage(userId: string): Promise<Page> {
    const context = await this.getUserContext(userId);
    return await context.newPage();
  }

  /**
   * 关闭用户的浏览器上下文
   */
  async closeUserContext(userId: string): Promise<void> {
    const context = this.contexts.get(userId);
    if (context) {
      await context.close();
      this.contexts.delete(userId);
      console.log(`[XiaohongshuBrowser] 已关闭用户 ${userId} 的浏览器上下文`);
    }
  }

  /**
   * 关闭所有上下文和浏览器
   */
  async cleanup(): Promise<void> {
    console.log('[XiaohongshuBrowser] 正在清理浏览器资源...');

    // 关闭所有上下文
    for (const [userId, context] of this.contexts) {
      await context.close();
      console.log(`[XiaohongshuBrowser] 已关闭用户 ${userId} 的上下文`);
    }

    this.contexts.clear();

    // 关闭浏览器
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log('[XiaohongshuBrowser] ✅ 浏览器已关闭');
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      activeContexts: this.contexts.size,
      users: Array.from(this.contexts.keys()),
    };
  }
}
