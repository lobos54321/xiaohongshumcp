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

      // 方法1: 尝试AppleScript执行JavaScript (如果用户已启用)
      try {
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
        const cookieString = stdout.trim();

        if (cookieString && cookieString !== '' && !stderr.includes('JavaScript')) {
          const cookies = this.parseCookieString(cookieString);
          if (cookies.length > 0) {
            console.log(`[AutoCookieDetector] Found ${cookies.length} cookies via Chrome AppleScript`);
            return {
              success: true,
              cookies: cookies
            };
          }
        }
      } catch (appleScriptError: any) {
        console.log(`[AutoCookieDetector] Chrome AppleScript failed: ${appleScriptError.message}`);
      }

      // 方法2: 尝试通过Chrome Developer Tools Protocol (CDP)
      console.log(`[AutoCookieDetector] Trying Chrome DevTools Protocol...`);
      try {
        // 检查Chrome是否开启了调试端口
        const { stdout: cdpTest } = await execAsync(`curl -s http://localhost:9222/json/version 2>/dev/null || echo "not available"`);

        if (!cdpTest.includes('not available')) {
          // 获取xiaohongshu.com的标签页
          const { stdout: tabsJson } = await execAsync(`curl -s http://localhost:9222/json/tabs`);
          const tabs = JSON.parse(tabsJson);

          const xiaohongshuTab = tabs.find((tab: any) => tab.url && tab.url.includes('xiaohongshu.com'));

          if (xiaohongshuTab) {
            // 通过CDP获取cookies
            const cookiesCommand = JSON.stringify({
              id: 1,
              method: 'Runtime.evaluate',
              params: { expression: 'document.cookie' }
            });

            const { stdout: cookieResult } = await execAsync(`echo '${cookiesCommand}' | curl -s -X POST -H "Content-Type: application/json" -d @- http://localhost:9222/runtime/evaluate`);
            const result = JSON.parse(cookieResult);

            if (result.result && result.result.value) {
              const cookies = this.parseCookieString(result.result.value);
              if (cookies.length > 0) {
                console.log(`[AutoCookieDetector] Found ${cookies.length} cookies via Chrome CDP`);
                return {
                  success: true,
                  cookies: cookies
                };
              }
            }
          }
        }
      } catch (cdpError: any) {
        console.log(`[AutoCookieDetector] Chrome CDP failed: ${cdpError.message}`);
      }

      // 方法3: 提示用户启用JavaScript执行或开启调试模式
      return {
        success: false,
        error: 'Chrome cookie access requires enabling JavaScript execution in AppleScript or starting Chrome with --remote-debugging-port=9222'
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

          try {
            // 方法1: 尝试直接查询 (可能因数据库锁定而失败)
            const query = `SELECT name, value, host_key, path FROM cookies WHERE host_key LIKE '%xiaohongshu.com%' AND value IS NOT NULL AND length(value) > 0;`;
            try {
              const { stdout } = await execAsync(`sqlite3 -csv "${cookiePath}" "${query}"`, { timeout: 3000 });

              if (stdout.trim()) {
                const cookies = this.parseSQLiteCookieOutput(stdout);
                if (cookies.length > 0) {
                  console.log(`[AutoCookieDetector] Found ${cookies.length} cookies from Chrome database (direct)`);
                  return {
                    success: true,
                    cookies: cookies
                  };
                }
              }
            } catch (directError: any) {
              console.log(`[AutoCookieDetector] Direct database access failed (likely locked): ${directError.message}`);
            }

            // 方法2: 创建临时副本并查询 (绕过数据库锁定)
            console.log(`[AutoCookieDetector] Trying temporary copy method...`);
            const tempCookiePath = `/tmp/chrome_cookies_${Date.now()}.db`;

            try {
              // 复制数据库到临时位置
              await execAsync(`cp "${cookiePath}" "${tempCookiePath}"`);

              // 查询临时数据库
              const { stdout } = await execAsync(`sqlite3 -csv "${tempCookiePath}" "${query}"`);

              // 清理临时文件
              await execAsync(`rm -f "${tempCookiePath}"`);

              if (stdout.trim()) {
                const cookies = this.parseSQLiteCookieOutput(stdout);
                if (cookies.length > 0) {
                  console.log(`[AutoCookieDetector] Found ${cookies.length} cookies from Chrome database (copy)`);
                  return {
                    success: true,
                    cookies: cookies
                  };
                }
              }
            } catch (copyError: any) {
              console.log(`[AutoCookieDetector] Copy method failed: ${copyError.message}`);
              // 确保清理临时文件
              try {
                await execAsync(`rm -f "${tempCookiePath}"`);
              } catch {}
            }

          } catch (dbError: any) {
            console.log(`[AutoCookieDetector] Chrome database query failed: ${dbError.message}`);
          }
        }
      }

      return {
        success: false,
        error: 'No cookies found in Chrome filesystem or database is locked'
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
   * 解析SQLite CSV输出为Cookie对象
   */
  private parseSQLiteCookieOutput(csvOutput: string): any[] {
    const lines = csvOutput.trim().split('\n');
    return lines.map(line => {
      // 解析CSV格式的行
      const match = line.match(/^"([^"]+)","([^"]+)","([^"]+)","([^"]+)"$/) ||
                   line.match(/^([^,]+),([^,]+),([^,]+),([^,]+)$/);

      if (match) {
        const [, name, value, domain, path] = match;
        return {
          name: name?.replace(/"/g, '') || '',
          value: value?.replace(/"/g, '') || '',
          domain: domain?.replace(/"/g, '') || '.xiaohongshu.com',
          path: path?.replace(/"/g, '') || '/'
        };
      }
      return null;
    }).filter(cookie => cookie && cookie.name && cookie.value);
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
   * 手动Cookie导入方法 - 提示用户手动复制粘贴Cookie
   */
  async manualCookieImport(): Promise<CookieDetectionResult> {
    try {
      console.log(`[AutoCookieDetector] Starting manual cookie import process...`);

      // 生成临时Cookie导入文件
      const tempImportFile = '/tmp/xiaohongshu_manual_cookies.txt';
      const instructionText = `
=== 小红书Cookie手动导入 ===

请按照以下步骤手动导入Cookie：

1. 在Chrome中打开 https://www.xiaohongshu.com 并确保已登录
2. 按F12打开开发者工具
3. 切换到Console(控制台)标签
4. 复制以下代码并粘贴到控制台，然后按回车：

document.cookie

5. 复制输出的Cookie字符串
6. 将Cookie字符串保存到文件： ${tempImportFile}

然后重新运行检测程序。

=== 自动检测说明 ===
如需启用自动检测，请选择以下任一方法：

方法A - 启用Chrome JavaScript执行：
1. 打开Chrome菜单栏
2. 查看 → 开发者 → 允许Apple事件中的JavaScript

方法B - 启用Chrome调试模式：
1. 完全关闭Chrome
2. 在终端运行：
   /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222
3. 重新打开xiaohongshu.com网站

=====================================
      `;

      console.log(instructionText);

      // 检查是否有手动导入的Cookie文件
      if (fs.existsSync(tempImportFile)) {
        try {
          const cookieContent = fs.readFileSync(tempImportFile, 'utf-8').trim();

          if (cookieContent && cookieContent.length > 10) {
            const cookies = this.parseCookieString(cookieContent);

            if (cookies.length > 0) {
              console.log(`[AutoCookieDetector] Found ${cookies.length} cookies from manual import`);

              // 验证Cookie包含必要字段
              if (this.validateCookies(cookies)) {
                // 清理临时文件
                fs.unlinkSync(tempImportFile);

                return {
                  success: true,
                  cookies: cookies
                };
              } else {
                return {
                  success: false,
                  error: 'Manual cookies missing required fields (a1, web_session)'
                };
              }
            }
          }
        } catch (readError: any) {
          console.log(`[AutoCookieDetector] Failed to read manual cookie file: ${readError.message}`);
        }
      }

      return {
        success: false,
        error: `Manual cookie import required. Please follow the instructions above and save cookies to: ${tempImportFile}`
      };
    } catch (error: any) {
      console.log(`[AutoCookieDetector] Manual import error: ${error.message}`);
      return {
        success: false,
        error: `Manual cookie import failed: ${error.message}`
      };
    }
  }
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
    console.log(`[AutoCookieDetector] Trying Safari AppleScript...`);
    const safariResult = await this.detectSafariCookies();
    if (safariResult.success) {
      console.log(`[AutoCookieDetector] ✅ Found cookies in Safari via AppleScript`);
      return safariResult;
    }

    // 方法2: 尝试Chrome AppleScript和CDP
    console.log(`[AutoCookieDetector] Trying Chrome AppleScript and CDP...`);
    const chromeResult = await this.detectChromeCookies();
    if (chromeResult.success) {
      console.log(`[AutoCookieDetector] ✅ Found cookies in Chrome via AppleScript/CDP`);
      return chromeResult;
    }

    // 方法3: 尝试Chrome文件系统
    console.log(`[AutoCookieDetector] Trying Chrome filesystem...`);
    const chromeFileResult = await this.detectChromeFileSystemCookies();
    if (chromeFileResult.success) {
      console.log(`[AutoCookieDetector] ✅ Found cookies in Chrome filesystem`);
      return chromeFileResult;
    }

    // 方法4: 检查手动Cookie导入
    console.log(`[AutoCookieDetector] Checking manual cookie import...`);
    const manualResult = await this.manualCookieImport();
    if (manualResult.success) {
      console.log(`[AutoCookieDetector] ✅ Found cookies via manual import`);
      return manualResult;
    }

    // 所有自动方法失败，返回详细的错误信息和指导
    const allErrors = [
      `Safari: ${safariResult.error}`,
      `Chrome: ${chromeResult.error}`,
      `Chrome DB: ${chromeFileResult.error}`,
      `Manual: ${manualResult.error}`
    ];

    console.log(`[AutoCookieDetector] ❌ All detection methods failed`);

    return {
      success: false,
      error: `Cookie detection failed. Tried multiple methods:\n${allErrors.join('\n')}\n\nPlease try one of the following solutions:\n1. Enable Chrome JavaScript execution in AppleScript\n2. Start Chrome with debugging port: --remote-debugging-port=9222\n3. Use manual cookie import method\n4. Ensure you're logged into xiaohongshu.com in your browser`
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