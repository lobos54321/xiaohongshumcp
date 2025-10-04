require('dotenv').config();
const express = require('express');
const cors = require('cors');
const BrowserPool = require('./browserPool');
const { createWorker, submitPublishTask, getTaskStatus } = require('./queue');
const { previewPublish, confirmPublish, getLoginQRCode, checkLoginStatus } = require('./xiaohongshu');
const cookieManager = require('./cookieManager');

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());

// 全局浏览器池
let browserPool;

// 初始化浏览器池
async function initializeBrowserPool() {
  const maxSize = parseInt(process.env.BROWSER_POOL_SIZE) || 10;
  browserPool = new BrowserPool(maxSize);
  await browserPool.initialize();
  console.log('✅ 浏览器池初始化完成');
}

// 创建 Worker 处理发布任务
function startWorker() {
  const worker = createWorker(browserPool, async (browser, jobData, job) => {
    const { userId, mode, title, content, images, tags } = jobData;

    console.log(`处理任务: userId=${userId}, mode=${mode}`);

    // 加载用户 Cookie
    const storageState = await cookieManager.loadCookies(userId);

    // 创建浏览器上下文
    const context = await browser.newContext({
      storageState: storageState || undefined,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      viewport: { width: 1920, height: 1080 }
    });

    try {
      let result;

      if (mode === 'preview') {
        // 预览模式
        result = await previewPublish(context, userId, { title, content, images, tags }, job);
      } else if (mode === 'publish') {
        // 发布模式
        result = await confirmPublish(context, userId, { title, content, images, tags }, job);
      } else {
        throw new Error(`未知模式: ${mode}`);
      }

      // 保存 Cookie（登录状态）
      await cookieManager.saveCookies(userId, context);

      return result;

    } finally {
      await context.close();
    }
  });

  console.log('✅ Worker 已启动');
  return worker;
}

// ==================== API 端点 ====================

/**
 * POST /api/publish
 * 提交发布任务
 */
app.post('/api/publish', async (req, res) => {
  try {
    const { userId, mode, title, content, images, tags } = req.body;

    // 参数验证
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!mode || !['preview', 'publish'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be "preview" or "publish"' });
    }

    if (!title || !content) {
      return res.status(400).json({ error: 'title and content are required' });
    }

    // 提交任务到队列
    const result = await submitPublishTask(userId, {
      mode,
      title,
      content,
      images: images || [],
      tags: tags || []
    });

    res.json({
      success: true,
      taskId: result.taskId,
      status: result.status
    });

  } catch (error) {
    console.error('提交任务失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/task/:taskId
 * 查询任务状态
 */
app.get('/api/task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;

    const status = await getTaskStatus(taskId);

    res.json(status);

  } catch (error) {
    console.error('查询任务失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/login/qrcode
 * 获取登录二维码
 */
app.post('/api/login/qrcode', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const browser = await browserPool.acquire();

    try {
      const context = await browser.newContext();

      const qrcodeBase64 = await getLoginQRCode(context);

      // 保存临时 Context 用于后续检查登录状态
      // 注意：这里简化处理，生产环境应该用更好的会话管理
      global.loginContexts = global.loginContexts || {};
      global.loginContexts[userId] = context;

      res.json({
        success: true,
        qrcode: qrcodeBase64
      });

    } finally {
      // 不立即释放，等待用户扫码
    }

  } catch (error) {
    console.error('获取二维码失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/login/status
 * 检查登录状态
 */
app.get('/api/login/status', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // 获取临时 Context
    const context = global.loginContexts?.[userId];

    if (!context) {
      return res.json({
        success: false,
        status: 'no_login_session'
      });
    }

    const isLoggedIn = await checkLoginStatus(context);

    if (isLoggedIn) {
      // 保存 Cookie
      await cookieManager.saveCookies(userId, context);

      // 清理临时 Context
      await context.close();
      delete global.loginContexts[userId];

      // 释放浏览器
      const browser = context.browser();
      await browserPool.release(browser);
    }

    res.json({
      success: true,
      status: isLoggedIn ? 'logged_in' : 'waiting'
    });

  } catch (error) {
    console.error('检查登录状态失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/login/:userId
 * 退出登录（删除 Cookie）
 */
app.delete('/api/login/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    await cookieManager.deleteCookies(userId);

    res.json({
      success: true,
      message: 'Cookies deleted'
    });

  } catch (error) {
    console.error('删除 Cookie 失败:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /health
 * 健康检查
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    browserPool: {
      total: browserPool.browsers.length,
      available: browserPool.available.length,
      waiting: browserPool.waiting.length
    }
  });
});

// ==================== 启动服务 ====================

async function start() {
  try {
    // 初始化浏览器池
    await initializeBrowserPool();

    // 启动 Worker
    startWorker();

    // 启动 HTTP 服务器
    app.listen(PORT, () => {
      console.log(`🚀 Playwright 服务已启动: http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error('启动失败:', error);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('收到 SIGTERM 信号，准备关闭...');
  await browserPool.closeAll();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('收到 SIGINT 信号，准备关闭...');
  await browserPool.closeAll();
  process.exit(0);
});

// 启动
start();
