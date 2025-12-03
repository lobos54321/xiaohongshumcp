/**
 * Claude Agent HTTP Server
 */

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import * as dotenv from 'dotenv';
import path from 'path';
import * as fs from 'fs';
import { spawn, SpawnOptions } from 'child_process';
import { chromium, Browser, BrowserContext, Page, Cookie as PlaywrightCookie } from 'playwright';
import { fileURLToPath } from 'url';
import { ClaudeAgentHTTP, AgentRequest } from './claudeAgentHTTP.js';
import AutoContentManager from './autoContentManager.js';
import ImageGenerationService from './imageGenerationService.js';
import { CookieOrchestrator } from './cookieOrchestrator.js';
import { AutoCookieImporter } from './autoCookieImporter.js';
import type { StandardCookie } from './autoCookieImporter.js';
import { MCPAuthClient } from './mcpAuthClient.js';
import { BrowserSessionManager } from './browserSessionManager.js';
import { initCronJobs, sendTestEmail, triggerAnalysisForUser } from './autoAnalysisEmail.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 端口配置 - 支持Zeabur动态端口分配
const PORT = parseInt(process.env.PORT || '8080');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'demo-key') {
  console.warn('[Startup] ANTHROPIC_API_KEY missing or demo-key. Running in degraded mode: content generation disabled, login/publish via MCP available.');
}

// MCP Router URL配置 - 支持生产环境和本地开发
const MCP_ROUTER_URL = process.env.MCP_ROUTER_URL || 'http://127.0.0.1:3000';

// 创建图片生成服务
const imageService = new ImageGenerationService({
  geminiKey: process.env.GEMINI_API_KEY,
  unsplashKey: process.env.UNSPLASH_ACCESS_KEY,
  // 🔥 FIX: 支持 VITE_SUPABASE_* 环境变量（Zeabur使用的格式）
  supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY
});

// 创建 Claude Agent (HTTP版本)
const agent = new ClaudeAgentHTTP({
  apiKey: ANTHROPIC_API_KEY || '',
  model: process.env.CLAUDE_MODEL,
  maxTokens: parseInt(process.env.MAX_TOKENS || '4096'),
  mcpRouterURL: MCP_ROUTER_URL,
});

// 创建MCP客户端
const mcpAuthClient = new MCPAuthClient(MCP_ROUTER_URL);

// 🔥 Initialize BrowserSessionManager (30min session timeout)
const browserSessionManager = new BrowserSessionManager(30 * 60 * 1000);

// 创建自动内容管理器
const autoContentManager = new AutoContentManager({
  anthropicKey: ANTHROPIC_API_KEY || '',
  imageService: imageService,
  // mcpClient: mcpAuthClient, // Removed MCP client
  browserSessionManager: browserSessionManager,
  xhsWorkerUrl: process.env.XHS_WORKER_URL,
  workerSecret: process.env.WORKER_SECRET
});

// 创建Cookie协调器
const cookieOrchestrator = new CookieOrchestrator(MCP_ROUTER_URL);

// 创建自动Cookie导入器
const autoCookieImporter = new AutoCookieImporter(MCP_ROUTER_URL);

const SHOULD_AUTO_INSTALL_PLAYWRIGHT = process.env.PLAYWRIGHT_AUTO_INSTALL !== 'false';

// 启动自动Cookie导入监控
autoCookieImporter.startAutoImport(15000); // 每15秒检查一次

// 声明变量必须在使用之前
let ensureChromiumPromise: Promise<void> | null = null;

if (SHOULD_AUTO_INSTALL_PLAYWRIGHT) {
  ensurePlaywrightChromiumInstalled()
    .then(() => {
      console.log('[PlaywrightLogin] Chromium executable ready for fallback QR login');
    })
    .catch(error => {
      console.warn('[PlaywrightLogin] Pre-installation of Chromium failed:', error instanceof Error ? error.message : error);
    });
}

function runCommand(command: string, args: string[], options: SpawnOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'pipe',
      env: { ...process.env, ...options.env },
      cwd: options.cwd || process.cwd(),
      shell: options.shell,
    });

    child.stdout?.on('data', data => {
      const output = data.toString().trim();
      if (output) {
        console.log(`[PlaywrightInstall] ${output}`);
      }
    });

    child.stderr?.on('data', data => {
      const output = data.toString().trim();
      if (output) {
        console.warn(`[PlaywrightInstall] ${output}`);
      }
    });

    child.on('error', error => {
      reject(error);
    });

    child.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command ${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}

async function ensurePlaywrightChromiumInstalled(): Promise<void> {
  if (ensureChromiumPromise) {
    return ensureChromiumPromise;
  }

  ensureChromiumPromise = (async () => {
    const executablePath = chromium.executablePath();
    if (executablePath && fs.existsSync(executablePath)) {
      return;
    }

    if (!SHOULD_AUTO_INSTALL_PLAYWRIGHT) {
      throw new Error('Playwright Chromium executable not found and auto-install is disabled.');
    }

    console.warn('[PlaywrightLogin] Chromium executable missing, attempting automatic installation via npx playwright install chromium');

    try {
      await runCommand('npx', ['playwright', 'install', 'chromium']);
    } catch (error) {
      console.error('[PlaywrightLogin] Automatic Playwright installation failed:', error);
      throw error;
    }

    const installedPath = chromium.executablePath();
    if (!installedPath || !fs.existsSync(installedPath)) {
      throw new Error('Playwright Chromium installation did not produce a valid executable path.');
    }
  })();

  try {
    await ensureChromiumPromise;
  } catch (error) {
    ensureChromiumPromise = null;
    throw error;
  }
}

type PersistCookiesFn = (userId: string, cookies: StandardCookie[], source?: string) => Promise<void>;

interface LoginSession {
  userId: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  qrImage: string;
  status: 'pending' | 'success' | 'failed';
  createdAt: number;
  expiresAt: number;
  error?: string;
  userDataDir?: string; // 🔥 NEW: for persistent session tracking
  checkTimer?: NodeJS.Timeout;
  timeoutTimer?: NodeJS.Timeout;
  tempUserDataDir?: string;  // 🔥 新增：存储临时用户数据目录路径
}

class PlaywrightLoginManager {
  private sessions = new Map<string, LoginSession>();
  private timeoutMs: number;
  private readonly persistFn: PersistCookiesFn;
  private readonly browserSessionManager: BrowserSessionManager;

  constructor(persistFn: PersistCookiesFn, browserSessionManager: BrowserSessionManager, timeoutMs = 3 * 60 * 1000) {
    this.persistFn = persistFn;
    this.browserSessionManager = browserSessionManager;
    this.timeoutMs = timeoutMs;
  }

  async startLogin(userId: string): Promise<{ qrImage: string; expiresAt: string }> {
    // 🔥 关键修复：检查全局退出状态，阻止PlaywrightLoginManager创建新会话
    const { globalLogoutState } = await import('./globalLogoutStateManager.js');
    if (!globalLogoutState.canCreateNewLoginSession(userId)) {
      throw new Error('系统刚刚退出登录，请稍等片刻再重新登录');
    }

    // 🔥 修复会话复用问题：强制清理现有会话
    const existing = this.sessions.get(userId);
    if (existing) {
      console.log(`[PlaywrightLogin] 🧹 发现现有会话，强制清理以避免状态污染`);
      await this.disposeSession(userId);
    }

    const session = await this.launchSession(userId);
    this.sessions.set(userId, session);
    this.startWatchers(session);

    return {
      qrImage: session.qrImage,
      expiresAt: new Date(session.expiresAt).toISOString()
    };
  }

  getSessionStatus(userId: string): LoginSession | null {
    return this.sessions.get(userId) || null;
  }

  async shutdown(): Promise<void> {
    const tasks = Array.from(this.sessions.keys()).map(userId => this.disposeSession(userId));
    await Promise.all(tasks);
  }

  /**
   * Force cleanup all sessions - called during logout to prevent session reuse
   */
  async forceCleanupAllSessions(): Promise<void> {
    console.log('[PlaywrightLogin] 🧹 强制清理所有PlaywrightLoginManager会话');
    const tasks = Array.from(this.sessions.keys()).map(userId => this.disposeSession(userId));
    await Promise.all(tasks);
    console.log('[PlaywrightLogin] ✅ 所有会话已清理完成');
  }

  private async launchSession(userId: string): Promise<LoginSession> {
    await ensurePlaywrightChromiumInstalled();

    // 🔥 FIX 1: 启动前清理所有旧的Playwright临时目录
    // 问题：退出登录后，旧的临时目录中的Cookie还在，导致弹出二维码时自动登录
    const tempDirPattern = `/tmp/playwright-${userId}-*`;
    console.log(`[PlaywrightLogin] 🧹 清理旧的临时目录: ${tempDirPattern}`);

    try {
      const { execSync } = await import('child_process');
      execSync(`rm -rf ${tempDirPattern}`, { stdio: 'ignore' });
      console.log(`[PlaywrightLogin] ✅ 旧临时目录已清理`);
    } catch (error) {
      console.warn(`[PlaywrightLogin] 清理旧目录失败:`, error);
    }

    // 创建新的临时目录
    const tempUserDataDir = `/tmp/playwright-${userId}-${Date.now()}`;
    console.log(`[PlaywrightLogin] 创建新的用户数据目录: ${tempUserDataDir}`);

    const context = await chromium.launchPersistentContext(tempUserDataDir, {
      headless: true, // ✅ 使用headless模式以支持无显示环境
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-dev-tools'
      ],
      viewport: { width: 1200, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'zh-CN'
    });

    const browser = context.browser()!;
    const page = await context.newPage();

    await page.goto('https://creator.xiaohongshu.com/login', {
      waitUntil: 'networkidle',
      timeout: 45000
    });

    // 🔥 跳过登录检测以避免在headless模式下阻塞
    // 由于我们已经在启动前清理了所有旧的临时目录，不应该有残留的登录状态
    /* 
    // 🔥 关键功能：检测是否已登录并引导用户退出
    const isLoggedIn = await this.checkIfAlreadyLoggedIn(page);

    if (isLoggedIn) {
      console.log('[PlaywrightLogin] 检测到已登录账号，引导用户手动退出');
      await this.showLogoutGuidance(page);

      const result = await this.waitForUserLogout(page);

      if (result === 'canceled') {
        await context.close();
        throw new Error('用户取消了登录操作');
      }

      console.log('[PlaywrightLogin] 用户已完成退出登录，继续登录流程');
      // 刷新到登录页面
      await page.goto('https://creator.xiaohongshu.com/login', {
        waitUntil: 'networkidle'
      });
    }
    */

    try {
      const scanButton = page.locator('text=扫码登录');
      if (await scanButton.count() > 0) {
        await scanButton.first().click({ timeout: 5000 });
        await page.waitForTimeout(1000);
      }
    } catch (error) {
      console.warn('[PlaywrightLogin] 切换扫码模式失败:', error instanceof Error ? error.message : error);
    }

    const qrImage = await this.captureQRCode(page);
    const now = Date.now();

    return {
      userId,
      browser,
      context,
      page,
      qrImage,
      status: 'pending',
      createdAt: now,
      expiresAt: now + this.timeoutMs,
      tempUserDataDir
    };
  }

