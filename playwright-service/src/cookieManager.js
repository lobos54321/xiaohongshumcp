const fs = require('fs').promises;
const path = require('path');

const COOKIE_DIR = process.env.COOKIE_DIR || './cookies';

/**
 * Cookie 持久化管理器
 */
class CookieManager {
  constructor() {
    this.ensureCookieDir();
  }

  async ensureCookieDir() {
    try {
      await fs.access(COOKIE_DIR);
    } catch (error) {
      await fs.mkdir(COOKIE_DIR, { recursive: true });
      console.log(`创建 Cookie 目录: ${COOKIE_DIR}`);
    }
  }

  getCookiePath(userId) {
    return path.join(COOKIE_DIR, `${userId}.json`);
  }

  /**
   * 保存用户 Cookie
   */
  async saveCookies(userId, context) {
    const cookiePath = this.getCookiePath(userId);

    try {
      const storageState = await context.storageState();
      await fs.writeFile(cookiePath, JSON.stringify(storageState, null, 2));
      console.log(`已保存用户 ${userId} 的 Cookie`);
      return true;
    } catch (error) {
      console.error(`保存 Cookie 失败:`, error);
      return false;
    }
  }

  /**
   * 加载用户 Cookie
   */
  async loadCookies(userId) {
    const cookiePath = this.getCookiePath(userId);

    try {
      await fs.access(cookiePath);
      const content = await fs.readFile(cookiePath, 'utf-8');
      console.log(`已加载用户 ${userId} 的 Cookie`);
      return JSON.parse(content);
    } catch (error) {
      console.log(`用户 ${userId} 无已保存的 Cookie`);
      return null;
    }
  }

  /**
   * 检查用户是否有已保存的 Cookie
   */
  async hasCookies(userId) {
    const cookiePath = this.getCookiePath(userId);

    try {
      await fs.access(cookiePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 删除用户 Cookie
   */
  async deleteCookies(userId) {
    const cookiePath = this.getCookiePath(userId);

    try {
      await fs.unlink(cookiePath);
      console.log(`已删除用户 ${userId} 的 Cookie`);
      return true;
    } catch (error) {
      console.error(`删除 Cookie 失败:`, error);
      return false;
    }
  }
}

module.exports = new CookieManager();
