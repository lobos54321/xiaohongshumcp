/**
 * 自动Cookie检测服务
 * 通过检测系统浏览器中的Cookie来自动保存登录状态
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

export interface CookieDetectionResult {
  success: boolean;
  cookies?: any[];
  error?: string;
}

export class AutoCookieDetector {

  /**
   * 检测Safari浏览器中的小红书Cookie
   */
  async detectSafariCookies(): Promise<CookieDetectionResult> {
    try {
      console.log(`[AutoCookieDetector] Trying Safari cookie detection...`);

      // 使用更简单的AppleScript来获取所有窗口的Cookie
      const script = `
        tell application "Safari"
          set cookieString to ""
          try
            repeat with theWindow in windows
              repeat with theTab in tabs of theWindow
                set tabURL to URL of theTab
                if tabURL contains "xiaohongshu.com" then
                  tell theTab
                    set cookieString to do JavaScript "document.cookie"
                  end tell
                  exit repeat
                end if
              end repeat
              if cookieString is not "" then exit repeat
            end repeat
          end try
          return cookieString
        end tell
      `;

      const { stdout, stderr } = await execAsync(`osascript -e '${script}'`);

      if (stderr) {
        console.log(`[AutoCookieDetector] Safari script warning: ${stderr}`);
      }

      const cookieString = stdout.trim();
      console.log(`[AutoCookieDetector] Safari cookie string length: ${cookieString.length}`);

      if (cookieString && cookieString !== '') {
        const cookies = this.parseCookieString(cookieString);
        if (cookies.length > 0) {
          console.log(`[AutoCookieDetector] Found ${cookies.length} cookies in Safari`);
          return {
            success: true,
            cookies: cookies
          };
        }
      }

      return {
        success: false,
        error: 'No cookies found in Safari'
      };
    } catch (error: any) {
      console.log(`[AutoCookieDetector] Safari detection error: ${error.message}`);
      return {
        success: false,
        error: `Safari cookie detection failed: ${error.message}`
      };
    }
  }

  /**
   * 检测Chrome浏览器中的小红书Cookie
   */
  async detectChromeCookies(): Promise<CookieDetectionResult> {
    try {
      console.log(`[AutoCookieDetector] Trying Chrome cookie detection...`);

      const script = `
        tell application "Google Chrome"
          set cookieString to ""
          try
            repeat with theWindow in windows
              repeat with theTab in tabs of theWindow
                set tabURL to URL of theTab
                if tabURL contains "xiaohongshu.com" then
                  tell theTab
                    set cookieString to execute javascript "document.cookie"
                  end tell
                  exit repeat
                end if
              end repeat
              if cookieString is not "" then exit repeat
            end repeat
          end try
          return cookieString
        end tell
      `;

      const { stdout, stderr } = await execAsync(`osascript -e '${script}'`);

      if (stderr) {
        console.log(`[AutoCookieDetector] Chrome script warning: ${stderr}`);
      }

      const cookieString = stdout.trim();
      console.log(`[AutoCookieDetector] Chrome cookie string length: ${cookieString.length}`);

      if (cookieString && cookieString !== '') {
        const cookies = this.parseCookieString(cookieString);
        if (cookies.length > 0) {
          console.log(`[AutoCookieDetector] Found ${cookies.length} cookies in Chrome`);
          return {
            success: true,
            cookies: cookies
          };
        }
      }

      return {
        success: false,
        error: 'No cookies found in Chrome'
      };
    } catch (error: any) {
      console.log(`[AutoCookieDetector] Chrome detection error: ${error.message}`);
      return {
        success: false,
        error: `Chrome cookie detection failed: ${error.message}`
      };
    }
  }

  /**
   * 通过文件系统检测Chrome Cookie数据库
   */
  async detectChromeFileSystemCookies(): Promise<CookieDetectionResult> {
    try {
      console.log(`[AutoCookieDetector] Trying Chrome filesystem cookie detection...`);

      const homeDir = os.homedir();
      const chromeCookiePaths = [
        `${homeDir}/Library/Application Support/Google/Chrome/Default/Cookies`,
        `${homeDir}/Library/Application Support/Google/Chrome/Profile 1/Cookies`,
        `${homeDir}/Library/Application Support/Chromium/Default/Cookies`
      ];

      for (const cookiePath of chromeCookiePaths) {
        if (fs.existsSync(cookiePath)) {
          console.log(`[AutoCookieDetector] Found Chrome cookie database at: ${cookiePath}`);

          // 使用sqlite3来查询Cookie数据库
          try {
            // 修改查询格式，使用CSV分隔符
            const query = `SELECT name, value, host_key, path FROM cookies WHERE host_key LIKE '%xiaohongshu.com%' AND value IS NOT NULL AND length(value) > 0;`;
            const { stdout } = await execAsync(`sqlite3 -csv "${cookiePath}" "${query}"`);

            if (stdout.trim()) {
              const lines = stdout.trim().split('\n');
              const cookies = lines.map(line => {
                // 解析CSV格式的行
                const match = line.match(/^"([^"]+)","([^"]+)","([^"]+)","([^"]+)"$/) ||
                             line.match(/^([^,]+),([^,]+),([^,]+),([^,]+)$/);

                if (match) {
                  const [, name, value, domain, path] = match;
                  return { name, value, domain, path };
                }
                return null;
              }).filter(cookie => cookie && cookie.name && cookie.value);

              if (cookies.length > 0) {
                console.log(`[AutoCookieDetector] Found ${cookies.length} cookies from Chrome database`);
                console.log(`[AutoCookieDetector] Cookie names: ${cookies.map(c => c?.name || 'unknown').join(', ')}`);
                return {
                  success: true,
                  cookies: cookies
                };
              }
            }
          } catch (dbError: any) {
            console.log(`[AutoCookieDetector] Chrome database query failed: ${dbError.message}`);
          }
        }
      }

      return {
        success: false,
        error: 'No cookies found in Chrome filesystem'
      };
    } catch (error: any) {
      console.log(`[AutoCookieDetector] Chrome filesystem detection error: ${error.message}`);
      return {
        success: false,
        error: `Chrome filesystem detection failed: ${error.message}`
      };
    }
  }

  /**
   * 通过文件系统检测Safari Cookie数据库
   */
  async detectSafariFileSystemCookies(): Promise<CookieDetectionResult> {
    try {
      console.log(`[AutoCookieDetector] Trying Safari filesystem cookie detection...`);

      const homeDir = os.homedir();
      const safariCookiePaths = [
        `${homeDir}/Library/Cookies/Cookies.binarycookies`,
        `${homeDir}/Library/HTTPStorages/com.apple.Safari/Cookies.binarycookies`
      ];

      for (const cookiePath of safariCookiePaths) {
        if (fs.existsSync(cookiePath)) {
          console.log(`[AutoCookieDetector] Found Safari cookie file at: ${cookiePath}`);

          // Safari的Cookie文件是二进制格式，需要特殊工具解析
          // 这里我们尝试使用Python脚本或者其他工具
          try {
            // 简单的尝试，实际可能需要专门的工具
            const { stdout } = await execAsync(`file "${cookiePath}"`);
            console.log(`[AutoCookieDetector] Safari cookie file info: ${stdout}`);
          } catch (fileError: any) {
            console.log(`[AutoCookieDetector] Safari file detection failed: ${fileError.message}`);
          }
        }
      }

      return {
        success: false,
        error: 'Safari filesystem cookie parsing not implemented'
      };
    } catch (error: any) {
      console.log(`[AutoCookieDetector] Safari filesystem detection error: ${error.message}`);
      return {
        success: false,
        error: `Safari filesystem detection failed: ${error.message}`
      };
    }
  }

  /**
   * 自动打开小红书页面并等待登录
   */
  async autoOpenAndWaitForLogin(): Promise<CookieDetectionResult> {
    try {
      console.log(`[AutoCookieDetector] Auto-opening xiaohongshu login page...`);

      // 在默认浏览器中打开小红书登录页面
      await execAsync('open "https://www.xiaohongshu.com/login"');

      console.log(`[AutoCookieDetector] Opened login page, waiting for user login...`);

      // 等待用户登录，定期检测Cookie
      for (let i = 0; i < 30; i++) { // 最多等待5分钟
        await new Promise(resolve => setTimeout(resolve, 10000)); // 等待10秒

        console.log(`[AutoCookieDetector] Checking for login... attempt ${i + 1}/30`);

        // 尝试检测Safari
        const safariResult = await this.detectSafariCookies();
        if (safariResult.success) {
          console.log(`[AutoCookieDetector] Login detected in Safari!`);
          return safariResult;
        }

        // 尝试检测Chrome
        const chromeResult = await this.detectChromeCookies();
        if (chromeResult.success) {
          console.log(`[AutoCookieDetector] Login detected in Chrome!`);
          return chromeResult;
        }
      }

      return {
        success: false,
        error: 'Login timeout - no cookies detected after 5 minutes'
      };
    } catch (error: any) {
      console.log(`[AutoCookieDetector] Auto open and wait error: ${error.message}`);
      return {
        success: false,
        error: `Auto login failed: ${error.message}`
      };
    }
  }

  /**
   * 自动检测所有支持的浏览器中的Cookie
   */
  async autoDetectCookies(): Promise<CookieDetectionResult> {
    console.log(`[AutoCookieDetector] Starting comprehensive automatic cookie detection...`);

    // 方法1: 尝试Safari AppleScript
    const safariResult = await this.detectSafariCookies();
    if (safariResult.success) {
      console.log(`[AutoCookieDetector] Found cookies in Safari via AppleScript`);
      return safariResult;
    }

    // 方法2: 尝试Chrome AppleScript
    const chromeResult = await this.detectChromeCookies();
    if (chromeResult.success) {
      console.log(`[AutoCookieDetector] Found cookies in Chrome via AppleScript`);
      return chromeResult;
    }

    // 方法3: 尝试Chrome文件系统
    const chromeFileResult = await this.detectChromeFileSystemCookies();
    if (chromeFileResult.success) {
      console.log(`[AutoCookieDetector] Found cookies in Chrome filesystem`);
      return chromeFileResult;
    }

    // 方法4: 尝试Safari文件系统 (有限支持)
    // const safariFileResult = await this.detectSafariFileSystemCookies();
    // if (safariFileResult.success) {
    //   return safariFileResult;
    // }

    return {
      success: false,
      error: 'No cookies found in any supported browser or method'
    };
  }

  /**
   * 解析Cookie字符串
   */
  private parseCookieString(cookieString: string) {
    return cookieString.split(';').map(cookie => {
      const [name, value] = cookie.trim().split('=');
      return {
        name: name?.trim() || '',
        value: value?.trim() || '',
        domain: '.xiaohongshu.com',
        path: '/'
      };
    }).filter(cookie => cookie.name && cookie.value);
  }

  /**
   * 验证Cookie是否包含必要字段
   */
  validateCookies(cookies: any[]): boolean {
    const requiredCookies = ['a1', 'web_session'];
    const presentCookies = cookies.map(c => c.name);

    return requiredCookies.some(required =>
      presentCookies.includes(required)
    );
  }
}