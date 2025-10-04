/**
 * Claude Agent HTTP Server
 */

import express from 'express';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { ClaudeAgentHTTP, AgentRequest } from './claudeAgentHTTP.js';
import AutoContentManager from './autoContentManager.js';
import ImageGenerationService from './imageGenerationService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '4000');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY is required');
  process.exit(1);
}

const MCP_ROUTER_URL = process.env.MCP_ROUTER_URL || 'http://localhost:3000';

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

// API文档路由
app.get('/api', (_req, res) => {
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
    },
    documentation: 'https://github.com/lobos54321/xiaohongshumcp',
  });
});

// 提供前端静态文件（放在最后，避免覆盖API路由）
const frontendPath = path.join(__dirname, '../../../frontend');
app.use(express.static(frontendPath));

// 健康检查
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'claude-agent-service',
    timestamp: new Date().toISOString(),
  });
});

// 处理智能请求
app.post('/agent/chat', async (req, res) => {
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

// 便捷API：小红书内容创作
app.post('/agent/xiaohongshu/create-post', async (req, res) => {
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
app.post('/agent/xiaohongshu/research', async (req, res) => {
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
app.post('/agent/xiaohongshu/batch-publish', async (req, res) => {
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
app.post('/agent/auto/start', async (req, res) => {
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
app.get('/agent/auto/strategy/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // 模拟返回策略数据（实际应该从autoContentManager获取）
    const strategy = {
      keyThemes: ['产品介绍', '用户评价', '使用技巧', '品牌故事'],
      trendingTopics: ['#好物推荐', '#生活分享', '#品质生活'],
      optimalTimes: ['09:00', '15:00', '20:00'],
      contentTypes: ['图文', '轮播图', '视频'],
      weeklyPlan: '本周重点推广新品特色'
    };

    res.json({
      success: true,
      strategy
    });
  } catch (error: any) {
    console.error('[Auto Mode] Error getting strategy:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 获取今日计划
app.get('/agent/auto/plan/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // 模拟返回计划数据
    const plan = {
      date: new Date().toISOString().split('T')[0],
      tasks: [
        {
          id: '1',
          title: '早晨产品介绍',
          scheduledTime: '09:00',
          status: 'completed',
          type: '图文'
        },
        {
          id: '2',
          title: '下午用户分享',
          scheduledTime: '15:00',
          status: 'in-progress',
          type: '轮播图'
        },
        {
          id: '3',
          title: '晚间品牌故事',
          scheduledTime: '20:00',
          status: 'planned',
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
app.get('/agent/auto/stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // 模拟返回统计数据
    const stats = {
      todayPosts: 2,
      plannedPosts: 3,
      weeklyReads: '1.2k',
      newFollowers: 15,
      engagementRate: '7.8'
    };

    res.json({
      success: true,
      stats
    });
  } catch (error: any) {
    console.error('[Auto Mode] Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 暂停自动运营
app.post('/agent/auto/pause/:userId', async (req, res) => {
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
app.post('/agent/auto/resume/:userId', async (req, res) => {
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

// 图片生成API
app.post('/agent/image/generate', async (req, res) => {
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

// 启动服务器
app.listen(PORT, () => {
  console.log(`[Claude Agent Service] Server listening on port ${PORT}`);
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
