/**
 * Cookie管理器 - 处理小红书登录状态持久化
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface XHSCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export interface UserCookieData {
  userId: string;
  cookies: XHSCookie[];
  loginTime: number;
  lastUsed: number;
  expires: number;
}

export class CookieManager {
  private cookieDir: string;
  private encryptionKey: string;

  constructor() {
    this.cookieDir = path.join(process.cwd(), 'cookies');
    this.encryptionKey = process.env.COOKIE_ENCRYPTION_KEY || 'default-key-change-in-production';
    this.ensureCookieDir();
  }

  private ensureCookieDir(): void {
    if (!fs.existsSync(this.cookieDir)) {
      fs.mkdirSync(this.cookieDir, { recursive: true });
    }
  }

  private encrypt(text: string): string {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(encryptedText: string): string {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);

    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts.shift()!, 'hex');
    const encrypted = parts.join(':');

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * 保存用户Cookie
   */
  async saveCookies(userId: string, cookies: XHSCookie[]): Promise<void> {
    const now = Date.now();
    const expires = now + (30 * 24 * 60 * 60 * 1000); // 30天过期

    const cookieData: UserCookieData = {
      userId,
      cookies,
      loginTime: now,
      lastUsed: now,
      expires
    };

    const filePath = path.join(this.cookieDir, `${userId}.json`);
    const encryptedData = this.encrypt(JSON.stringify(cookieData));

    await fs.promises.writeFile(filePath, encryptedData, 'utf8');
    console.log(`[Cookie Manager] Saved cookies for user ${userId}`);
  }

  /**
   * 获取用户Cookie
   */
  async getCookies(userId: string): Promise<XHSCookie[] | null> {
    const filePath = path.join(this.cookieDir, `${userId}.json`);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const encryptedData = await fs.promises.readFile(filePath, 'utf8');
      const decryptedData = this.decrypt(encryptedData);
      const cookieData: UserCookieData = JSON.parse(decryptedData);

      // 检查是否过期
      if (Date.now() > cookieData.expires) {
        await this.deleteCookies(userId);
        return null;
      }

      // 更新最后使用时间
      cookieData.lastUsed = Date.now();
      const updatedEncryptedData = this.encrypt(JSON.stringify(cookieData));
      await fs.promises.writeFile(filePath, updatedEncryptedData, 'utf8');

      return cookieData.cookies;
    } catch (error) {
      console.error(`[Cookie Manager] Error reading cookies for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * 检查Cookie是否有效
   */
  async isCookieValid(userId: string): Promise<boolean> {
    const cookies = await this.getCookies(userId);
    return cookies !== null;
  }

  /**
   * 获取Cookie信息
   */
  async getCookieInfo(userId: string): Promise<{
    isValid: boolean;
    loginTime?: number;
    lastUsed?: number;
    expires?: number;
    daysUntilExpiry?: number;
  }> {
    const filePath = path.join(this.cookieDir, `${userId}.json`);

    if (!fs.existsSync(filePath)) {
      return { isValid: false };
    }

    try {
      const encryptedData = await fs.promises.readFile(filePath, 'utf8');
      const decryptedData = this.decrypt(encryptedData);
      const cookieData: UserCookieData = JSON.parse(decryptedData);

      const now = Date.now();
      const isValid = now < cookieData.expires;
      const daysUntilExpiry = Math.ceil((cookieData.expires - now) / (24 * 60 * 60 * 1000));

      return {
        isValid,
        loginTime: cookieData.loginTime,
        lastUsed: cookieData.lastUsed,
        expires: cookieData.expires,
        daysUntilExpiry: Math.max(0, daysUntilExpiry)
      };
    } catch (error) {
      console.error(`[Cookie Manager] Error getting cookie info for user ${userId}:`, error);
      return { isValid: false };
    }
  }

  /**
   * 删除用户Cookie
   */
  async deleteCookies(userId: string): Promise<void> {
    const filePath = path.join(this.cookieDir, `${userId}.json`);

    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      console.log(`[Cookie Manager] Deleted cookies for user ${userId}`);
    }
  }

  /**
   * 清理过期Cookie
   */
  async cleanExpiredCookies(): Promise<void> {
    const files = await fs.promises.readdir(this.cookieDir);
    const now = Date.now();
    let cleanedCount = 0;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const userId = file.replace('.json', '');
      const info = await this.getCookieInfo(userId);

      if (!info.isValid) {
        await this.deleteCookies(userId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`[Cookie Manager] Cleaned ${cleanedCount} expired cookie files`);
    }
  }

  /**
   * 获取所有有效用户
   */
  async getActiveUsers(): Promise<string[]> {
    const files = await fs.promises.readdir(this.cookieDir);
    const activeUsers: string[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const userId = file.replace('.json', '');
      const isValid = await this.isCookieValid(userId);

      if (isValid) {
        activeUsers.push(userId);
      }
    }

    return activeUsers;
  }
}