  /**
   * 检测是否已经登录
   */
  private async checkIfAlreadyLoggedIn(page: Page): Promise<boolean> {
    try {
      // 🔥 修复：所有浏览器API调用都在page.evaluate()内部
      const isLoggedIn = await page.evaluate(`() => {
        // 检查常见的登录标识
        const loginIndicators = [
          '.user-info',
          '.avatar',
          '.username',
          '[data-testid="user-menu"]',
          '.login-user',
          '.user-avatar',
          '.profile-avatar'
        ];

        for (const selector of loginIndicators) {
          if (document.querySelector(selector)) {
            console.log(\`发现登录标识: \${selector}\`);
            return true;
          }
        }

        // 检查URL是否表示已登录状态
        const url = window.location.href;
        if (url.includes('/user/') || url.includes('/profile/') || url.includes('/home') || url.includes('/explore')) {
          console.log(\`URL表示已登录: \${url}\`);
          return true;
        }

        // 检查页面文本是否包含登录后的内容
        const bodyText = document.body.textContent || '';
        if (bodyText.includes('退出登录') || bodyText.includes('个人主页') || bodyText.includes('我的关注')) {
          console.log('页面内容表示已登录');
          return true;
        }

        return false;
      }`);

      return isLoggedIn as boolean;
    } catch (error) {
      console.warn('[PlaywrightLogin] 检测登录状态失败:', error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * 显示退出登录引导界面
   */
  private async showLogoutGuidance(page: Page): Promise<void> {
    await page.evaluate(`
      // 移除可能存在的旧引导界面
      const existingOverlay = document.getElementById('logout-guidance-overlay');
      if (existingOverlay) {
        existingOverlay.remove();
      }

      // 创建引导遮罩层
      const overlay = document.createElement('div');
      overlay.id = 'logout-guidance-overlay';
      overlay.style.cssText = \`
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      \`;

      // 创建引导内容
      overlay.innerHTML = \`
        <div style="
          background: white;
          padding: 40px;
          border-radius: 16px;
          max-width: 500px;
          text-align: center;
          box-shadow: 0 20px 40px rgba(0,0,0,0.3);
          animation: fadeIn 0.3s ease;
        ">
          <div style="font-size: 48px; margin-bottom: 20px;">🔄</div>
          <h2 style="color: #333; margin-bottom: 15px; font-size: 24px; font-weight: 600;">检测到已登录账号</h2>
          <p style="color: #666; margin-bottom: 30px; line-height: 1.6; font-size: 16px;">
            为了避免账号冲突，请先手动退出当前登录的账号：
          </p>
          <div style="background: #f8f9fa; padding: 20px; border-radius: 12px; margin-bottom: 30px; text-align: left;">
            <div style="margin-bottom: 10px;">
              <span style="display: inline-block; width: 24px; height: 24px; background: #007bff; color: white; border-radius: 50%; text-align: center; line-height: 24px; font-size: 14px; margin-right: 10px;">1</span>
              <span style="color: #333; font-weight: 500;">点击页面右上角的用户头像</span>
            </div>
            <div style="margin-bottom: 10px;">
              <span style="display: inline-block; width: 24px; height: 24px; background: #007bff; color: white; border-radius: 50%; text-align: center; line-height: 24px; font-size: 14px; margin-right: 10px;">2</span>
              <span style="color: #333; font-weight: 500;">在下拉菜单中选择"退出登录"</span>
            </div>
            <div>
              <span style="display: inline-block; width: 24px; height: 24px; background: #007bff; color: white; border-radius: 50%; text-align: center; line-height: 24px; font-size: 14px; margin-right: 10px;">3</span>
              <span style="color: #333; font-weight: 500;">确认退出后点击下方"完成退出"按钮</span>
            </div>
          </div>
          <div style="display: flex; gap: 15px; justify-content: center;">
            <button id="logout-completed-btn" style="
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              border: none;
              padding: 15px 30px;
              border-radius: 8px;
              font-size: 16px;
              font-weight: 500;
              cursor: pointer;
              transition: transform 0.2s ease;
            " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
              ✅ 我已完成退出
            </button>
            <button id="cancel-login-btn" style="
              background: #6c757d;
              color: white;
              border: none;
              padding: 15px 30px;
              border-radius: 8px;
              font-size: 16px;
              font-weight: 500;
              cursor: pointer;
              transition: transform 0.2s ease;
            " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
              ❌ 取消登录
            </button>
          </div>
        </div>
      \`;

      // 添加CSS动画
      const style = document.createElement('style');
      style.textContent = \`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
      \`;
      document.head.appendChild(style);

      document.body.appendChild(overlay);

      // 添加按钮事件
      const logoutBtn = document.getElementById('logout-completed-btn');
      const cancelBtn = document.getElementById('cancel-login-btn');

      if (logoutBtn) {
        logoutBtn.onclick = () => {
          overlay.remove();
          window.logoutCompleted = true;
        };
      }

      if (cancelBtn) {
        cancelBtn.onclick = () => {
          overlay.remove();
          window.loginCanceled = true;
        };
      }
    `);
  }

  /**
   * 等待用户完成退出登录操作
   */
  private async waitForUserLogout(page: Page): Promise<'completed' | 'canceled'> {
    try {
      // 等待用户点击按钮，最多等待5分钟
      await page.waitForFunction(`() => {
        return window.logoutCompleted || window.loginCanceled;
      }`, { timeout: 300000 });

      const completed = await page.evaluate(`() => window.logoutCompleted`);
      const canceled = await page.evaluate(`() => window.loginCanceled`);

      if (canceled) {
        return 'canceled';
      }

      if (completed) {
        // 清除标志
        await page.evaluate(`() => {
          delete window.logoutCompleted;
          delete window.loginCanceled;
        }`);

        // 短暂等待，然后验证是否真的退出了
        await page.waitForTimeout(2000);
        await page.reload();
        await page.waitForTimeout(3000);

        const stillLoggedIn = await this.checkIfAlreadyLoggedIn(page);

        if (stillLoggedIn) {
          console.log('[PlaywrightLogin] 检测到仍未完全退出登录，提示用户重试');
          // 显示重试提示
          await page.evaluate(`
            alert('⚠️ 检测到仍未完全退出登录，请确保完全退出后再试');
          `);

          // 重新显示引导界面
          await this.showLogoutGuidance(page);
          return await this.waitForUserLogout(page); // 递归等待
        }

        console.log('[PlaywrightLogin] ✅ 确认用户已完全退出登录');
        return 'completed';
      }

      return 'canceled';
    } catch (error) {
      console.error('[PlaywrightLogin] 等待用户操作超时或出错:', error instanceof Error ? error.message : error);
      return 'canceled';
    }
  }

  private async captureQRCode(page: Page): Promise<string> {
    try {
      console.log('[PlaywrightLogin] Waiting for QR code to render...');
      await page.waitForTimeout(3000);

      // Strategy 1: Specific selectors (Standard & SVG)
      const selectors = [
        'canvas',
        'svg', // XHS might use SVG
        '.qrcode-img',
        '.login-qrcode',
        'img[src*="qrcode"]',
        'img[src*="qr"]',
        '[class*="qr"][class*="code"]', // Generic class match
        '.login-container .qrcode-img img' // From xpzouying/xiaohongshu-mcp
      ];

      for (const selector of selectors) {
        try {
          const locator = page.locator(selector);
          const count = await locator.count();

          if (count > 0) {
            console.log(`[PlaywrightLogin] Found selector '${selector}', count: ${count}`);
            for (let i = 0; i < count; i++) {
              const element = locator.nth(i);
              const box = await element.boundingBox();
              if (box && box.width >= 100 && box.height >= 100) {
                console.log(`[PlaywrightLogin] Capturing QR from '${selector}' (size: ${box.width}x${box.height})`);
                const buffer = await element.screenshot({ omitBackground: true });
                if (buffer.length > 1000) {
                  return `data:image/png;base64,${buffer.toString('base64')}`;
                }
              }
            }
          }
        } catch (e) {
          console.warn(`[PlaywrightLogin] Error checking selector '${selector}':`, e);
        }
      }

      // Strategy 2: Text Anchor Heuristic (Find "Scan" text and look above it)
      console.log('[PlaywrightLogin] Selectors failed, trying text anchor heuristic...');
      try {
        // Find text containing "扫码" or "微信"
        const textLocator = page.getByText(/扫码|微信|WeChat/i).first();
        if (await textLocator.isVisible()) {
          const textBox = await textLocator.boundingBox();
          if (textBox) {
            console.log(`[PlaywrightLogin] Found anchor text at y=${textBox.y}`);
            // Define a region above the text to look for the QR code
            // Assuming QR code is roughly 200x200 and sits above the text
            const searchRegion = {
              x: Math.max(0, textBox.x + textBox.width / 2 - 150), // Center horizontally
              y: Math.max(0, textBox.y - 300), // Look up to 300px above
              width: 300,
              height: 300
            };

            // Take a screenshot of this region
            console.log(`[PlaywrightLogin] Capturing region above text:`, searchRegion);
            const buffer = await page.screenshot({ clip: searchRegion });
            return `data:image/png;base64,${buffer.toString('base64')}`;
          }
        }
      } catch (e) {
        console.warn('[PlaywrightLogin] Text anchor strategy failed:', e);
      }

      // Strategy 3: Generic Image Search (Filtered)
      console.log('[PlaywrightLogin] Text anchor failed, searching all images...');
      const dataUrl = await page.evaluate(() => {
        const doc = (globalThis as any).document;
        if (!doc) return null;
        const imgs = Array.from(doc.querySelectorAll('img') as any[]);

        const candidates = imgs
          .map((img: any) => {
            const src = (img?.getAttribute ? img.getAttribute('src') : img?.src) || '';
            const width = img.width || img.clientWidth || 0;
            const height = img.height || img.clientHeight || 0;

            if (width < 100 || height < 100) return null;
            if (src.includes('logo') || src.includes('icon')) return null;

            return {
              src,
              width,
              height
            };
          })
          .filter(Boolean)
          .sort((a: any, b: any) => b.width * b.height - a.width * a.height); // Sort by area

        if (candidates.length > 0 && candidates[0]) {
          console.log('[QR Search] Found candidate:', candidates[0]);
          return candidates[0].src;
        }
        return null;
      });

      if (dataUrl && dataUrl.startsWith('data:image')) {
        console.log('[PlaywrightLogin] ✅ Found QR code from generic image search');
        return dataUrl;
      }

      // Strategy 4: Full page screenshot as last resort
      console.warn('[PlaywrightLogin] ⚠️ No QR code found, taking full page screenshot');
      const fallback = await page.screenshot({ fullPage: true });
      return `data:image/png;base64,${fallback.toString('base64')}`;

    } catch (error) {
      console.error('[PlaywrightLogin] Capture failed:', error);
      const fallback = await page.screenshot({ fullPage: true });
      return `data:image/png;base64,${fallback.toString('base64')}`;
    }
  }

  private startWatchers(session: LoginSession) {
    session.checkTimer = setInterval(async () => {
      if (session.status !== 'pending') {
        return;
      }

      try {
        const cookies = await session.context.cookies();
        const standardCookies = this.toStandardCookies(cookies);
        const hasSession = standardCookies.some(cookie => cookie.name === 'web_session' && cookie.value && !cookie.value.includes('Guest'));
        const hasA1 = standardCookies.some(cookie => cookie.name === 'a1' && cookie.value);

        if (hasSession && hasA1) {
          await this.handleSuccess(session, standardCookies);
        }
      } catch (error) {
        console.error('[PlaywrightLogin] 检查登录状态失败:', error instanceof Error ? error.message : error);
      }
    }, 2500);

    session.timeoutTimer = setTimeout(async () => {
      if (session.status === 'pending') {
        session.status = 'failed';
        session.error = '登录超时';
        await this.disposeSession(session.userId);
      }
    }, this.timeoutMs);
  }

  private async handleSuccess(session: LoginSession, cookies: StandardCookie[]): Promise<void> {
    session.status = 'success';
    try {
      await this.persistFn(session.userId, cookies, 'playwright');

      // 🔥 NEW: Register persistent session instead of closing browser
      if (session.context && session.userDataDir) {
        console.log(`[PlaywrightLogin] ✅ Registering persistent session for ${session.userId}`);
        await this.browserSessionManager.registerSession(
          session.userId,
          session.context,
          session.userDataDir
        );
        // Remove from local sessions map but DON'T close the browser
        this.sessions.delete(session.userId);
      } else {
        console.warn(`[PlaywrightLogin] ⚠️ Missing context/userDataDir, falling back to old behavior`);
        await this.disposeSession(session.userId);
      }
    } catch (error) {
      console.error('[PlaywrightLogin] 保存Cookie失败:', error instanceof Error ? error.message : error);
      session.error = error instanceof Error ? error.message : String(error);
      await this.disposeSession(session.userId);
    }
  }

  private toStandardCookies(cookies: PlaywrightCookie[]): StandardCookie[] {
    return cookies
      .filter(cookie => (cookie.domain || '').includes('xiaohongshu.com'))
      .map(cookie => {
        const domain = cookie.domain?.startsWith('.') ? cookie.domain : `.${(cookie.domain || 'xiaohongshu.com').replace(/^\.+/, '')}`;
        let sameSite: 'Lax' | 'Strict' | 'None' = 'Lax';
        if (cookie.sameSite === 'Strict' || cookie.sameSite === 'Lax' || cookie.sameSite === 'None') {
          sameSite = cookie.sameSite;
        }
        return {
          name: cookie.name,
          value: cookie.value,
          domain,
          path: cookie.path || '/',
          secure: cookie.secure ?? true,
          httpOnly: cookie.httpOnly ?? false,
          sameSite
        };
      });
  }

  private async disposeSession(userId: string): Promise<void> {
    const session = this.sessions.get(userId);
    if (!session) {
      return;
    }

    if (session.checkTimer) {
      clearInterval(session.checkTimer);
    }
    if (session.timeoutTimer) {
      clearTimeout(session.timeoutTimer);
    }

    try {
      // 🔥 修复：使用字符串形式避免TypeScript编译时检查浏览器API
      await session.page.evaluate(`
        try {
          // 清除localStorage
          if (typeof localStorage !== 'undefined') {
            localStorage.clear();
          }
          // 清除sessionStorage
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.clear();
          }
          // 清除IndexedDB
          if (typeof indexedDB !== 'undefined' && typeof window !== 'undefined') {
            indexedDB.databases().then(function(databases) {
              databases.forEach(function(db) {
                if (db.name) {
                  indexedDB.deleteDatabase(db.name);
                }
              });
            }).catch(function() {});
          }
        } catch (evalError) {
          console.warn('浏览器存储清理失败:', evalError);
        }
      `);

      // Enhanced cleanup: Clear browser context data
      await session.context.clearCookies();
      await session.context.clearPermissions();

      // Close page first
      await session.page.close({ runBeforeUnload: false });
    } catch (error) {
      console.warn('[PlaywrightLogin] Page cleanup error:', error instanceof Error ? error.message : error);
    }

    try {
      // Close context
      await session.context.close();
    } catch (error) {
      console.warn('[PlaywrightLogin] Context cleanup error:', error instanceof Error ? error.message : error);
    }

    try {
      // Close browser
      await session.browser.close();
    } catch (error) {
      console.warn('[PlaywrightLogin] Browser cleanup error:', error instanceof Error ? error.message : error);
    }

    // 🔥 清理临时用户数据目录
    if (session.tempUserDataDir) {
      try {
        const fs = await import('fs');
        if (fs.existsSync(session.tempUserDataDir)) {
          await fs.promises.rm(session.tempUserDataDir, { recursive: true, force: true });
          console.log(`[PlaywrightLogin] ✅ 已清理临时用户数据目录: ${session.tempUserDataDir}`);
        }
      } catch (cleanupError) {
        console.warn(`[PlaywrightLogin] 清理临时目录失败: ${session.tempUserDataDir}`, cleanupError instanceof Error ? cleanupError.message : cleanupError);
      }
    }

    this.sessions.delete(userId);
    console.log(`[PlaywrightLogin] ✅ Session completely disposed for user ${userId}`);
  }
}

const playwrightLoginManager = new PlaywrightLoginManager(
  async (userId: string, cookies: StandardCookie[], source = 'playwright') => {
    await persistUserCookies(userId, cookies, source);
  },
  browserSessionManager
);

const app = express();
app.use(express.json());

// 配置静态文件服务 - 提供图片访问
app.use('/images', express.static(path.join(process.cwd(), 'downloads', 'images')));

// 🔥 CORS 配置 - 允许 prome.live 访问
app.use((req: Request, res: Response, next: NextFunction) => {
  const allowedOrigins = [
    'https://www.prome.live',
    'https://prome.live',
    'http://localhost:5173',
    'http://localhost:3000'
  ];

  const origin = req.headers.origin;
  console.log(`[CORS] Request from origin: ${origin}, path: ${req.path}`);

  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    console.log(`[CORS] ✅ Allowed origin: ${origin}`);
  } else if (!origin) {
    // 非浏览器请求（如 Postman）
    res.header('Access-Control-Allow-Origin', '*');
    console.log(`[CORS] No origin header, allowing all`);
  } else {
    console.log(`[CORS] ❌ Blocked origin: ${origin}`);
  }

  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.header('Access-Control-Max-Age', '86400'); // 24小时缓存 preflight

  // 处理 OPTIONS 预检请求
  if (req.method === 'OPTIONS') {
    console.log(`[CORS] OPTIONS preflight request for ${req.path}`);
    return res.status(200).end();
  }

  next();
});

// API文档路由
app.get('/api', (_req: Request, res: Response) => {
  res.json({
    name: '小红书智能自动化系统',
    version: '2.0.0',
    description: 'Claude AI驱动的小红书内容创作与发布平台',
    endpoints: {
      health: 'GET /health - 健康检查',
      // 统一状态管理API
      userStatus: 'GET /api/user/status/:userId - 获取用户完整状态',
      userInitialize: 'POST /api/user/initialize - 初始化用户状态',
      // 智能对话和创作API
      chat: 'POST /agent/chat - 智能对话 {userId, prompt, systemPrompt?}',
      createPost: 'POST /agent/xiaohongshu/create-post - 创作发布 {userId, topic, style?, length?}',
      research: 'POST /agent/xiaohongshu/research - 内容研究 {userId, keyword, task?}',
      batchPublish: 'POST /agent/xiaohongshu/batch-publish - 批量发布 {userId, topics[], schedule?}',
      // 自动模式API
      autoStart: 'POST /agent/auto/start - 启动自动运营 {userId, productName, targetAudience, marketingGoal, postFrequency, brandStyle, reviewMode}',
      autoStrategy: 'GET /agent/auto/strategy/:userId - 获取AI策略',
      autoPlan: 'GET /agent/auto/plan/:userId - 获取今日计划',
      autoStats: 'GET /agent/auto/stats/:userId - 获取运营数据',
      autoPause: 'POST /agent/auto/pause/:userId - 暂停自动运营',
      autoResume: 'POST /agent/auto/resume/:userId - 恢复自动运营',
      // 图片生成API
      generateImage: 'POST /agent/image/generate - 生成图片 {prompt, style?, aspectRatio?}',
      // 登录和认证API (已优化)
      xiaohongshuAutoLogin: 'POST /agent/xiaohongshu/auto-login - 智能登录检测 {userId}',
      xiaohongshuLoginStatus: 'GET /agent/xiaohongshu/login/status - 检查登录状态 {userId}',
    },
    documentation: 'https://github.com/lobos54321/xiaohongshumcp',
  });
});

// 提供前端静态文件（放在最后，避免覆盖API路由）
const frontendPath = path.join(__dirname, '../../../frontend');
app.use(express.static(frontendPath));

// 根路径明确指向index.html
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// 健康检查
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'claude-agent-service',
    timestamp: new Date().toISOString(),
  });
});

