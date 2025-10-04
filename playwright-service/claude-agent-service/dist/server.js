/**
 * Claude Agent HTTP Server
 */
import express from 'express';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { ClaudeAgentHTTP } from './claudeAgentHTTP.js';
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
// 创建 Claude Agent (HTTP版本)
const agent = new ClaudeAgentHTTP({
    apiKey: ANTHROPIC_API_KEY,
    model: process.env.CLAUDE_MODEL,
    maxTokens: parseInt(process.env.MAX_TOKENS || '4096'),
    mcpRouterURL: MCP_ROUTER_URL,
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
        const agentRequest = {
            userId,
            prompt,
            systemPrompt,
        };
        const result = await agent.processRequest(agentRequest);
        res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
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
    }
    catch (error) {
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
    }
    catch (error) {
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
${topics.map((t, i) => `${i + 1}. ${t}`).join('\n')}

${schedule ? `发布计划：${schedule}` : '请立即全部发布'}`;
        const result = await agent.processRequest({ userId, prompt });
        res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        console.error('[Server] Error batch publishing:', error);
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
//# sourceMappingURL=server.js.map