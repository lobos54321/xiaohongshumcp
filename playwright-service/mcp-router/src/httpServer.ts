/**
 * MCP Router HTTP Server
 * 提供HTTP API包装，方便Go后端调用
 */

import express from 'express';
import { XiaohongshuMCPProcessManager } from './processManager.js';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MCP_BINARY = process.env.MCP_BINARY_PATH || './xiaohongshu-mcp';
const COOKIE_DIR = process.env.COOKIE_DIR || './cookies';
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3000');

// 创建进程管理器
const processManager = new XiaohongshuMCPProcessManager(MCP_BINARY, COOKIE_DIR);

// 创建 Express 应用
const app = express();
app.use(express.json());

// 静态文件服务 - 指向前端目录
const frontendPath = path.resolve(__dirname, '../../../frontend');
app.use('/', express.static(frontendPath));

// 根路径处理 - 返回主页
app.get('/', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// 健康检查
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'xiaohongshu-mcp-router',
    timestamp: new Date().toISOString(),
  });
});

// 统计信息
app.get('/stats', (_req, res) => {
  const stats = processManager.getStats();
  res.json(stats);
});

// 调用MCP工具（通用接口）
app.post('/mcp/call', async (req, res) => {
  try {
    const { userId, toolName, arguments: args } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: 'userId is required',
      });
    }

    if (!toolName) {
      return res.status(400).json({
        error: 'toolName is required',
      });
    }

    // 工具到端点的映射
    const toolToEndpoint: Record<string, { path: string; method: string }> = {
      xiaohongshu_check_login: { path: '/api/v1/login/status', method: 'GET' },
      xiaohongshu_get_login_qrcode: { path: '/api/v1/login/qrcode', method: 'GET' },
      xiaohongshu_publish_content: { path: '/api/v1/publish', method: 'POST' },
      xiaohongshu_publish_video: { path: '/api/v1/publish_video', method: 'POST' },
      xiaohongshu_list_feeds: { path: '/api/v1/feeds/list', method: 'GET' },
      xiaohongshu_search_feeds: { path: '/api/v1/feeds/search', method: 'GET' },
      xiaohongshu_get_feed_detail: { path: '/api/v1/feeds/detail', method: 'POST' },
      xiaohongshu_post_comment: { path: '/api/v1/feeds/comment', method: 'POST' },
      xiaohongshu_user_profile: { path: '/api/v1/user/profile', method: 'POST' },
    };

    const endpoint = toolToEndpoint[toolName];
    if (!endpoint) {
      return res.status(400).json({
        error: `Unknown tool: ${toolName}`,
      });
    }

    // 调用对应的MCP进程
    const result = await processManager.callTool(
      userId,
      endpoint.path,
      endpoint.method,
      args || {}
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[HTTP Server] Tool call failed:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 便捷API：检查登录状态
app.get('/api/xiaohongshu/login/status', async (req, res) => {
  try {
    const userId = req.query.userId as string || req.headers['x-user-id'] as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const result = await processManager.callTool(
      userId,
      '/api/v1/login/status',
      'GET'
    );

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 便捷API：获取登录二维码
app.get('/api/xiaohongshu/login/qrcode', async (req, res) => {
  try {
    const userId = req.query.userId as string || req.headers['x-user-id'] as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const result = await processManager.callTool(
      userId,
      '/api/v1/login/qrcode',
      'GET'
    );

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 便捷API：发布内容
app.post('/api/xiaohongshu/publish', async (req, res) => {
  try {
    const userId = req.body.userId || req.headers['x-user-id'] as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const result = await processManager.callTool(
      userId,
      '/api/v1/publish',
      'POST',
      req.body
    );

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 便捷API：发布视频
app.post('/api/xiaohongshu/publish/video', async (req, res) => {
  try {
    const userId = req.body.userId || req.headers['x-user-id'] as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const result = await processManager.callTool(
      userId,
      '/api/v1/publish_video',
      'POST',
      req.body
    );

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 便捷API：导入Cookie（解决登录问题）- 增强版
app.post('/api/xiaohongshu/login/import-cookies', async (req, res) => {
  try {
    const { userId, cookies } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!cookies || !Array.isArray(cookies)) {
      return res.status(400).json({ error: 'cookies array is required' });
    }

    console.log(`[Cookie Import] Importing ${cookies.length} cookies for user ${userId}`);

    // 验证Cookie质量 - 检查关键字段
    const requiredCookies = ['a1', 'web_session'];
    const availableCookies = cookies.map(c => c.name);
    const missingCookies = requiredCookies.filter(name => !availableCookies.includes(name));

    if (missingCookies.length > 0) {
      console.warn(`[Cookie Import] Missing required cookies: ${missingCookies.join(', ')}`);
      return res.status(400).json({
        error: `Missing required cookies: ${missingCookies.join(', ')}`,
        available: availableCookies,
        required: requiredCookies
      });
    }

    // 创建多级目录结构确保Cookie隔离
    const cookieDir = path.join(COOKIE_DIR, userId);
    const cookieFile = path.join(cookieDir, 'cookies.json');
    const backupFile = path.join(cookieDir, `cookies_backup_${Date.now()}.json`);

    // 确保目录存在
    if (!fs.existsSync(cookieDir)) {
      fs.mkdirSync(cookieDir, { recursive: true });
      console.log(`[Cookie Import] Created cookie directory: ${cookieDir}`);
    }

    // 备份现有Cookie（如果存在）
    if (fs.existsSync(cookieFile)) {
      try {
        fs.copyFileSync(cookieFile, backupFile);
        console.log(`[Cookie Import] Backed up existing cookies to: ${backupFile}`);
      } catch (backupError) {
        console.warn(`[Cookie Import] Failed to backup cookies: ${backupError.message}`);
      }
    }

    // 标准化Cookie格式
    const standardizedCookies = cookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain || '.xiaohongshu.com',
      path: cookie.path || '/',
      secure: cookie.secure !== false, // 默认为true
      httpOnly: cookie.httpOnly || false,
      sameSite: cookie.sameSite || 'Lax',
      expires: cookie.expires, // 保留过期时间
      priority: cookie.priority || 'Medium' // 默认优先级
    }));

    // 写入Cookie文件
    fs.writeFileSync(cookieFile, JSON.stringify(standardizedCookies, null, 2));
    console.log(`[Cookie Import] Successfully imported ${standardizedCookies.length} cookies to ${cookieFile}`);

    // 同步到进程管理器 - 立即刷新对应用户的MCP进程
    try {
      await processManager.refreshUserCookies(userId, standardizedCookies);
      console.log(`[Cookie Import] Successfully refreshed MCP process cookies for user ${userId}`);
    } catch (refreshError) {
      console.warn(`[Cookie Import] Failed to refresh MCP process: ${refreshError.message}`);
      // 不返回错误，因为文件写入已成功
    }

    // 验证Cookie有效性 - 尝试调用登录状态检查
    try {
      const validationResult = await processManager.callTool(
        userId,
        '/api/v1/login/status',
        'GET'
      );

      if (validationResult && !validationResult.error) {
        console.log(`[Cookie Import] Cookie validation successful for user ${userId}`);
      } else {
        console.warn(`[Cookie Import] Cookie validation failed: ${validationResult?.error || 'Unknown error'}`);
      }
    } catch (validationError) {
      console.warn(`[Cookie Import] Cookie validation error: ${validationError.message}`);
    }

    res.json({
      success: true,
      message: `Successfully imported ${standardizedCookies.length} cookies`,
      data: {
        userId,
        cookieCount: standardizedCookies.length,
        cookieFile: cookieFile,
        backupFile: fs.existsSync(backupFile) ? backupFile : null,
        requiredCookiesPresent: requiredCookies.every(name => availableCookies.includes(name)),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('[Cookie Import] Error:', error);
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 便捷API：搜索内容
app.get('/api/xiaohongshu/feeds/search', async (req, res) => {
  try {
    const userId = req.query.userId as string || req.headers['x-user-id'] as string;
    const keyword = req.query.keyword as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!keyword) {
      return res.status(400).json({ error: 'keyword is required' });
    }

    const result = await processManager.callTool(
      userId,
      '/api/v1/feeds/search',
      'GET',
      { keyword }
    );

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 便捷API：获取推荐内容
app.get('/api/xiaohongshu/feeds/list', async (req, res) => {
  try {
    const userId = req.query.userId as string || req.headers['x-user-id'] as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const result = await processManager.callTool(
      userId,
      '/api/v1/feeds/list',
      'GET'
    );

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 启动服务器
app.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`[MCP Router HTTP] Server listening on 0.0.0.0:${HTTP_PORT}`);
  console.log(`[MCP Router HTTP] Health check: http://localhost:${HTTP_PORT}/health`);
  console.log(`[MCP Router HTTP] Stats: http://localhost:${HTTP_PORT}/stats`);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('[MCP Router HTTP] Shutting down...');
  processManager.cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[MCP Router HTTP] Shutting down...');
  processManager.cleanup();
  process.exit(0);
});