// ============ 统一状态管理API ============

// 获取用户完整状态 - 核心统一入口
app.get('/api/user/status/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    console.log(`[UserStatus] 获取用户${userId}的完整状态...`);

    // 1. 获取认证状态
    const authStatus = await cookieOrchestrator.getAuthStatus(userId);

    // 2. 检查配置状态
    let configurationStatus = {
      isConfigured: false,
      productName: undefined as string | undefined,
      settings: undefined as any
    };

    try {
      const strategy = autoContentManager.getStrategy(userId);
      if (strategy) {
        configurationStatus.isConfigured = true;
        configurationStatus.productName = '已配置产品'; // TODO: 从策略中提取产品名
      }
    } catch (error) {
      // 配置不存在是正常情况
    }

    // 3. 检查运营状态
    let operationStatus = {
      isRunning: false,
      startTime: undefined as string | undefined,
      stats: undefined as any
    };

    try {
      const stats = autoContentManager.getOperationStats(userId);
      if (stats && stats.postsPublished >= 0) {
        operationStatus.isRunning = true;
        operationStatus.stats = stats;
      }
    } catch (error) {
      // 运营未启动是正常情况
    }

    // 4. 返回统一状态
    const userStatus = {
      authentication: {
        isLoggedIn: authStatus.isAuthenticated,
        cookieSource: authStatus.source,
        lastValidated: authStatus.lastValidated.toISOString(),
        sessionInfo: authStatus.sessionInfo
      },
      configuration: configurationStatus,
      operation: operationStatus,
      // 智能推荐下一步操作
      nextAction: getNextAction(authStatus.isAuthenticated, configurationStatus.isConfigured, operationStatus.isRunning)
    };

    res.json({
      success: true,
      userId,
      status: userStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[UserStatus] 获取用户状态失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get user status'
    });
  }
});

// 用户状态初始化 - 智能引导用户完成设置
app.post('/api/user/initialize', async (req: Request, res: Response) => {
  try {
    const { userId, forceRefresh } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    console.log(`[UserInit] 初始化用户${userId}状态，强制刷新：${forceRefresh || false}`);

    // 使用CookieOrchestrator进行完整的认证流程处理
    const authResult = await cookieOrchestrator.processUserAuthentication(userId);

    res.json({
      success: authResult.success,
      message: authResult.message,
      authStatus: authResult.authStatus,
      actions: authResult.actions,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[UserInit] 用户初始化失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'User initialization failed'
    });
  }
});

// 智能推荐下一步操作的辅助函数
function getNextAction(isAuthenticated: boolean, isConfigured: boolean, isRunning: boolean): {
  action: string;
  description: string;
  endpoint?: string;
} {
  if (!isAuthenticated) {
    return {
      action: 'authenticate',
      description: '需要完成小红书登录认证',
      endpoint: 'POST /api/user/initialize'
    };
  }

  if (!isConfigured) {
    return {
      action: 'configure',
      description: '需要设置产品信息和运营参数',
      endpoint: 'POST /agent/auto/start'
    };
  }

  if (!isRunning) {
    return {
      action: 'start_operation',
      description: '可以启动自动运营模式',
      endpoint: 'POST /agent/auto/start'
    };
  }

  return {
    action: 'monitor',
    description: '系统正在运行，可以查看运营数据',
    endpoint: 'GET /agent/auto/stats/:userId'
  };
}

// 处理智能请求
app.post('/agent/chat', async (req: Request, res: Response) => {
  try {
    const { userId, prompt, systemPrompt } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required',
      });
    }

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'prompt is required',
      });
    }

    console.log(`[Server] Processing chat request for user ${userId}`);

    const agentRequest: AgentRequest = {
      userId,
      prompt,
      systemPrompt,
    };

    const result = await agent.processRequest(agentRequest);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[Server] Error processing request:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 便捷API：生成内容供预览（不发布）
