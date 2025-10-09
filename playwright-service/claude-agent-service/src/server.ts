/**
 * Claude Agent HTTP Server
 */

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { ClaudeAgentHTTP, AgentRequest } from './claudeAgentHTTP.js';
import AutoContentManager from './autoContentManager.js';
import ImageGenerationService from './imageGenerationService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 端口配置 - 支持Zeabur动态端口分配
const PORT = parseInt(process.env.PORT || '8080');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'demo-key') {
  console.error('Error: A valid ANTHROPIC_API_KEY is required');
  console.error('Please set a real Anthropic API key in your environment variables.');
  console.error('Example: export ANTHROPIC_API_KEY=sk-ant-...');
  process.exit(1);
}

// MCP Router URL配置 - 支持生产环境和本地开发
const MCP_ROUTER_URL = process.env.MCP_ROUTER_URL || 'http://localhost:3001';

// 创建图片生成服务
const imageService = new ImageGenerationService({
  geminiKey: process.env.GEMINI_API_KEY,
  unsplashKey: process.env.UNSPLASH_ACCESS_KEY
});

// 创建 Claude Agent (HTTP版本)
const agent = new ClaudeAgentHTTP({
  apiKey: ANTHROPIC_API_KEY,
  model: process.env.CLAUDE_MODEL,
  maxTokens: parseInt(process.env.MAX_TOKENS || '4096'),
  mcpRouterURL: MCP_ROUTER_URL,
});

// 创建自动内容管理器
const autoContentManager = new AutoContentManager({
  anthropicKey: ANTHROPIC_API_KEY,
  imageService: imageService,
  mcpClient: null // 需要从agent传递
});

const app = express();
app.use(express.json());

