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

// 便捷API：导入Cookie（解决登录问题）
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

    // 直接写入cookie文件
    const cookieDir = path.join(COOKIE_DIR, userId);
    const cookieFile = path.join(cookieDir, 'cookies.json');

    // 确保目录存在
    if (!fs.existsSync(cookieDir)) {
      fs.mkdirSync(cookieDir, { recursive: true });
    }

    // 写入cookie
    fs.writeFileSync(cookieFile, JSON.stringify(cookies, null, 2));

    console.log(`[Cookie Import] Successfully imported cookies to ${cookieFile}`);

    res.json({
      success: true,
      message: `Successfully imported ${cookies.length} cookies`,
      cookieFile: cookieFile
    });
  } catch (error: any) {
    console.error('[Cookie Import] Error:', error);
    res.status(500).json({ error: error.message });
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
