/**
 * 小红书登录服务
 * 支持扫码登录和登录状态检查
 */
import { XiaohongshuBrowser } from './XiaohongshuBrowser.js';
import { Page } from 'playwright';

export interface QRCodeResult {
  qrCodeUrl: string;
  qrCodeBase64?: string;
}

export interface LoginStatus {
  isLoggedIn: boolean;
  username?: string;
  userId?: string;
}

export class LoginService {
  private readonly LOGIN_URL = 'https://creator.xiaohongshu.com';
  private readonly TIMEOUT = 60000; // 60秒

  constructor(private browser: XiaohongshuBrowser) {}

  /**
   * 获取登录二维码
   */
  async getQRCode(userId: string): Promise<QRCodeResult> {
    console.log(`[LoginService] 为用户 ${userId} 获取登录二维码`);

    const page = await this.browser.createPage(userId);

    try {
      // 访问登录页
      await page.goto(this.LOGIN_URL, { waitUntil: 'networkidle' });

      // 等待二维码加载
      console.log('[LoginService] 等待二维码加载...');

      // 小红书可能有多种登录方式，确保切换到扫码登录
      const qrTabButton = page.locator('text=扫码登录').or(page.locator('text=二维码登录'));
      if (await qrTabButton.isVisible()) {
        await qrTabButton.click();
        await page.waitForTimeout(1000);
      }

      // 等待二维码图片出现（根据实际页面结构调整选择器）
      const qrCodeLocator = page.locator('.qrcode img, .login-qrcode img, canvas.qrcode-canvas').first();
      await qrCodeLocator.waitFor({ state: 'visible', timeout: this.TIMEOUT });

      // 获取二维码 URL 或截图
      let qrCodeUrl = '';
      let qrCodeBase64 = '';

      const src = await qrCodeLocator.getAttribute('src');
      if (src) {
        qrCodeUrl = src.startsWith('http') ? src : `${this.LOGIN_URL}${src}`;
      } else {
        // 如果是 canvas，截图
        const screenshot = await qrCodeLocator.screenshot();
        qrCodeBase64 = screenshot.toString('base64');
        qrCodeUrl = `data:image/png;base64,${qrCodeBase64}`;
      }

      console.log(`[LoginService] ✅ 二维码获取成功`);

      // 保持页面打开，等待扫码
      // 注意：不关闭页面，让用户有时间扫码

      return { qrCodeUrl, qrCodeBase64 };

    } catch (error) {
      await page.close();
      console.error('[LoginService] ❌ 获取二维码失败:', error);
      throw new Error(`获取二维码失败: ${error}`);
    }
  }

  /**
   * 检查登录状态
   * 通过检查是否有用户信息元素来判断
   */
  async checkLoginStatus(userId: string): Promise<LoginStatus> {
    console.log(`[LoginService] 检查用户 ${userId} 的登录状态`);

    const page = await this.browser.createPage(userId);

    try {
      // 访问创作者中心
      await page.goto(this.LOGIN_URL, {
        waitUntil: 'domcontentloaded',
        timeout: this.TIMEOUT
      });

      // 等待页面稳定
      await page.waitForTimeout(2000);

      // 检查是否有用户头像或用户名元素（根据实际页面调整）
      const userAvatarLocator = page.locator('.user-avatar, .user-info, .header-user').first();
      const isLoggedIn = await userAvatarLocator.isVisible({ timeout: 5000 }).catch(() => false);

      if (isLoggedIn) {
        // 尝试获取用户名
        const usernameLocator = page.locator('.username, .user-name, .nickname').first();
        const username = await usernameLocator.textContent({ timeout: 3000 }).catch(() => undefined);

        console.log(`[LoginService] ✅ 用户 ${userId} 已登录${username ? ` (用户名: ${username})` : ''}`);

        // 保存 Cookie
        await this.browser.saveUserCookies(userId);

        await page.close();
        return {
          isLoggedIn: true,
          username: username || undefined,
        };
      } else {
        console.log(`[LoginService] ⚠️ 用户 ${userId} 未登录`);
        await page.close();
        return { isLoggedIn: false };
      }

    } catch (error) {
      await page.close();
      console.error('[LoginService] ❌ 检查登录状态失败:', error);
      throw new Error(`检查登录状态失败: ${error}`);
    }
  }

  /**
   * 等待扫码登录完成
   * 持续检查页面直到登录成功或超时
   */
  async waitForLogin(userId: string, timeoutMs: number = 120000): Promise<LoginStatus> {
    console.log(`[LoginService] 等待用户 ${userId} 扫码登录 (超时: ${timeoutMs / 1000}秒)`);

    const startTime = Date.now();
    const checkInterval = 2000; // 每2秒检查一次

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.checkLoginStatus(userId);

      if (status.isLoggedIn) {
        console.log(`[LoginService] ✅ 用户 ${userId} 扫码登录成功`);
        return status;
      }

      // 等待下一次检查
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    console.log(`[LoginService] ⏰ 等待登录超时 (${timeoutMs / 1000}秒)`);
    return { isLoggedIn: false };
  }

  /**
   * 登出
   */
  async logout(userId: string): Promise<void> {
    console.log(`[LoginService] 用户 ${userId} 登出`);

    // 清除 Cookie
    await this.browser.clearUserCookies(userId);

    console.log(`[LoginService] ✅ 用户 ${userId} 已登出`);
  }
}