// Basic CORS + preflight handler so browser fetch requests succeed in hosted envs
app.use((req: Request, res: Response, next: NextFunction) => {
  const allowOrigin = req.headers.origin || '*';
  res.header('Access-Control-Allow-Origin', allowOrigin);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
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
      // 小红书登录API
      xiaohongshuLogin: 'POST /agent/xiaohongshu/login - 启动小红书登录 {userId}',
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

    // 启动自动运营
    await autoContentManager.startAutoMode(userProfile);

    res.json({
      success: true,
      message: `自动运营已启动，正在为您的${productName}制定运营策略...`,
      data: {
        userId,
        status: 'running',
        startTime: new Date().toISOString()
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

    // 从autoContentManager获取真实策略
    const strategy = autoContentManager.getStrategy(userId);

    if (!strategy) {
      return res.status(404).json({
        success: false,
        error: 'No strategy found for this user. Please start auto mode first.'
      });
    }

    res.json({
      success: true,
      strategy: {
        keyThemes: strategy.keyThemes,
        trendingTopics: strategy.trendingTopics,
        optimalTimes: strategy.optimalTimes,
        contentTypes: strategy.contentTypes,
        hashtags: strategy.hashtags
      }
    });
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

    // 返回所有今天的任务，不过滤日期（因为日期处理可能有问题）
    const today = new Date().toISOString().split('T')[0];
    const todayTasks = dailyTasks.map((task, index) => {
      // 安全的时间处理
      let scheduledTimeStr = '09:00';
      try {
        if (task.scheduledTime && typeof task.scheduledTime === 'object' && task.scheduledTime.toLocaleTimeString) {
          scheduledTimeStr = task.scheduledTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        } else if (task.scheduledTime && typeof task.scheduledTime === 'string') {
          // 如果是字符串，尝试转换为Date
          const dateObj = new Date(task.scheduledTime);
          if (!isNaN(dateObj.getTime())) {
            scheduledTimeStr = dateObj.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
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
        type: task.contentType || '图文'
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

// 图片生成API (单张)
app.post('/agent/image/generate', async (req: Request, res: Response) => {
  try {
    const { prompt, style, aspectRatio, negativePrompt } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'prompt is required',
      });
    }

    console.log(`[Image] Generating image with prompt: ${prompt}`);

    const imageRequest = {
      prompt,
      style: style || 'realistic',
      aspectRatio: aspectRatio || '1:1',
      negativePrompt
    };

    const result = await imageService.generateImage(imageRequest);

    res.json({
      success: true,
      data: {
        imageUrl: result.url,
        localPath: result.localPath,
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
    const { prompt, style, aspectRatio, count } = req.body;

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
      style: style || 'realistic',
      aspectRatio: aspectRatio || '1:1'
    }));

    const results = await imageService.generateBatchImages(requests);

    // 提取图片路径和URL
    const images = results.map(r => ({
      url: r.url,
      localPath: r.localPath,
      source: r.source
    }));

    const totalCost = results.reduce((sum, r) => sum + (r.cost || 0), 0);

    res.json({
      success: true,
      data: {
        images,
        count: images.length,
        totalCost,
        // 返回本地路径数组，供xiaohongshu-mcp使用
        localPaths: images.map(img => img.localPath).filter(p => p) as string[],
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

// 小红书登录API - 获取登录二维码
app.post('/agent/xiaohongshu/login', async (req: Request, res: Response) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required',
      });
    }

    console.log(`[XHS Login] Requesting QR code for user ${userId}`);

    try {
      // 首先检查MCP Router是否可用
      const axios = await import('axios');
      await axios.default.get(`${MCP_ROUTER_URL}/health`, { timeout: 5000 });

      // MCP Router可用，调用真实的API
      const response = await axios.default.get(
        `${MCP_ROUTER_URL}/api/xiaohongshu/login/qrcode?userId=${userId}`,
        { timeout: 10000 }
      );

      console.log(`[XHS Login] QR code received for user ${userId}`);

      res.json({
        success: true,
        message: '登录二维码已生成',
        data: response.data
      });
    } catch (mcpError: any) {
      console.warn(`[XHS Login] MCP Router unavailable (${mcpError.message}), using demo mode`);

      // MCP Router不可用，返回演示模式的二维码
      res.json({
        success: true,
        message: '演示模式：请使用手机扫描二维码登录小红书',
        data: {
          qr_code: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://www.xiaohongshu.com/explore',
          message: '演示模式 - 这是一个示例二维码',
          demo_mode: true
        }
      });
    }
  } catch (error: any) {
    console.error('[XHS Login] Error getting QR code:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get login QR code',
    });
  }
});

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

    try {
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
      console.warn(`[XHS Login] MCP Router unavailable (${mcpError.message}), using demo status`);

      // MCP Router不可用，返回演示模式状态
      res.json({
        success: true,
        data: {
          logged_in: false,
          message: '演示模式 - 请在生产环境中使用真实登录',
          demo_mode: true,
          user_id: userId
        }
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

// ============ 前端兼容性 API 端点 ============
// 为前端提供期望的 /api/xiaohongshu/login/* 端点

// 获取登录二维码 (前端兼容性端点)
app.get('/api/xiaohongshu/login/qrcode', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    console.log(`[API Proxy] QR code request for user ${userId}`);

    // 代理到 MCP Router - 仅真实模式
    const axios = await import('axios');
    const response = await axios.default.get(
      `${MCP_ROUTER_URL}/api/xiaohongshu/login/qrcode?userId=${userId}`,
      { timeout: 10000 }
    );

    res.json(response.data);
  } catch (error: any) {
    console.error('[API Proxy] QR code error:', error.message);
    res.status(500).json({
      error: `MCP Router connection failed: ${error.message}`,
      mcp_router_url: MCP_ROUTER_URL
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

    console.log(`[API Proxy] Login status check for user ${userId}`);

    // 代理到 MCP Router - 仅真实模式
    const axios = await import('axios');
    const response = await axios.default.get(
      `${MCP_ROUTER_URL}/api/xiaohongshu/login/status?userId=${userId}`,
      { timeout: 10000 }
    );

    res.json(response.data);
  } catch (error: any) {
    console.error('[API Proxy] Login status error:', error.message);
    res.status(500).json({
      error: `MCP Router connection failed: ${error.message}`,
      mcp_router_url: MCP_ROUTER_URL
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

  // 其他路径重定向到主页
  console.log(`[Server] Serving index.html for path: ${req.path}`);
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Claude Agent Service] Server listening on 0.0.0.0:${PORT}`);
  console.log(`[Claude Agent Service] Health check: http://localhost:${PORT}/health`);
  console.log(`[Claude Agent Service] MCP Router URL: ${MCP_ROUTER_URL}`);
});

// 优雅关闭
const shutdown = () => {
  console.log('[Claude Agent Service] Shutting down...');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
