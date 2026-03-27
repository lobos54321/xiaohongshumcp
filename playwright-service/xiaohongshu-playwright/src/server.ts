/**
 * 小红书 Playwright 服务 HTTP Server
 * 提供 REST API 接口
 */
import express, { Request, Response } from 'express';
import cors from 'cors';
import { XiaohongshuBrowser } from './XiaohongshuBrowser.js';
import { LoginService } from './LoginService.js';
import { PublishService } from './PublishService.js';

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 初始化服务
const browser = new XiaohongshuBrowser({
  headless: process.env.HEADLESS !== 'false', // 默认无头模式
  cookiesDir: process.env.COOKIES_DIR || './data/cookies',
});

const loginService = new LoginService(browser);
const publishService = new PublishService(browser);

// 启动浏览器
await browser.init();

// ============== API Routes ==============

/**
 * 健康检查
 */
app.get('/health', (req: Request, res: Response) => {
  const stats = browser.getStats();
  res.json({
    status: 'ok',
    service: 'xiaohongshu-playwright',
    version: '1.0.0',
    stats,
  });
});

/**
 * 获取登录二维码
 * POST /login/qrcode
 * Body: { userId: string }
 */
app.post('/login/qrcode', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: '缺少 userId 参数' });
    }

    const result = await loginService.getQRCode(userId);

    res.json({
      success: true,
      data: result,
    });

  } catch (error: any) {
    console.error('[API] 获取二维码失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '获取二维码失败',
    });
  }
});

/**
 * 检查登录状态
 * POST /login/check
 * Body: { userId: string }
 */
app.post('/login/check', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: '缺少 userId 参数' });
    }

    const status = await loginService.checkLoginStatus(userId);

    res.json({
      success: true,
      data: status,
    });

  } catch (error: any) {
    console.error('[API] 检查登录状态失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '检查登录状态失败',
    });
  }
});

/**
 * 等待扫码登录
 * POST /login/wait
 * Body: { userId: string, timeout?: number }
 */
app.post('/login/wait', async (req: Request, res: Response) => {
  try {
    const { userId, timeout = 120000 } = req.body;

    if (!userId) {
      return res.status(400).json({ error: '缺少 userId 参数' });
    }

    const status = await loginService.waitForLogin(userId, timeout);

    res.json({
      success: true,
      data: status,
    });

  } catch (error: any) {
    console.error('[API] 等待登录失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '等待登录失败',
    });
  }
});

/**
 * 登出
 * POST /login/logout
 * Body: { userId: string }
 */
app.post('/login/logout', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: '缺少 userId 参数' });
    }

    await loginService.logout(userId);

    res.json({
      success: true,
      message: '登出成功',
    });

  } catch (error: any) {
    console.error('[API] 登出失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '登出失败',
    });
  }
});

/**
 * 发布图文
 * POST /publish/images
 * Body: {
 *   userId: string,
 *   title: string,
 *   content: string,
 *   images: string[],
 *   hashtags?: string[],
 *   location?: string
 * }
 */
app.post('/publish/images', async (req: Request, res: Response) => {
  try {
    const { userId, title, content, images, hashtags, location } = req.body;

    if (!userId || !title || !content || !images || images.length === 0) {
      return res.status(400).json({
        error: '缺少必需参数: userId, title, content, images',
      });
    }

    const result = await publishService.publishImages(userId, {
      title,
      content,
      images,
      hashtags,
      location,
    });

    res.json({
      success: result.success,
      data: result,
    });

  } catch (error: any) {
    console.error('[API] 发布图文失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '发布失败',
    });
  }
});

/**
 * 发布视频
 * POST /publish/video
 * Body: {
 *   userId: string,
 *   title: string,
 *   content: string,
 *   videoPath: string,
 *   coverPath?: string,
 *   hashtags?: string[]
 * }
 */
app.post('/publish/video', async (req: Request, res: Response) => {
  try {
    const { userId, title, content, videoPath, coverPath, hashtags } = req.body;

    if (!userId || !title || !content || !videoPath) {
      return res.status(400).json({
        error: '缺少必需参数: userId, title, content, videoPath',
      });
    }

    const result = await publishService.publishVideo(userId, {
      title,
      content,
      videoPath,
      coverPath,
      hashtags,
    });

    res.json({
      success: result.success,
      data: result,
    });

  } catch (error: any) {
    console.error('[API] 发布视频失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '发布失败',
    });
  }
});

/**
 * 获取统计信息
 * GET /stats
 */
app.get('/stats', (req: Request, res: Response) => {
  const stats = browser.getStats();
  res.json({
    success: true,
    data: stats,
  });
});

// ============== 错误处理 ==============

app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('[Server] 未处理的错误:', err);
  res.status(500).json({
    success: false,
    error: '服务器内部错误',
  });
});

// ============== 启动服务器 ==============

const server = app.listen(PORT, () => {
  console.log(`🚀 小红书 Playwright 服务已启动`);
  console.log(`📡 监听端口: ${PORT}`);
  console.log(`🌐 健康检查: http://localhost:${PORT}/health`);
  console.log(`👤 活跃用户上下文: ${browser.getStats().activeContexts}`);
});

// ============== 优雅关闭 ==============

process.on('SIGTERM', async () => {
  console.log('\n[Server] 收到 SIGTERM 信号，正在关闭服务...');
  server.close(async () => {
    await browser.cleanup();
    console.log('[Server] ✅ 服务已安全关闭');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('\n[Server] 收到 SIGINT 信号，正在关闭服务...');
  server.close(async () => {
    await browser.cleanup();
    console.log('[Server] ✅ 服务已安全关闭');
    process.exit(0);
  });
});