app.post('/agent/xiaohongshu/generate-preview', async (req: Request, res: Response) => {
  try {
    const { userId, topic, style, length } = req.body;

    if (!userId || !topic) {
      return res.status(400).json({
        success: false,
        error: 'userId and topic are required',
      });
    }

    console.log(`[Preview] Generating content for topic: ${topic}`);

    const prompt = `请帮我创作一篇关于"${topic}"的小红书帖子内容。
${style ? `风格要求：${style}` : ''}
${length ? `字数要求：${length}字左右` : ''}

要求：
1. 生成${length || 500}字左右的文案
2. 使用generate_image工具生成3张配图
3. 只返回内容和图片，不要发布

请按以下格式返回JSON：
{
  "title": "标题",
  "content": "正文内容",
  "tags": ["标签1", "标签2"]
}`;

    const result = await agent.processRequest({ userId, prompt });

    // 从工具调用中提取图片信息
    const imageToolCall = result.toolCalls.find((tc: any) => tc.name === 'generate_image');
    const images = imageToolCall ? imageToolCall.result?.images || [] : [];

    res.json({
      success: true,
      data: {
        content: result.content,
        images: images,
        toolCalls: result.toolCalls
      }
    });
  } catch (error: any) {
    console.error('[Server] Error generating preview:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 便捷API：小红书内容创作（直接发布）
app.post('/agent/xiaohongshu/create-post', async (req: Request, res: Response) => {
  try {
    const { userId, topic, style, length } = req.body;

    if (!userId || !topic) {
      return res.status(400).json({
        success: false,
        error: 'userId and topic are required',
      });
    }

    const prompt = `请帮我创作一篇关于"${topic}"的小红书帖子。
${style ? `风格要求：${style}` : ''}
${length ? `字数要求：${length}字左右` : ''}

请直接创作内容并发布到小红书。`;

    const result = await agent.processRequest({ userId, prompt });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[Server] Error creating post:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 便捷API：小红书内容搜索与分析
app.post('/agent/xiaohongshu/research', async (req: Request, res: Response) => {
  try {
    const { userId, keyword, task } = req.body;

    if (!userId || !keyword) {
      return res.status(400).json({
        success: false,
        error: 'userId and keyword are required',
      });
    }

    const prompt = `请帮我搜索小红书上关于"${keyword}"的内容。
${task ? `任务：${task}` : '请分析热门内容的特点和趋势'}`;

    const result = await agent.processRequest({ userId, prompt });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[Server] Error researching:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 便捷API：批量发布任务
app.post('/agent/xiaohongshu/batch-publish', async (req: Request, res: Response) => {
  try {
    const { userId, topics, schedule } = req.body;

    if (!userId || !topics || !Array.isArray(topics)) {
      return res.status(400).json({
        success: false,
        error: 'userId and topics (array) are required',
      });
    }

    const prompt = `请帮我批量创作并发布以下主题的小红书帖子：
${topics.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n')}

${schedule ? `发布计划：${schedule}` : '请立即全部发布'}`;

    const result = await agent.processRequest({ userId, prompt });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[Server] Error batch publishing:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 自动运营模式API
// 启动自动运营
app.post('/agent/auto/start', async (req: Request, res: Response) => {
  try {
    const {
      userId,
      productName,
      targetAudience,
      marketingGoal,
      postFrequency,
      brandStyle,
      reviewMode
    } = req.body;

    if (!userId || !productName) {
      return res.status(400).json({
        success: false,
        error: 'userId and productName are required',
      });
    }

    const userProfile = {
      userId,
      productName,
      targetAudience: targetAudience || '目标用户',
      marketingGoal: marketingGoal || 'brand',
      postFrequency: postFrequency || 'daily',
      brandStyle: brandStyle || 'warm',
      reviewMode: reviewMode || 'auto'
    };

    console.log(`[Auto Mode] Starting auto mode for user ${userId} with product: ${productName}`);

    // 🔥 FIX: 异步启动自动运营，不等待完成（避免超时）
    // 前端通过轮询 /agent/auto/status 获取进度
    autoContentManager.startAutoMode(userProfile)
      .then(() => {
        console.log(`[Auto Mode] ✅ 自动运营完成: ${userId}`);
      })
      .catch((error) => {
        console.error(`[Auto Mode] ❌ 自动运营失败: ${userId}`, error);
      });

    // 立即返回响应，告知前端已开始生成
    res.json({
      success: true,
      message: `自动运营已启动，正在后台为您的${productName}制定运营策略...`,
      data: {
        userId,
        status: 'generating',  // 状态：正在生成中
        startTime: new Date().toISOString(),
        note: '内容生成需要2-5分钟，请通过 GET /agent/auto/status/${userId} 查询进度'
      }
    });
  } catch (error: any) {
    console.error('[Auto Mode] Error starting auto mode:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 获取AI策略
app.get('/agent/auto/strategy/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    console.log(`[API] GET /agent/auto/strategy/${userId} - 开始处理请求`);

    // 从autoContentManager获取真实策略
    const strategy = autoContentManager.getStrategy(userId);
    console.log(`[API] 获取策略结果:`, strategy ? '✅ 找到策略' : '❌ 未找到策略');

    if (!strategy) {
      console.log(`[API] 返回404 - 用户${userId}没有策略`);
      return res.status(404).json({
        success: false,
        error: 'No strategy found for this user. Please start auto mode first.'
      });
    }

    const responseData = {
      success: true,
      strategy: {
        keyThemes: strategy.keyThemes,
        trendingTopics: strategy.trendingTopics,
        optimalTimes: strategy.optimalTimes,
        contentTypes: strategy.contentTypes,
        hashtags: strategy.hashtags
      }
    };
    console.log(`[API] 返回策略数据:`, JSON.stringify(responseData, null, 2));

    res.json(responseData);
  } catch (error: any) {
    console.error('[Auto Mode] Error getting strategy:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 获取实时活动API
app.get('/agent/auto/activity/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // 获取真实的实时活动
    const activities = autoContentManager.getRealTimeActivities(userId);

    res.json({
      success: true,
      activities
    });
  } catch (error: any) {
    console.error('[Auto Mode] Error getting activities:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 获取周计划
app.get('/agent/auto/week-plan/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // 从autoContentManager获取周计划
    const weeklyPlan = autoContentManager.getWeeklyPlan(userId);

    if (!weeklyPlan) {
      return res.status(404).json({
        success: false,
        error: 'No weekly plan found for this user. Please start auto mode first.'
      });
    }

    // 格式化周计划数据
    const formattedPlan = {
      days: weeklyPlan.days.map(day => {
        const dateStr = day.date instanceof Date
          ? day.date.toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];

        return {
          date: dateStr,
          dayOfWeek: day.date instanceof Date
            ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][day.date.getDay()]
            : '周一',
          posts: day.posts.map((post, index) => ({
            id: `${dateStr}-${index}`,
            theme: post.theme,
            type: post.type,
            // 🔥 FIX: 返回完整ISO日期时间
            scheduledTime: post.scheduledTime instanceof Date
              ? post.scheduledTime.toISOString()
              : new Date().toISOString()
          }))
        };
      })
    };

    res.json({
      success: true,
      weeklyPlan: formattedPlan
    });
  } catch (error: any) {
    console.error('[Auto Mode] Error getting weekly plan:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 获取今日计划
app.get('/agent/auto/plan/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // 从autoContentManager获取真实任务
    const dailyTasks = autoContentManager.getDailyTasks(userId);

    if (!dailyTasks || dailyTasks.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No tasks found for this user. Please start auto mode first.'
      });
    }

    // 返回所有任务，保留完整日期时间（ISO格式）
    const today = new Date().toISOString().split('T')[0];
    const todayTasks = dailyTasks.map((task, index) => {
      // 🔥 FIX: 返回完整ISO日期时间而非只有时间
      let scheduledTimeStr = new Date().toISOString(); // 默认值
      try {
        if (task.scheduledTime && typeof task.scheduledTime === 'object' && task.scheduledTime.toISOString) {
          scheduledTimeStr = task.scheduledTime.toISOString();
        } else if (task.scheduledTime && typeof task.scheduledTime === 'string') {
          // 如果是字符串，尝试转换为Date
          const dateObj = new Date(task.scheduledTime);
          if (!isNaN(dateObj.getTime())) {
            scheduledTimeStr = dateObj.toISOString();
          }
        }
      } catch (error) {
        console.warn(`[Plan API] 时间格式处理失败:`, error);
      }

      return {
        id: (index + 1).toString(),
        title: task.title || '默认标题',
        scheduledTime: scheduledTimeStr,
        status: task.status === 'published' ? 'completed' :
          task.status === 'generating' || task.status === 'ready' ? 'in-progress' :
            'pending',
        type: task.contentType || '图文',
        content: task.content || '',
        image_urls: task.imageUrls || [],
        image_prompts: task.imagePrompts || [],
        hashtags: task.hashtags || []  // 🔥 添加标签字段
      };
    });

    const plan = {
      date: today,
      tasks: todayTasks.length > 0 ? todayTasks : [
        {
          id: '1',
          title: '暂无计划任务',
          scheduledTime: '09:00',
          status: 'pending',
          type: '图文'
        }
      ]
    };

    res.json({
      success: true,
      plan
    });
  } catch (error: any) {
    console.error('[Auto Mode] Error getting plan:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 批准发布内容
// 🚀 批准发布 - 异步版本（立即返回 jobId）
app.post('/agent/auto/approve/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { taskId } = req.body;

    console.log(`🚀 [异步发布] 创建发布作业，user ${userId}, task ${taskId}`);

    // 调用新的异步发布方法 - 立即返回 jobId
    const jobId = await autoContentManager.startPublishJob(userId, taskId);

    console.log(`✅ [异步发布] 作业已创建: ${jobId}`);

    // 立即返回 jobId（响应时间 < 1 秒，绕过 Zeabur 120秒限制）
    res.json({
      success: true,
      jobId: jobId,
      status: 'pending',
      message: '发布作业已创建，后台正在执行'
    });
  } catch (error: any) {
    // 🔥 提取完整的错误信息，特别是从MCP服务返回的详细错误
    const errorDetails = {
      message: error.message,
      details: error.details,
      status: error.status,
      originalError: error.originalError,
      stack: error.stack
    };

    console.error('❌ [异步发布] 创建作业失败:', errorDetails);

    // 优先使用详细的错误信息
    const errorMessage = error.error ||           // mcpAuthClient返回的error字段
      error.details?.error ||   // 可能的嵌套错误
      error.message ||          // 标准错误消息
      'Failed to create publish job';

    const statusCode = error.status || 500;

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      details: error.details,
      status: statusCode,
    });
  }
});

// ============ 为浏览器插件提供发布数据（postMessage 方案）============

/**
 * 获取发布数据供浏览器插件使用
 * 前端调用此端点获取完整的发布数据，然后通过 postMessage 发送给插件
 */
app.post('/agent/auto/approve-for-extension/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { taskId } = req.body;

    console.log(`🔌 [插件发布] 获取发布数据，user ${userId}, task ${taskId}`);

    // 获取任务数据
    const dailyTasks = autoContentManager.getDailyTasks(userId);

    if (!dailyTasks || dailyTasks.length === 0) {
      return res.status(404).json({
        success: false,
        error: '没有找到待发布的任务'
      });
    }

    // 找到指定任务 (taskId 从 1 开始)
    const taskIndex = taskId
      ? parseInt(taskId) - 1
      : dailyTasks.findIndex((t: any) => t.status === 'ready');

    if (taskIndex < 0 || taskIndex >= dailyTasks.length) {
      return res.status(404).json({
        success: false,
        error: `找不到任务 ${taskId}`
      });
    }

    const task = dailyTasks[taskIndex];

    // 构建发布数据（插件需要的格式）
    const publishData = {
      taskId: taskId || (taskIndex + 1).toString(),
      title: task.title || '',
      content: task.content || '',
      images: task.imageUrls || (task as any).image_urls || [],
      tags: task.hashtags || (task as any).tags || [],
      video: (task as any).videoUrl || (task as any).video_url || null,
      videos: (task as any).videoUrls || (task as any).video_urls || []
    };

    console.log(`✅ [插件发布] 返回发布数据:`, {
      taskId: publishData.taskId,
      title: publishData.title.substring(0, 30) + '...',
      imageCount: publishData.images.length,
      tagCount: publishData.tags.length
    });

    res.json({
      success: true,
      publishData,
      message: '请在小红书发布页面完成发布'
    });

  } catch (error: any) {
    console.error('❌ [插件发布] 获取数据失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '获取发布数据失败'
    });
  }
});

/**
 * 更新任务状态（插件发布完成后调用）
 */
app.post('/agent/auto/update-task-status/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { taskId, status, message } = req.body;

    console.log(`📝 [任务状态] 更新任务状态: user ${userId}, task ${taskId}, status ${status}`);

    // 验证参数
    if (!taskId || !status) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: taskId, status'
      });
    }

    // 获取任务
    const dailyTasks = autoContentManager.getDailyTasks(userId);

    if (!dailyTasks || dailyTasks.length === 0) {
      return res.status(404).json({
        success: false,
        error: '没有找到任务'
      });
    }

    // 找到并更新任务
    const taskIndex = parseInt(taskId) - 1;
    if (taskIndex < 0 || taskIndex >= dailyTasks.length) {
      return res.status(404).json({
        success: false,
        error: `找不到任务 ${taskId}`
      });
    }

    // 更新任务状态
    const task = dailyTasks[taskIndex];
    task.status = status;

    // 记录活动
    if ((autoContentManager as any).addRealTimeActivity) {
      (autoContentManager as any).addRealTimeActivity(
        userId,
        `📝 任务 "${task.title}" 状态更新为 ${status}${message ? `: ${message}` : ''}`,
        'execution'
      );
    }

    console.log(`✅ [任务状态] 更新成功: task ${taskId} -> ${status}`);

    res.json({
      success: true,
      message: '状态已更新',
      data: {
        taskId,
        newStatus: status,
        taskTitle: task.title
      }
    });

  } catch (error: any) {
    console.error('❌ [任务状态] 更新失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '更新状态失败'
    });
  }
});

// ============ 保存发布结果（feedId 数据追踪）============

/**
 * 保存发布成功后的结果数据
 * 插件发布成功后，前端调用此接口保存 feedId 和其他信息
 */
app.post('/agent/auto/update-publish-result/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { taskId, feedId, xsecToken, publishedUrl, publishedAt, title, content, images, tags } = req.body;

    console.log(`📝 [PUBLISH-RESULT] Saving for user ${userId}, feedId: ${feedId || 'N/A'}`);

    // 更新任务状态
    const dailyTasks = autoContentManager.getDailyTasks(userId);
    if (dailyTasks) {
      const taskIndex = taskId ? parseInt(taskId) - 1 : -1;
      if (taskIndex >= 0 && taskIndex < dailyTasks.length) {
        const task = dailyTasks[taskIndex];
        task.status = 'published';
        (task as any).publishedAt = publishedAt || new Date().toISOString();

        // 保存 feedId 和相关信息（用于后续数据追踪）
        if (feedId) {
          (task as any).feedId = feedId;
          (task as any).xsecToken = xsecToken;
          (task as any).publishedUrl = publishedUrl;

          console.log(`✅ [PUBLISH-RESULT] Task ${taskId} updated with feedId: ${feedId}`);
        } else {
          console.log(`⚠️ [PUBLISH-RESULT] Task ${taskId} updated but no feedId captured`);
        }
      }
    }

    // 记录活动
    if ((autoContentManager as any).addRealTimeActivity) {
      const activityMsg = feedId
        ? `✅ 发布成功: ${title || '内容'} (feedId: ${feedId})`
        : `⚠️ 发布已提交: ${title || '内容'} (未获取feedId)`;

      (autoContentManager as any).addRealTimeActivity(
        userId,
        activityMsg,
        'execution'
      );
    }

    res.json({
      success: true,
      message: feedId ? 'Publish result saved successfully' : 'Publish result saved without feedId',
      data: {
        taskId,
        feedId: feedId || null,
        publishedUrl: publishedUrl || null,
        status: feedId ? 'tracked' : 'untracked'
      }
    });

  } catch (error: any) {
    console.error('❌ [PUBLISH-RESULT] Error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 🚀 查询发布作业状态（轮询用）
app.get('/agent/auto/publish-status/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: '缺少 userId 参数'
      });
    }

    console.log(`📊 [状态查询] 查询作业状态: ${jobId}, user: ${userId}`);

    // 查询作业状态
    const job = autoContentManager.getPublishJobStatus(jobId, userId as string);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: '作业不存在或已过期'
      });
    }

    console.log(`📊 [状态查询] 作业 ${jobId}: ${job.status} (${job.progress}%)`);

    // 返回作业状态
    res.json({
      success: true,
      jobId: job.jobId,
      taskTitle: job.taskTitle,
      status: job.status,
      progress: job.progress,
      startTime: job.startTime,
      endTime: job.endTime,
      error: job.error,
      result: job.result
    });
  } catch (error: any) {
    console.error('❌ [状态查询] 查询失败:', error);

    res.status(error.message.includes('无权访问') ? 403 : 500).json({
      success: false,
      error: error.message
    });
  }
});

// 更新发布时间
app.post('/agent/auto/update-time/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { taskId, newTime } = req.body;

    console.log(`[Auto Mode] Updating time for user ${userId}, task ${taskId}, new time: ${newTime}`);

    // 调用autoContentManager的更新时间方法
    await autoContentManager.updateTaskTime(userId, taskId, newTime);

    res.json({
      success: true,
      message: '发布时间已更新'
    });
  } catch (error: any) {
    console.error('[Auto Mode] Error updating time:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 重新生成内容
// 更新任务内容（编辑）
app.post('/agent/auto/edit/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { taskId, title, content, imagePrompt, hashtags } = req.body;

    console.log(`[Auto Mode] Editing content for user ${userId}, task ${taskId}`);

    // 调用autoContentManager的更新方法
    const updatedTask = await autoContentManager.updateTaskContent(userId, taskId, {
      title,
      content,
      imagePrompt,
      hashtags
    });

    res.json({
      success: true,
      task: updatedTask,
      message: '内容已更新'
    });
  } catch (error: any) {
    console.error('[Auto Mode] Error editing content:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 更新内容策略
app.post('/agent/auto/update-strategy/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const updates = req.body;

    console.log(`[Auto Mode] Updating strategy for user ${userId}`, updates);

    await autoContentManager.updateStrategy(userId, updates);

    res.json({
      success: true,
      message: '策略已更新'
    });
  } catch (error: any) {
    console.error('[Auto Mode] Error updating strategy:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.post('/agent/auto/regenerate/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { taskId } = req.body;

    console.log(`[Auto Mode] Regenerating content for user ${userId}, task ${taskId}`);

    // 调用autoContentManager的重新生成方法
    const newContent = await autoContentManager.regenerateTask(userId, taskId);

    res.json({
      success: true,
      content: newContent,
      message: '内容已重新生成'
    });
  } catch (error: any) {
    console.error('[Auto Mode] Error regenerating content:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 🔥 NEW: 获取自动运营生成状态（用于轮询）
app.get('/agent/auto/status/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // 获取生成状态
    const generationStatus = autoContentManager.getGenerationStatus(userId);

    // 获取实时活动
    const activities = autoContentManager.getRealTimeActivities(userId);

    // 获取最新活动（最近3条）
    const recentActivities = activities.slice(0, 3);

    // 判断是否有内容计划
    const hasPlan = autoContentManager.getDailyTasks(userId).length > 0;

    // 🔥 FIX: 添加明确的is_running状态
    // 判断标准：有任务计划且有pending/in-progress状态的任务
    const dailyTasks = autoContentManager.getDailyTasks(userId);
    const hasActiveTasks = dailyTasks.some(
      (task: any) => task.status === 'pending' || task.status === 'in-progress'
    );
    const isRunning = hasPlan && (hasActiveTasks || generationStatus === 'generating');

    res.json({
      success: true,
      data: {
        userId,
        status: generationStatus,  // 'idle' | 'generating' | 'completed' | 'failed'
        is_running: isRunning,     // 🔥 NEW: 明确的运行状态
        hasPlan,
        recentActivities,
        totalActivities: activities.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('[Auto Mode] Error getting status:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 获取运营数据
app.get('/agent/auto/stats/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // 从autoContentManager获取真实统计数据
    const stats = autoContentManager.getOperationStats(userId);

    res.json({
      success: true,
      stats: {
        todayPosts: stats.postsPublished,
        plannedPosts: autoContentManager.getDailyTasks(userId).length,
        weeklyReads: stats.totalReads > 1000 ? `${(stats.totalReads / 1000).toFixed(1)}k` : stats.totalReads.toString(),
        newFollowers: stats.totalFollowers,
        engagementRate: stats.engagementRate.replace('%', '')
      }
    });
  } catch (error: any) {
    console.error('[Auto Mode] Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 获取待发内容列表
app.get('/agent/auto/pending/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // 从autoContentManager获取待发布内容
    const pendingContent = autoContentManager.getPendingContent(userId);

    res.json({
      success: true,
      content: pendingContent
    });
  } catch (error: any) {
    console.error('[Auto Mode] Error getting pending content:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 暂停自动运营
app.post('/agent/auto/pause/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    console.log(`[Auto Mode] Pausing auto mode for user ${userId}`);

    res.json({
      success: true,
      message: '自动运营已暂停',
      data: {
        userId,
        status: 'paused',
        pausedAt: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('[Auto Mode] Error pausing auto mode:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 恢复自动运营
app.post('/agent/auto/resume/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    console.log(`[Auto Mode] Resuming auto mode for user ${userId}`);

    res.json({
      success: true,
      message: '自动运营已恢复',
      data: {
        userId,
        status: 'running',
        resumedAt: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('[Auto Mode] Error resuming auto mode:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 🔥 清除用户数据（用于重新配置）
app.post('/agent/auto/reset/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    console.log(`[Auto Mode] Resetting user data for ${userId}`);

    // 调用 autoContentManager 的清除方法
    autoContentManager.clearUserData(userId);

    res.json({
      success: true,
      message: '用户数据已清除，可以重新配置',
      data: {
        userId,
        clearedAt: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('[Auto Mode] Error resetting user data:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 图片生成API (单张)
app.post('/agent/image/generate', async (req: Request, res: Response) => {
  try {
    const { prompt, style, aspectRatio, negativePrompt, userId } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'prompt is required',
      });
    }

    console.log(`[Image] Generating image with prompt: ${prompt}`);

    const imageRequest = {
      prompt,
      userId: userId || 'api_user',  // 添加 userId，默认值为 api_user
      style: style || 'realistic',
      aspectRatio: aspectRatio || '1:1',
      negativePrompt
    };

    const result = await imageService.generateImage(imageRequest);

    res.json({
      success: true,
      data: {
        imageUrl: result.url,
        storageKey: result.storageKey,  // 修复：使用 storageKey 而非 localPath
        source: result.source,
        cost: result.cost || 0
      }
    });
  } catch (error: any) {
    console.error('[Image] Error generating image:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 批量图片生成API
app.post('/agent/image/generate-batch', async (req: Request, res: Response) => {
  try {
    const { prompt, style, aspectRatio, count, userId } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'prompt is required',
      });
    }

    const imageCount = Math.min(Math.max(count || 3, 1), 9); // 默认3张，最多9张
    console.log(`[Image] Generating ${imageCount} images with prompt: ${prompt}`);

    // 为每张图片创建略微不同的请求
    const requests = Array.from({ length: imageCount }, (_, i) => ({
      prompt: i === 0 ? prompt : `${prompt}, variation ${i + 1}`,
      userId: userId || 'api_user',  // 添加 userId
      style: style || 'realistic',
      aspectRatio: aspectRatio || '1:1'
    }));

    const results = await imageService.generateBatchImages(requests);

    // 提取图片路径和URL
    const images = results.map(r => ({
      url: r.url,
      storageKey: r.storageKey,  // 修复：使用 storageKey 而非 localPath
      source: r.source
    }));

    const totalCost = results.reduce((sum, r) => sum + (r.cost || 0), 0);

    res.json({
      success: true,
      data: {
        images,
        count: images.length,
        totalCost,
        // 返回存储键数组，供xiaohongshu-mcp使用
        storageKeys: images.map(img => img.storageKey).filter(p => p) as string[],
        urls: images.map(img => img.url)
      }
    });
  } catch (error: any) {
    console.error('[Image] Error generating batch images:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 小红书弹窗扫码自动登录API - 升级版方案一
app.post('/agent/xiaohongshu/auto-login', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required',
      });
    }

    console.log(`[XHS Auto Login] Starting popup QR code login for user ${userId}`);

    // 🔥 关键修复：检查全局退出状态，阻止新登录会话创建
    const { globalLogoutState } = await import('./globalLogoutStateManager.js');
    if (!globalLogoutState.canCreateNewLoginSession(userId)) {
      return res.json({
        success: false,
        error: '系统刚刚退出登录，请稍等片刻再重新登录',
        needWait: true,
        logoutInfo: globalLogoutState.getGlobalLogoutInfo(),
        message: '检测到用户刚刚退出登录，为了确保数据完全清理，请等待片刻再重新登录'
      });
    }

    console.log(`[XHS Auto Login] ✅ 全局状态检查通过，允许创建新登录会话`);

    // 导入Cookie检测服务
    const { AutoCookieDetector } = await import('./autoCookieDetector.js');
    const { CookieManager } = await import('./cookieManager.js');

    const cookieDetector = new AutoCookieDetector();
    const cookieManager = new CookieManager();

    // 首先检查是否已有有效Cookie
    const existingCookies = await cookieManager.getCookies(userId);
    if (existingCookies && existingCookies.length > 0) {
      console.log(`[XHS Auto Login] User ${userId} already has valid cookies`);

      // 验证Cookie是否仍然有效
      try {
        const axios = await import('axios');
        const testResponse = await axios.default.get(
          `${MCP_ROUTER_URL}/api/xiaohongshu/login/status?userId=${userId}`,
          { timeout: 5000 }
        );

        if (testResponse.data && !testResponse.data.error) {
          return res.json({
            success: true,
            message: '已检测到有效登录状态',
            status: 'already_logged_in',
            data: { userId, loginValid: true }
          });
        }
      } catch (testError) {
        console.warn(`[XHS Auto Login] Existing cookies may be invalid:`, testError);
      }
    }

    // 启动弹窗扫码登录流程
    console.log(`[XHS Auto Login] Starting popup QR code login process...`);

    // 步骤1: 调用MCP Router获取QR码
    let playwrightFallbackError: string | null = null;

    try {
      const axios = await import('axios');
      const qrResponse = await axios.default.get(
        `${MCP_ROUTER_URL}/api/xiaohongshu/login/qrcode?userId=${userId}`,
        { timeout: 5000 }
      );

      // 🔧 适配MCP Go响应结构：
      // MCP Go返回被包装为: { success: true, data: { img: "...", timeout: "...", is_logged_in: false }, message: "..." }
      // 所以二维码在 qrResponse.data.data.img
      const qrCodeImage = qrResponse.data?.data?.img || qrResponse.data?.img || qrResponse.data?.qrcode_url;

      if (qrResponse.data && qrCodeImage) {
        console.log(`[XHS Auto Login] QR code generated successfully from MCP Router`);

        // 返回QR码给前端，前端弹窗显示
        return res.json({
          success: true,
          message: '请扫码登录',
          status: 'qr_code_generated',
          data: {
            userId,
            qrcode_url: qrCodeImage,
            instructions: '请使用小红书App扫描二维码完成登录',
            polling_endpoint: `/agent/xiaohongshu/login/status?userId=${userId}`
          }
        });
      }

      console.warn(`[XHS Auto Login] MCP Router returned invalid response:`, qrResponse.data);
    } catch (qrError: any) {
      console.warn(`[XHS Auto Login] QR code generation failed:`, qrError.message);

      try {
        const fallback = await playwrightLoginManager.startLogin(userId);
        if (fallback?.qrImage) {
          console.log('[XHS Auto Login] Playwright fallback QR generated');
          return res.json({
            success: true,
            message: '请扫码登录',
            status: 'qr_code_generated',
            data: {
              userId,
              qrcode_url: fallback.qrImage,
              instructions: '请使用小红书App扫描二维码完成登录',
              polling_endpoint: `/agent/xiaohongshu/login/status?userId=${userId}`,
              source: 'playwright'
            }
          });
        }
      } catch (playwrightError: any) {
        const errorMessage = playwrightError?.message || String(playwrightError || '');
        const normalizedMessage = errorMessage.replace(/\s+/g, ' ').trim();
        playwrightFallbackError = normalizedMessage;
        console.error('[XHS Auto Login] Playwright fallback failed:', normalizedMessage);
      }
    }

    // 步骤2: 如果QR码失败，尝试自动检测浏览器Cookie
    console.log(`[XHS Auto Login] Fallback to browser cookie detection...`);
    const detectionResult = await cookieDetector.autoDetectCookies();

    if (detectionResult.success && detectionResult.cookies) {
      console.log(`[XHS Auto Login] Successfully detected ${detectionResult.cookies.length} cookies`);

      // 验证检测到的Cookie
      const isValid = cookieDetector.validateCookies(detectionResult.cookies);
      if (!isValid) {
        return res.json({
          success: false,
          error: 'Detected cookies are missing required fields (a1, web_session)',
          needManualLogin: true
        });
      }

      // 转换为标准格式
      const standardCookies = detectionResult.cookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain || '.xiaohongshu.com',
        path: cookie.path || '/',
        secure: true,
        httpOnly: false,
        sameSite: 'Lax' as const
      }));

      await persistUserCookies(userId, standardCookies, 'browser-detection');

      res.json({
        success: true,
        message: '自动检测并保存登录状态成功',
        status: 'auto_detected',
        data: {
          userId,
          cookieCount: standardCookies.length,
          source: 'browser_detection',
          encrypted: true,
          imported_to_mcp: true
        }
      });

    } else {
      // 所有方法失败，提供手动登录选项
      console.log(`[XHS Auto Login] All detection methods failed: ${detectionResult.error}`);

      const baseMessage = detectionResult.error || 'All login methods failed';
      const enrichedMessage = playwrightFallbackError
        ? `Playwright fallback error: ${playwrightFallbackError}. 请在服务器上运行 "npx playwright install chromium" 安装浏览器后重试，或设置 PLAYWRIGHT_AUTO_INSTALL=false 禁用自动安装尝试。`
        : baseMessage;

      res.json({
        success: false,
        error: enrichedMessage,
        needManualLogin: true,
        loginInstructions: {
          step1: '在浏览器中访问 https://www.xiaohongshu.com/login',
          step2: '完成登录',
          step3: '再次点击"检测登录状态"',
          autoRetrySeconds: 30
        }
      });
    }

  } catch (error: any) {
    console.error('[XHS Auto Login] Error during popup QR login:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Popup QR login failed',
    });
  }
});

// 🔥 QR Code Generation Endpoint
app.get('/agent/xiaohongshu/login/qr', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    console.log(`[QR Endpoint] Generating QR code for user ${userId}`);

    // 1. Try MCP Router first
    try {
      const axios = await import('axios');
      const qrResponse = await axios.default.get(
        `${MCP_ROUTER_URL}/api/xiaohongshu/login/qrcode?userId=${userId}`,
        { timeout: 45000 }
      );

      const qrCodeImage = qrResponse.data?.data?.img || qrResponse.data?.img || qrResponse.data?.qrcode_url;
      if (qrCodeImage) {
        console.log(`[QR Endpoint] Got QR from MCP Router`);
        return res.json({
          success: true,
          data: { qrcode_url: qrCodeImage }
        });
      }
    } catch (e) {
      console.warn(`[QR Endpoint] MCP Router failed, trying fallback:`, e instanceof Error ? e.message : e);
    }

    // 2. Fallback to Playwright
    try {
      const result = await playwrightLoginManager.startLogin(userId);
      if (result && result.qrImage) {
        console.log(`[QR Endpoint] Got QR from Playwright fallback`);
        return res.json({
          success: true,
          data: { qrcode_url: result.qrImage }
        });
      }
    } catch (e) {
      console.error(`[QR Endpoint] Playwright fallback failed:`, e);
    }

    res.status(500).json({ success: false, error: 'Failed to generate QR code' });

  } catch (error) {
    console.error('[QR Endpoint] Error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// 手动提交Cookie（用于Zeabur等云端环境）
app.post('/agent/xiaohongshu/manual-cookies', async (req: Request, res: Response) => {
  try {
    const { userId, cookies } = req.body as { userId?: string; cookies?: Array<any> };

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'cookies array is required'
      });
    }

    const normalizedCookies = cookies
      .filter(cookie => cookie && typeof cookie.name === 'string' && typeof cookie.value === 'string')
      .map(cookie => {
        const name = cookie.name.trim();
        const value = cookie.value.trim();

        const allowedSameSite: Array<'Lax' | 'Strict' | 'None'> = ['Lax', 'Strict', 'None'];
        const rawSameSite = typeof cookie.sameSite === 'string' ? cookie.sameSite : '';
        const sameSite = allowedSameSite.includes(rawSameSite as 'Lax' | 'Strict' | 'None')
          ? (rawSameSite as 'Lax' | 'Strict' | 'None')
          : 'Lax';

        return {
          name,
          value,
          domain: (cookie.domain && typeof cookie.domain === 'string' && cookie.domain.trim().length > 0)
            ? cookie.domain.trim()
            : '.xiaohongshu.com',
          path: (cookie.path && typeof cookie.path === 'string' && cookie.path.trim().length > 0)
            ? cookie.path.trim()
            : '/',
          secure: cookie.secure !== false,
          httpOnly: typeof cookie.httpOnly === 'boolean' ? cookie.httpOnly : ['web_session', 'a1'].includes(name),
          sameSite
        } as {
          name: string;
          value: string;
          domain: string;
          path: string;
          secure: boolean;
          httpOnly: boolean;
          sameSite: 'Lax' | 'Strict' | 'None';
        };
      })
      .filter(cookie => cookie.name && cookie.value);

    if (normalizedCookies.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid cookies provided'
      });
    }

    const requiredCookies = ['web_session', 'a1'];
    const missingRequired = requiredCookies.filter(required => !normalizedCookies.some(cookie => cookie.name === required));

    if (missingRequired.length > 0) {
      return res.status(400).json({
        success: false,
        error: `缺少必要的Cookie: ${missingRequired.join(', ')}`
      });
    }

    const persistResult = await persistUserCookies(userId, normalizedCookies, 'manual-upload');

    res.json({
      success: true,
      message: 'Cookie已成功保存并同步',
      data: {
        userId,
        cookieCount: normalizedCookies.length,
        mcpSynced: persistResult.mcpSynced
      }
    });
  } catch (error: any) {
    console.error('[XHS Manual Cookie] Error saving cookies:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save cookies'
    });
  }
});

// 辅助方法：导入Cookie到MCP Router的cookies.json
async function importCookiesToMCPRouter(userId: string, cookies: any[]) {
  try {
    const axios = await import('axios');

    // 同步到MCP Router的import-cookies端点
    await axios.default.post(
      `${MCP_ROUTER_URL}/api/xiaohongshu/login/import-cookies`,
      {
        userId: userId,
        cookies: cookies
      },
      { timeout: 10000 }
    );

    console.log(`[XHS Auto Login] Cookies successfully imported to MCP Router cookies.json for user ${userId}`);
    return true;
  } catch (syncError: any) {
    console.error(`[XHS Auto Login] Failed to import cookies to MCP Router:`, syncError.message);
    return false;
  }
}

// 小红书登录状态检查API
app.get('/agent/xiaohongshu/login/status', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required',
      });
    }

    console.log(`[XHS Login] Checking login status for user ${userId}`);

    // 🔥 修复：不再检查退出保护状态
    // 登录状态检查应该只基于 Cookie 文件是否存在
    // 如果 Cookie 被正确删除，自然会返回 logged_in: false
    // 退出保护期只用于阻止"自动Cookie导入"，不应该阻止"登录状态检查"

    try {
      // 先检查本地是否有Cookie文件（表示已经登录过）
      const fs = await import('fs');
      const path = await import('path');

      // Zeabur生产环境优化的Cookie文件路径查找
      const cookieFilePaths = [
        // 当前项目结构路径（Zeabur部署时的主要路径）
        path.join(process.cwd(), '..', 'mcp-router', 'cookies', userId, 'cookies.json'),
        path.join(process.cwd(), '..', 'mcp-router', 'latest.json'),
        // 容器内可能的路径
        path.join('/app', 'mcp-router', 'cookies', userId, 'cookies.json'),
        path.join('/app', 'mcp-router', 'latest.json'),
        // 工作目录相对路径
        path.join(process.cwd(), 'cookies', userId, 'cookies.json'),
        // 本地开发路径
        path.join(process.cwd(), 'playwright-service', 'mcp-router', 'cookies', userId, 'cookies.json'),
        path.join(process.cwd(), 'playwright-service', 'mcp-router', 'latest.json')
      ];

      console.log(`[XHS Login] Current working directory: ${process.cwd()}`);
      console.log(`[XHS Login] Searching for cookies in paths:`, cookieFilePaths);

      let hasValidCookies = false;
      for (const cookieFile of cookieFilePaths) {
        try {
          if (fs.existsSync(cookieFile)) {
            const fileContent = fs.readFileSync(cookieFile, 'utf-8');
            const cookieData = JSON.parse(fileContent);
            // 检查是否有必要的登录Cookie
            const cookies = cookieData.cookies || cookieData;

            if (Array.isArray(cookies)) {
              const hasSessionCookie = cookies.some(c => c.name === 'web_session' && c.value && !c.value.includes('Guest'));
              const hasA1Cookie = cookies.some(c => c.name === 'a1' && c.value);

              if (hasSessionCookie && hasA1Cookie) {
                hasValidCookies = true;
                console.log(`[XHS Login] Found valid cookies in ${cookieFile}`);

                // 🔥 同步Cookie到数据库
                try {
                  const { CookieDatabaseService } = await import('./cookieDatabaseService.js');
                  const dbService = new CookieDatabaseService();
                  await dbService.saveCookies(userId, cookies);
                  console.log(`[XHS Login] ✅ Cookie已同步到数据库`);
                } catch (dbError) {
                  console.error(`[XHS Login] 同步Cookie到数据库失败:`, dbError);
                  // 不影响登录状态检查，继续执行
                }

                break;
              }
            }
          }
        } catch (cookieError) {
          console.warn(`[XHS Login] Error reading cookie file ${cookieFile}:`, cookieError instanceof Error ? cookieError.message : String(cookieError));
        }
      }

      if (hasValidCookies) {
        // 🔥 修复：不再检查退出保护状态
        // 如果找到了有效的Cookie文件，说明用户已登录
        // 如果Cookie被正确删除，这里就不会找到文件
        // 退出保护期只用于阻止"自动Cookie导入"，不应该影响这里的逻辑

        res.json({
          success: true,
          data: {
            logged_in: true,
            message: 'Cookie登录状态检测成功',
            user_id: userId,
            source: 'local_cookies'
          }
        });
        return;
      }

      // 调用 MCP Router 检查登录状态
      const axios = await import('axios');
      const response = await axios.default.get(
        `${MCP_ROUTER_URL}/api/xiaohongshu/login/status?userId=${userId}`,
        { timeout: 5000 }
      );

      res.json({
        success: true,
        data: response.data
      });
    } catch (mcpError: any) {
      console.error(`[XHS Login] MCP Router unavailable (${mcpError.message}), login failed`);

      // MCP Router不可用，返回登录失败状态
      res.status(503).json({
        success: false,
        error: 'Login service unavailable',
        message: 'MCP Router服务不可用，请检查服务状态',
        user_id: userId
      });
    }
  } catch (error: any) {
    console.error('[XHS Login] Error checking login status:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to check login status',
    });
  }
});

// 检查全局退出状态API（供前端调用）
app.get('/agent/xiaohongshu/logout-status', async (req: Request, res: Response) => {
  try {
    const { globalLogoutState } = await import('./globalLogoutStateManager.js');
    const globalInfo = globalLogoutState.getGlobalLogoutInfo();

    res.json({
      success: true,
      data: {
        inGlobalLogoutState: globalInfo.inGlobalCooldown,
        remainingSeconds: globalInfo.remainingSeconds || 0,
        canCreateNewSession: !globalInfo.inGlobalCooldown,
        globalLogoutTime: globalInfo.globalLogoutTime,
        message: globalInfo.inGlobalCooldown
          ? `系统在全局退出保护期内，剩余 ${globalInfo.remainingSeconds} 秒`
          : '系统允许新登录会话'
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get logout status'
    });
  }
});

// 🔥 强制清除Cookie并准备重新登录
// 🔥 Shared Cleanup Function
async function performComprehensiveCleanup(userId: string): Promise<string[]> {
  const cleanedItems: string[] = [];
  console.log(`[Cleanup] 🧹 Starting comprehensive cleanup for user ${userId}`);

  // 1. Stop AutoCookieImporter
  try {
    autoCookieImporter.notifyUserLogout(userId);
    cleanedItems.push('AutoCookieImporter stopped');
  } catch (error) {
    console.warn(`[Cleanup] ⚠️  AutoCookieImporter stop failed:`, error);
  }

  // 2. Activate GlobalLogoutState
  try {
    const { globalLogoutState } = await import('./globalLogoutStateManager.js');
    globalLogoutState.notifyUserLogout(userId);
    cleanedItems.push('GlobalLogoutState activated');
  } catch (error) {
    console.warn(`[Cleanup] ⚠️  GlobalLogoutState activation failed:`, error);
  }

  // 3. Clear CookieManager (Encrypted Storage)
  try {
    const { CookieManager } = await import('./cookieManager.js');
    const cookieManager = new CookieManager();
    await cookieManager.deleteCookies(userId);
    cleanedItems.push('CookieManager storage cleared');
  } catch (error) {
    console.warn(`[Cleanup] ⚠️  CookieManager cleanup failed:`, error);
  }

  // 4. Clear CookieDatabaseService (DB Storage)
  try {
    const { CookieDatabaseService } = await import('./cookieDatabaseService.js');
    const dbService = new CookieDatabaseService();
    await dbService.deleteCookies(userId);
    cleanedItems.push('CookieDatabaseService cleared');
  } catch (error) {
    console.warn(`[Cleanup] ⚠️  CookieDatabaseService cleanup failed:`, error);
  }

  // 5. Force Cleanup PlaywrightLoginManager Sessions
  try {
    await playwrightLoginManager.forceCleanupAllSessions();
    cleanedItems.push('PlaywrightLoginManager sessions cleared');
  } catch (error) {
    console.warn(`[Cleanup] ⚠️  PlaywrightLoginManager cleanup failed:`, error);
  }

  // 6. Close Persistent Browser Session (BrowserSessionManager)
  try {
    await browserSessionManager.closeSession(userId);
    cleanedItems.push('BrowserSessionManager session closed');
  } catch (error) {
    console.warn(`[Cleanup] ⚠️  BrowserSessionManager cleanup failed:`, error);
  }

  // 7. Clear AutoContentManager Data
  try {
    autoContentManager.clearUserData(userId);
    cleanedItems.push('AutoContentManager data cleared');
  } catch (error) {
    console.warn(`[Cleanup] ⚠️  AutoContentManager cleanup failed:`, error);
  }

  // 8. 🔥 CRITICAL: Delete Raw Cookie Files (The "7 Paths")
  try {
    const path = await import('path');
    const fs = await import('fs');
    const { execSync } = await import('child_process');

    // 8a. Playwright Temp Dirs
    const tempDirPattern = `/tmp/playwright-${userId}-*`;
    const loginTempPattern = `/tmp/playwright-login-${userId}-*`;
    try {
      execSync(`rm -rf ${tempDirPattern}`, { stdio: 'ignore' });
      execSync(`rm -rf ${loginTempPattern}`, { stdio: 'ignore' });
      cleanedItems.push('Playwright temp directories');
    } catch (e) { /* ignore */ }

    // 8b. Cookies Directory Files
    const cookiesDir = path.join(process.cwd(), 'cookies');
    if (fs.existsSync(cookiesDir)) {
      const files = fs.readdirSync(cookiesDir);
      for (const file of files) {
        if (file.endsWith('.json') && (file.startsWith(userId) || file.startsWith('auto_'))) {
          const filePath = path.join(cookiesDir, file);
          fs.unlinkSync(filePath);
        }
      }
    }

    // 8c. Critical Paths
    const criticalCookiePaths = [
      path.join(process.cwd(), '..', 'mcp-router', 'cookies', userId, 'cookies.json'),
      path.join(process.cwd(), '..', 'mcp-router', 'latest.json'),
      path.join('/app', 'mcp-router', 'cookies', userId, 'cookies.json'),
      path.join('/app', 'mcp-router', 'latest.json'),
      path.join(process.cwd(), 'cookies', userId, 'cookies.json'),
      path.join(process.cwd(), 'playwright-service', 'mcp-router', 'cookies', userId, 'cookies.json'),
      path.join(process.cwd(), 'playwright-service', 'mcp-router', 'latest.json'),
      '/app/data/cookies.json',
      path.join(process.cwd(), 'data', `${userId}.json`) // User data file
    ];

    let deletedCount = 0;
    for (const cookiePath of criticalCookiePaths) {
      if (fs.existsSync(cookiePath)) {
        try {
          fs.unlinkSync(cookiePath);
          deletedCount++;
        } catch (e) { console.warn(`Failed to delete ${cookiePath}`, e); }
      }
    }
    cleanedItems.push(`Raw cookie files (${deletedCount} deleted)`);

  } catch (error) {
    console.warn(`[Cleanup] ⚠️  File system cleanup failed:`, error);
  }

  console.log(`[Cleanup] ✅ Comprehensive cleanup completed for ${userId}`);
  return cleanedItems;
}

app.post('/agent/xiaohongshu/force-clear-cookies', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });

    console.log(`[Force Clear] 🧹 Processing force clear for ${userId}`);

    // 1. Run local comprehensive cleanup
    const cleanedItems = await performComprehensiveCleanup(userId);

    // 2. Call MCP Router force-cleanup
    try {
      const axios = await import('axios');
      await axios.default.post(
        `${MCP_ROUTER_URL}/api/xiaohongshu/force-cleanup`,
        { userId },
        { timeout: 5000 }
      );
      cleanedItems.push('MCP Router force-cleanup called');
    } catch (error: any) {
      console.warn(`[Force Clear] ⚠️  MCP Router cleanup failed:`, error.message);
    }

    res.json({ success: true, message: 'Force clear completed', data: { cleanedItems } });

  } catch (error: any) {
    console.error('[Force Clear] ❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 小红书登出API
app.post('/agent/xiaohongshu/logout', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });

    console.log(`[Logout] 🚪 Processing logout for ${userId}`);

    // 1. Run local comprehensive cleanup
    const cleanedItems = await performComprehensiveCleanup(userId);

    // 2. Call MCP Router logout
    try {
      const axios = await import('axios');
      await axios.default.post(
        `${MCP_ROUTER_URL}/api/xiaohongshu/logout`,
        { userId },
        { timeout: 5000 }
      );
      cleanedItems.push('MCP Router logout called');
    } catch (error: any) {
      console.warn(`[Logout] ⚠️  MCP Router logout failed:`, error.message);
    }

    res.json({ success: true, message: 'Logout completed', data: { cleanedItems } });

  } catch (error: any) {
    console.error('[Logout] ❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ 前端兼容性 API 端点 ============
// 为前端提供期望的 /api/xiaohongshu/login/* 端点

// 获取登录二维码 (前端兼容性端点)
app.get('/api/xiaohongshu/login/qrcode', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    console.log(`[API Proxy] QR code request for user ${userId} (Unified Logic)`);

    // 1. Try MCP Router first
    try {
      const axios = await import('axios');
      const qrResponse = await axios.default.get(
        `${MCP_ROUTER_URL}/api/xiaohongshu/login/qrcode?userId=${userId}`,
        { timeout: 5000 }
      );

      const qrCodeImage = qrResponse.data?.data?.img || qrResponse.data?.img || qrResponse.data?.qrcode_url;
      if (qrCodeImage) {
        console.log(`[API Proxy] Got QR from MCP Router`);
        return res.json({
          success: true,
          data: {
            img: qrCodeImage,
            has_verification: false
          },
          qrcode_url: qrCodeImage,
          url: qrCodeImage,
          message: '请扫码登录'
        });
      }
    } catch (e) {
      console.warn(`[API Proxy] MCP Router failed, trying fallback:`, e instanceof Error ? e.message : e);
    }

    // 2. Fallback to Playwright
    console.log(`[API Proxy] Falling back to local Playwright...`);
    const result = await playwrightLoginManager.startLogin(userId);

    res.json({
      success: true,
      data: {
        img: result.qrImage,
        has_verification: false,
      },
      qrcode_url: result.qrImage,
      url: result.qrImage,
      expires_at: result.expiresAt,
      message: '请扫码登录'
    });
  } catch (error: any) {
    console.error('[API Proxy] QR code error:', error.message);
    res.status(500).json({
      error: `Login failed: ${error.message}`,
      details: error.stack
    });
  }
});

// 检查登录状态 (前端兼容性端点)
app.get('/api/xiaohongshu/login/status', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    console.log(`[API Proxy] Login status check for user ${userId} (Using Local CookieOrchestrator)`);

    // 🔥 使用本地 CookieOrchestrator，绕过 MCP Router
    const status = await cookieOrchestrator.getAuthStatus(userId);

    res.json({
      success: true,
      data: {
        isLoggedIn: status.isAuthenticated,
        nickname: '未登录用户', // Placeholder as CookieOrchestrator doesn't provide this
        avatar: '', // Placeholder
        source: status.source
      }
    });
  } catch (error: any) {
    console.error('[API Proxy] Login status error:', error.message);
    res.status(500).json({
      error: `Status check failed: ${error.message}`,
      details: error.stack
    });
  }
});

// 获取验证二维码 (预登录人机验证)
app.get('/api/xiaohongshu/login/verification-qrcode', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    console.log(`[API Proxy] Verification QR code request for user ${userId}`);

    // 代理到 MCP Router
    const axios = await import('axios');
    const response = await axios.default.get(
      `${MCP_ROUTER_URL}/api/xiaohongshu/login/verification-qrcode?userId=${userId}`,
      { timeout: 10000 }
    );

    res.json(response.data);
  } catch (error: any) {
    console.error('[API Proxy] Verification QR code error:', error.message);
    res.status(500).json({
      error: `MCP Router connection failed: ${error.message}`,
      mcp_router_url: MCP_ROUTER_URL
    });
  }
});

// Cookie同步API - 从ultra-simple-login同步Cookie到Claude Agent Service
app.post('/agent/xiaohongshu/sync-cookies', async (req: Request, res: Response) => {
  try {
    const { userId, source } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required',
      });
    }

    console.log(`[Cookie Sync] Starting cookie sync for user ${userId} from source: ${source || 'unknown'}`);

    if (source === 'ultra-simple-login') {
      // 从ultra-simple-login的latest.json读取Cookie
      const fs = await import('fs');
      const path = await import('path');

      // 查找ultra-simple-login的Cookie文件 - Zeabur优化版本
      const possiblePaths = [
        // Zeabur生产环境主要路径
        path.join(process.cwd(), '..', 'mcp-router', 'latest.json'),
        path.join('/app', 'mcp-router', 'latest.json'),
        // 本地开发路径
        path.join(process.cwd(), 'playwright-service', 'mcp-router', 'latest.json'),
        path.join(process.cwd(), 'latest.json'),
        // 临时目录
        '/tmp/latest.json',
        // 其他可能的容器路径
        '/workspace/mcp-router/latest.json',
        '/workspace/latest.json'
      ];

      console.log(`[Cookie Sync] Current working directory: ${process.cwd()}`);
      console.log(`[Cookie Sync] Searching for cookie files in:`, possiblePaths);

      let cookieData = null;
      let cookieFilePath = '';

      for (const filePath of possiblePaths) {
        try {
          if (fs.existsSync(filePath)) {
            const fileContent = await fs.promises.readFile(filePath, 'utf-8');
            cookieData = JSON.parse(fileContent);
            cookieFilePath = filePath;
            console.log(`[Cookie Sync] Found cookie file at: ${filePath}`);
            break;
          }
        } catch (readError) {
          console.warn(`[Cookie Sync] Failed to read ${filePath}:`, readError instanceof Error ? readError.message : String(readError));
        }
      }

      if (!cookieData || !cookieData.cookies) {
        return res.status(404).json({
          success: false,
          error: 'No cookies found from ultra-simple-login',
          searchedPaths: possiblePaths
        });
      }

      // 验证是否为真实登录Session（非Guest）
      const sessionCookie = cookieData.cookies.find((c: any) => c.name === 'web_session');
      if (!sessionCookie || sessionCookie.value.includes('Guest')) {
        return res.status(400).json({
          success: false,
          error: 'Only guest session detected, need real login',
          sessionValue: sessionCookie?.value?.substring(0, 20) + '...'
        });
      }

      console.log(`[Cookie Sync] Found ${cookieData.cookies.length} cookies, valid session detected`);

      // 导入Cookie管理器
      const { CookieManager } = await import('./cookieManager.js');
      const cookieManager = new CookieManager();

      // 标准化Cookie格式
      const standardCookies = cookieData.cookies.map((cookie: any) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain || '.xiaohongshu.com',
        path: cookie.path || '/',
        secure: cookie.secure !== false,
        httpOnly: cookie.httpOnly || false,
        sameSite: cookie.sameSite || 'Lax'
      }));

      // 保存到本地加密存储
      await cookieManager.saveCookies(userId, standardCookies);
      console.log(`[Cookie Sync] Saved ${standardCookies.length} cookies to local storage`);

      // 同步到MCP Router
      const syncSuccess = await importCookiesToMCPRouter(userId, standardCookies);

      res.json({
        success: true,
        message: 'Cookie sync completed successfully',
        data: {
          userId,
          cookieCount: standardCookies.length,
          source: 'ultra-simple-login',
          sourceFile: cookieFilePath,
          mcpSyncSuccess: syncSuccess,
          hasValidSession: true
        }
      });

    } else {
      return res.status(400).json({
        success: false,
        error: 'Unsupported cookie source. Currently only supports: ultra-simple-login'
      });
    }

  } catch (error: any) {
    console.error('[Cookie Sync] Error during cookie sync:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Cookie sync failed',
    });
  }
});

// ============ 自动Cookie导入API ============

// 获取自动导入状态
app.get('/agent/auto-import/status', async (req: Request, res: Response) => {
  try {
    const status = autoCookieImporter.getStatus();
    res.json({
      success: true,
      status
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 手动触发Cookie导入
app.post('/agent/auto-import/manual', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    console.log(`[Auto Import] Manual import triggered for userId: ${userId || 'auto'}`);

    // 🔧 FIX: 检查全局退出保护状态
    // 防止退出登录后自动导入Cookie导致重新登录
    const { globalLogoutState } = await import('./globalLogoutStateManager.js');

    // 检查全局退出状态
    if (globalLogoutState.isInGlobalLogoutState()) {
      const globalInfo = globalLogoutState.getGlobalLogoutInfo();
      console.log(`[Auto Import] 🛡️ 阻止手动导入 - 系统在全局退出保护期内，剩余 ${globalInfo.remainingSeconds} 秒`);
      return res.status(403).json({
        success: false,
        error: '系统刚刚退出登录，暂时无法导入Cookie',
        needWait: true,
        logoutInfo: globalInfo,
        message: `系统在全局退出保护期内，剩余 ${globalInfo.remainingSeconds} 秒，请稍后再试`
      });
    }

    // 检查特定用户是否允许保存Cookie
    if (userId && !globalLogoutState.canSaveCookies(userId, 'manual-import')) {
      const userInfo = globalLogoutState.getUserLogoutInfo(userId);
      console.log(`[Auto Import] 🛡️ 阻止手动导入 - 用户 ${userId} 在退出保护期内，剩余 ${userInfo.remainingSeconds} 秒`);
      return res.status(403).json({
        success: false,
        error: `用户 ${userId} 刚刚退出登录，暂时无法导入Cookie`,
        needWait: true,
        userInfo: userInfo,
        message: `用户在退出保护期内，剩余 ${userInfo.remainingSeconds} 秒，请稍后再试`
      });
    }

    console.log(`[Auto Import] ✅ 全局退出保护检查通过，允许导入Cookie`);

    const result = await autoCookieImporter.manualImport(userId);

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        data: {
          userId: result.userId,
          cookieCount: result.cookieCount,
          source: result.source
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
        details: result.error
      });
    }
  } catch (error: any) {
    console.error('[Auto Import] Manual import error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 启动/停止自动导入监控
app.post('/agent/auto-import/toggle', async (req: Request, res: Response) => {
  try {
    const { action, intervalMs } = req.body;

    if (action === 'start') {
      autoCookieImporter.startAutoImport(intervalMs || 15000);
      res.json({
        success: true,
        message: `自动导入监控已启动，监控间隔: ${intervalMs || 15000}ms`
      });
    } else if (action === 'stop') {
      autoCookieImporter.stopAutoImport();
      res.json({
        success: true,
        message: '自动导入监控已停止'
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Invalid action. Use "start" or "stop"'
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 捕获所有未匹配的路由，重定向到根路径（SPA fallback）
app.get('*', (req: Request, res: Response) => {
  console.log(`[Server] Handling request: ${req.method} ${req.path}`);
  console.log(`[Server] Headers:`, req.headers);

  // 如果是API路径，返回404
  if (req.path.startsWith('/api') || req.path.startsWith('/agent')) {
    console.log(`[Server] API path not found: ${req.path}`);
    return res.status(404).json({
      error: 'API endpoint not found',
      path: req.path,
      method: req.method
    });
  }

  // 特殊处理 /v1 路径
  if (req.path === '/v1') {
    console.log(`[Server] Redirecting /v1 to root with 301`);
    return res.redirect(301, '/');
  }

  // 🔍 日志查看代理端点 - 转发到 MCP Router
  if (req.path.startsWith('/api/mcp-logs')) {
    const mcpPath = req.path.replace('/api/mcp-logs', '/api/logs');
    const mcpUrl = `${MCP_ROUTER_URL}${mcpPath}${req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : ''}`;

    (async () => {
      try {
        const { default: axios } = await import('axios');
        const response = await axios.get(mcpUrl, { timeout: 10000 });
        return res.json(response.data);
      } catch (error: any) {
        console.error('[MCP Logs Proxy] Error:', error.message);
        return res.status(error.response?.status || 500).json({
          success: false,
          error: error.message,
          message: 'Failed to fetch logs from MCP Router'
        });
      }
    })();
    return;
  }

  // 其他路径重定向到主页
  console.log(`[Server] Serving index.html for path: ${req.path}`);
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ============ Cookie数据库同步API ============

// 从数据库加载Cookie
app.post('/agent/xiaohongshu/load-cookies-from-db', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required',
      });
    }

    console.log(`[CookieDB API] 加载Cookie: userId=${userId}`);

    const { CookieDatabaseService } = await import('./cookieDatabaseService.js');
    const dbService = new CookieDatabaseService();
    const cookies = await dbService.loadCookies(userId);

    res.json({
      success: true,
      cookies: cookies,
      count: cookies.length
    });
  } catch (error: any) {
    console.error('[CookieDB API] 加载失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to load cookies from database',
    });
  }
});

// 从数据库删除Cookie
app.post('/agent/xiaohongshu/delete-cookies-from-db', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required',
      });
    }

    console.log(`[CookieDB API] 删除Cookie: userId=${userId}`);

    const { CookieDatabaseService } = await import('./cookieDatabaseService.js');
    const dbService = new CookieDatabaseService();
    await dbService.deleteCookies(userId);

    res.json({
      success: true,
      message: 'Cookies deleted from database successfully',
      userId: userId
    });
  } catch (error: any) {
    console.error('[CookieDB API] 删除失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete cookies from database',
    });
  }
});

// ==========================================================================
// AI 分析 API (Phase 3) ====================
// Added by Phase 3 integration

import { createClient } from '@supabase/supabase-js';

// Supabase client for AI analysis (optional - only used if configured)
let supabaseClient: any = null;
try {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '';

  if (supabaseUrl && supabaseKey) {
    supabaseClient = createClient(supabaseUrl, supabaseKey);
    console.log('[AI-ANALYSIS] Supabase client initialized for analytics');
  } else {
    console.warn('[AI-ANALYSIS] Supabase not configured, analysis results will not be saved to database');
  }
} catch (error) {
  console.warn('[AI-ANALYSIS] Failed to initialize Supabase client:', error);
}

interface AnalysisRequest {
  userId: string;
  summary: {
    totalNotes: number;
    totalImpressions: number;
    totalViews: number;
    totalLikes: number;
    totalCollects: number;
    avgClickRate: number;
    avgEngagementRate: number;
  };
  topNotes: Array<{
    title: string;
    publishedAt: string;
    metrics: any | null;
  }>;
}

interface AIAnalysisResult {
  performanceScore: number;
  performanceLevel: 'excellent' | 'good' | 'average' | 'poor';
  insights: string[];
  recommendations: string[];
  contentStrategy: {
    titleSuggestions: string[];
    contentSuggestions: string[];
    publishTimeSuggestions: string[];
  };
}

function performLocalAnalysis(summary: any, topNotes: any[]): AIAnalysisResult {
  const { avgClickRate, avgEngagementRate, totalLikes, totalNotes } = summary;
  let score = 50;
  if (avgClickRate > 5) score += 20;
  else if (avgClickRate > 3) score += 15;
  else if (avgClickRate > 1) score += 10;
  if (avgEngagementRate > 10) score += 20;
  else if (avgEngagementRate > 5) score += 15;
  else if (avgEngagementRate > 2) score += 10;
  score = Math.min(100, Math.max(0, score));
  const level = score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'average' : 'poor';
  return {
    performanceScore: score,
    performanceLevel: level as any,
    insights: [`点击率 ${avgClickRate.toFixed(2)}%`, `互动率 ${avgEngagementRate.toFixed(2)}%`],
    recommendations: ['优化封面', '增加互动引导', '保持发布频率'],
    contentStrategy: {
      titleSuggestions: ['使用数字开头', '使用疑问句'],
      contentSuggestions: ['直接点题', '使用表情符号'],
      publishTimeSuggestions: ['12:00-13:00', '18:00-21:00']
    }
  };
}

app.post('/api/agent/auto/analyze-content-performance', async (req: Request, res: Response) => {
  try {
    const { userId, summary, topNotes } = req.body as AnalysisRequest;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }
    console.log(`[AI-ANALYSIS] Analyzing for user: ${userId}`);
    const aiResult = performLocalAnalysis(summary, topNotes);

    // Save to database if Supabase is configured
    if (supabaseClient) {
      try {
        await supabaseClient.from('xhs_performance_summary').insert({
          user_id: userId,
          performance_score: aiResult.performanceScore,
          performance_level: aiResult.performanceLevel,
          strengths: aiResult.insights.slice(0, 2),
          weaknesses: aiResult.insights.slice(2),
          suggestions: aiResult.recommendations
        });
        console.log('[AI-ANALYSIS] Results saved to database');
      } catch (dbError) {
        console.warn('[AI-ANALYSIS] DB save failed:', dbError);
      }
    } else {
      console.log('[AI-ANALYSIS] Skipping database save (Supabase not configured)');
    }

    res.json({ success: true, data: aiResult });
  } catch (error: any) {
    console.error('[AI-ANALYSIS] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== Auto AI Analysis & Email System ====================

/**
 * Test email endpoint
 * POST /api/admin/test-email
 */
app.post('/api/admin/test-email', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email required' });
    }

    const sent = await sendTestEmail(email);

    if (sent) {
      res.json({ success: true, message: 'Test email sent successfully' });
    } else {
      res.json({ success: false, message: 'Failed to send test email. Check RESEND_API_KEY configuration.' });
    }
  } catch (error: any) {
    console.error('[TEST-EMAIL] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Trigger analysis endpoint
 * POST /api/admin/trigger-analysis
 */
app.post('/api/admin/trigger-analysis', async (req: Request, res: Response) => {
  try {
    const { userId, sendEmail } = req.body;

    if (userId) {
      // Analyze single user
      const analysis = await triggerAnalysisForUser(userId, sendEmail || false);
      res.json({ success: true, analysis, message: `Analysis completed for user ${userId}` });
    } else {
      // Trigger analysis for all users
      res.json({ success: true, message: 'Daily analysis triggered. Check logs for progress.' });
    }
  } catch (error: any) {
    console.error('[TRIGGER-ANALYSIS] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Initialize cron jobs
initCronJobs();

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Claude Agent Service] Server listening on 0.0.0.0:${PORT}`);
  console.log(`[Claude Agent Service] Health check: http://localhost:${PORT}/health`);
  console.log(`[Claude Agent Service] MCP Router URL: ${MCP_ROUTER_URL}`);
});

// 优雅关闭
const shutdown = async () => {
  console.log('[Claude Agent Service] Shutting down...');
  await playwrightLoginManager.shutdown();
  process.exit(0);
};

process.on('SIGINT', () => { shutdown(); });
process.on('SIGTERM', () => { shutdown(); });

async function persistUserCookies(userId: string, cookies: StandardCookie[], source = 'unknown'): Promise<{ mcpSynced: boolean; writtenPaths: string[] }> {
  // 🔥 关键修复：检查全局退出状态
  const { globalLogoutState } = await import('./globalLogoutStateManager.js');

  if (!globalLogoutState.canSaveCookies(userId, source)) {
    console.log(`[Cookie Persist] 🚫 阻止 ${source} 为用户 ${userId} 保存Cookie - 用户在退出保护期内`);
    return { mcpSynced: false, writtenPaths: [] };
  }

  console.log(`[Cookie Persist] ✅ 允许 ${source} 为用户 ${userId} 保存Cookie`);

  const { CookieManager } = await import('./cookieManager.js');
  const cookieManager = new CookieManager();

  // 🔥 关键修复：在直接保存Cookie前再次检查退出状态
  if (globalLogoutState.canSaveCookies(userId, `${source}-direct-save`)) {
    await cookieManager.saveCookies(userId, cookies);
  } else {
    console.log(`[Cookie Persist] 🚫 阻止直接保存Cookie到CookieManager - 用户 ${userId} 在退出保护期内`);
  }

  const cookiePayload = {
    userId,
    source,
    savedAt: new Date().toISOString(),
    cookies
  };

  const pathsToWrite = [
    path.join(process.cwd(), '..', 'mcp-router', 'cookies', userId, 'cookies.json'),
    path.join(process.cwd(), '..', 'mcp-router', 'latest.json'),
    path.join('/app', 'mcp-router', 'cookies', userId, 'cookies.json'),
    path.join('/app', 'mcp-router', 'latest.json'),
    path.join(process.cwd(), 'playwright-service', 'mcp-router', 'cookies', userId, 'cookies.json'),
    path.join(process.cwd(), 'playwright-service', 'mcp-router', 'latest.json')
  ];

  const writtenPaths: string[] = [];

  for (const filePath of pathsToWrite) {
    try {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, JSON.stringify(cookiePayload, null, 2), 'utf8');
      writtenPaths.push(filePath);
    } catch (error: any) {
      console.warn(`[Cookie Persist] Failed to write ${filePath}:`, error.message || error);
    }
  }

  if (writtenPaths.length > 0) {
    console.log(`[Cookie Persist] Saved ${cookies.length} cookies for ${userId} via ${source}. Paths: ${writtenPaths.join(', ')}`);
  } else {
    console.warn(`[Cookie Persist] No cookie files were written for ${userId}; please check filesystem permissions.`);
  }

  let mcpSynced = false;
  try {
    mcpSynced = await importCookiesToMCPRouter(userId, cookies);
  } catch (error: any) {
    console.warn('[Cookie Persist] MCP sync failed:', error.message || error);
  }

  return { mcpSynced, writtenPaths };
}

// ============================================
// MCP 工具测试端点（带速率限制）
// ============================================

// 速率限制器：每个用户每个操作最少间隔2秒
const rateLimiter = new Map<string, number>();

function checkRateLimit(userId: string, operation: string): void {
  const key = `${userId}:${operation}`;
  const now = Date.now();
  const lastCall = rateLimiter.get(key) || 0;

  if (now - lastCall < 2000) { // 2秒限制
    const remaining = Math.ceil((2000 - (now - lastCall)) / 1000);
    throw new Error(`速率限制：请等待 ${remaining} 秒后重试`);
  }

  rateLimiter.set(key, now);
}

// 清理过期的限制记录（每5分钟）
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of rateLimiter.entries()) {
    if (now - timestamp > 300000) { // 5分钟
      rateLimiter.delete(key);
    }
  }
}, 300000);

// 搜索内容
app.post('/agent/xiaohongshu/search', async (req: Request, res: Response) => {
  try {
    const { userId, keyword, sort } = req.body;

    if (!userId || !keyword) {
      return res.status(400).json({ success: false, error: 'userId and keyword are required' });
    }

    // 速率限制检查
    checkRateLimit(userId, 'search');

    console.log(`[XHS Search] userId: ${userId}, keyword: ${keyword}, sort: ${sort || 'general'}`);

    const result = await mcpAuthClient.callMCPTool(userId, 'xiaohongshu_search_feeds', {
      keyword,
      filters: { sort: sort || 'general' }
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[XHS Search] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 列出首页动态
app.post('/agent/xiaohongshu/list-feeds', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    // 速率限制检查
    checkRateLimit(userId, 'list-feeds');

    console.log(`[XHS List Feeds] userId: ${userId}`);

    const result = await mcpAuthClient.callMCPTool(userId, 'xiaohongshu_list_feeds', {});

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[XHS List Feeds] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Logout endpoint
app.post('/agent/xiaohongshu/logout', async (req, res) => {
  const { userId } = req.body;
  console.log(`[Logout API] 📥 Received logout request for user: ${userId}`);

  if (!userId) {
    console.error('[Logout API] ❌ Missing userId in request body');
    res.status(400).json({ success: false, error: 'User ID is required' });
    return;
  }

  try {
    console.log(`[Logout API] 🧹 Calling performComprehensiveCleanup for ${userId}...`);
    const cleanedItems = await performComprehensiveCleanup(userId);
    console.log(`[Logout API] ✅ Cleanup completed. Items cleaned:`, cleanedItems);

    // 🔥 Explicitly close session again to be sure
    console.log(`[Logout API] 🔒 Ensuring browser session is closed...`);
    await browserSessionManager.closeSession(userId);

    res.json({
      success: true,
      message: 'Logged out successfully',
      cleanedItems
    });
    console.log(`[Logout API] 📤 Sent success response`);
  } catch (error) {
    console.error('[Logout API] ❌ Logout failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Logout failed'
    });
  }
});

// 获取用户资料
app.post('/agent/xiaohongshu/user-profile', async (req: Request, res: Response) => {
  try {
    const { userId, targetUserId, xsecToken } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    if (!targetUserId || !xsecToken) {
      return res.status(400).json({ success: false, error: 'targetUserId and xsecToken are required' });
    }

    // 速率限制检查
    checkRateLimit(userId, 'user-profile');

    console.log(`[XHS User Profile] userId: ${userId}, targetUserId: ${targetUserId}`);

    const result = await mcpAuthClient.callMCPTool(userId, 'xiaohongshu_user_profile', {
      user_id: targetUserId,
      xsec_token: xsecToken
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[XHS User Profile] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取当前登录用户的个人资料（用于显示账号绑定信息）
app.get('/agent/xiaohongshu/profile', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    console.log(`[XHS My Profile] Getting profile for user: ${userId}`);

    // 调用MCP Router的GetMyProfile接口
    const axios = await import('axios');
    const response = await axios.default.post(
      `${MCP_ROUTER_URL}/mcp/call`,
      {
        userId: userId,
        toolName: 'xiaohongshu_get_my_profile',
        arguments: {}
      },
      { timeout: 30000 }
    );

    if (response.data?.success && response.data?.data) {
      res.json({ success: true, data: response.data.data });
    } else {
      res.status(500).json({
        success: false,
        error: response.data?.error || 'Failed to get profile'
      });
    }
  } catch (error: any) {
    console.error('[XHS My Profile] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取内容详情
app.post('/agent/xiaohongshu/feed-detail', async (req: Request, res: Response) => {
  try {
    const { userId, feedId, xsecToken } = req.body;

    if (!userId || !feedId) {
      return res.status(400).json({ success: false, error: 'userId and feedId are required' });
    }

    if (!xsecToken) {
      return res.status(400).json({ success: false, error: 'xsecToken is required' });
    }

    // 速率限制检查
    checkRateLimit(userId, 'feed-detail');

    console.log(`[XHS Feed Detail] userId: ${userId}, feedId: ${feedId}`);

    const result = await mcpAuthClient.callMCPTool(userId, 'xiaohongshu_get_feed_detail', {
      feed_id: feedId,
      xsec_token: xsecToken
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[XHS Feed Detail] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 点赞
app.post('/agent/xiaohongshu/like', async (req: Request, res: Response) => {
  try {
    const { userId, feedId, xsecToken } = req.body;

    if (!userId || !feedId) {
      return res.status(400).json({ success: false, error: 'userId and feedId are required' });
    }

    if (!xsecToken) {
      return res.status(400).json({ success: false, error: 'xsecToken is required' });
    }

    // 速率限制检查
    checkRateLimit(userId, 'like');

    console.log(`[XHS Like] userId: ${userId}, feedId: ${feedId}`);

    const result = await mcpAuthClient.callMCPTool(userId, 'xiaohongshu_like_feed', {
      feed_id: feedId,
      xsec_token: xsecToken
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[XHS Like] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 收藏
app.post('/agent/xiaohongshu/favorite', async (req: Request, res: Response) => {
  try {
    const { userId, feedId, xsecToken } = req.body;

    if (!userId || !feedId) {
      return res.status(400).json({ success: false, error: 'userId and feedId are required' });
    }

    if (!xsecToken) {
      return res.status(400).json({ success: false, error: 'xsecToken is required' });
    }

    // 速率限制检查
    checkRateLimit(userId, 'favorite');

    console.log(`[XHS Favorite] userId: ${userId}, feedId: ${feedId}`);

    const result = await mcpAuthClient.callMCPTool(userId, 'xiaohongshu_favorite_feed', {
      feed_id: feedId,
      xsec_token: xsecToken
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[XHS Favorite] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 发表评论
app.post('/agent/xiaohongshu/comment', async (req: Request, res: Response) => {
  try {
    const { userId, feedId, xsecToken, content } = req.body;

    if (!userId || !feedId || !content) {
      return res.status(400).json({ success: false, error: 'userId, feedId and content are required' });
    }

    if (!xsecToken) {
      return res.status(400).json({ success: false, error: 'xsecToken is required' });
    }

    // 速率限制检查
    checkRateLimit(userId, 'comment');

    console.log(`[XHS Comment] userId: ${userId}, feedId: ${feedId}, content: ${content}`);

    const result = await mcpAuthClient.callMCPTool(userId, 'xiaohongshu_post_comment', {
      feed_id: feedId,
      xsec_token: xsecToken,
      content
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[XHS Comment] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 发布视频
app.post('/agent/xiaohongshu/publish-video', async (req: Request, res: Response) => {
  try {
    const { userId, title, content, videoPath, coverPath } = req.body;

    if (!userId || !title || !videoPath) {
      return res.status(400).json({ success: false, error: 'userId, title and videoPath are required' });
    }

    // 速率限制检查
    checkRateLimit(userId, 'publish-video');

    console.log(`[XHS Publish Video] userId: ${userId}, title: ${title}`);

    const result = await mcpAuthClient.callMCPTool(userId, 'xiaohongshu_publish_video', {
      title,
      content,
      video_path: videoPath,
      cover_path: coverPath
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[XHS Publish Video] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
// 重置退出保护（允许立即再次登录）
app.post('/agent/xiaohongshu/reset-logout-protection', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body as { userId?: string };
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }
    const { globalLogoutState } = await import('./globalLogoutStateManager.js');
    globalLogoutState.forceResetUserLogoutState(userId);
    globalLogoutState.forceResetGlobalLogoutState();
    res.json({ success: true, message: 'Logout protection has been reset' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to reset logout protection' });
  }
});
