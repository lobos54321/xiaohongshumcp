/**
 * Claude Agent - 通过HTTP调用MCP Router
 */
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
// MCP工具定义
const MCP_TOOLS = [
    {
        name: 'xiaohongshu_check_login',
        description: '检查小红书账号登录状态',
        input_schema: {
            type: 'object',
            properties: {
                userId: { type: 'string', description: '用户ID' }
            },
            required: ['userId']
        }
    },
    {
        name: 'xiaohongshu_get_login_qrcode',
        description: '获取小红书登录二维码',
        input_schema: {
            type: 'object',
            properties: {
                userId: { type: 'string', description: '用户ID' }
            },
            required: ['userId']
        }
    },
    {
        name: 'xiaohongshu_publish_content',
        description: '发布图文内容到小红书',
        input_schema: {
            type: 'object',
            properties: {
                userId: { type: 'string', description: '用户ID' },
                title: { type: 'string', description: '标题' },
                content: { type: 'string', description: '正文内容' },
                images: { type: 'array', items: { type: 'string' }, description: '图片路径列表' },
                tags: { type: 'array', items: { type: 'string' }, description: '标签列表' }
            },
            required: ['userId', 'title', 'content']
        }
    },
    {
        name: 'xiaohongshu_publish_video',
        description: '发布视频内容到小红书',
        input_schema: {
            type: 'object',
            properties: {
                userId: { type: 'string', description: '用户ID' },
                title: { type: 'string', description: '标题' },
                content: { type: 'string', description: '正文内容' },
                video: { type: 'string', description: '视频文件路径' },
                tags: { type: 'array', items: { type: 'string' }, description: '标签列表' }
            },
            required: ['userId', 'title', 'content', 'video']
        }
    },
    {
        name: 'xiaohongshu_search_feeds',
        description: '搜索小红书内容',
        input_schema: {
            type: 'object',
            properties: {
                userId: { type: 'string', description: '用户ID' },
                keyword: { type: 'string', description: '搜索关键词' }
            },
            required: ['userId', 'keyword']
        }
    },
    {
        name: 'xiaohongshu_list_feeds',
        description: '获取推荐内容列表',
        input_schema: {
            type: 'object',
            properties: {
                userId: { type: 'string', description: '用户ID' }
            },
            required: ['userId']
        }
    },
    {
        name: 'xiaohongshu_get_feed_detail',
        description: '获取帖子详情',
        input_schema: {
            type: 'object',
            properties: {
                userId: { type: 'string', description: '用户ID' },
                feed_id: { type: 'string', description: '帖子ID' },
                xsec_token: { type: 'string', description: 'xsec token' }
            },
            required: ['userId', 'feed_id', 'xsec_token']
        }
    },
    {
        name: 'xiaohongshu_post_comment',
        description: '发表评论',
        input_schema: {
            type: 'object',
            properties: {
                userId: { type: 'string', description: '用户ID' },
                feed_id: { type: 'string', description: '帖子ID' },
                xsec_token: { type: 'string', description: 'xsec token' },
                content: { type: 'string', description: '评论内容' }
            },
            required: ['userId', 'feed_id', 'xsec_token', 'content']
        }
    },
    {
        name: 'xiaohongshu_user_profile',
        description: '获取用户资料',
        input_schema: {
            type: 'object',
            properties: {
                userId: { type: 'string', description: '用户ID' },
                target_user_id: { type: 'string', description: '目标用户ID' },
                xsec_token: { type: 'string', description: 'xsec token' }
            },
            required: ['userId', 'target_user_id', 'xsec_token']
        }
    }
];
export class ClaudeAgentHTTP {
    anthropic;
    config;
    constructor(config) {
        this.config = config;
        this.anthropic = new Anthropic({
            apiKey: config.apiKey,
        });
    }
    /**
     * 调用MCP工具 (通过HTTP)
     */
    async callMCPTool(toolName, args) {
        try {
            const { userId, ...otherArgs } = args;
            const response = await axios.post(`${this.config.mcpRouterURL}/mcp/call`, {
                userId,
                toolName,
                arguments: otherArgs,
            });
            return response.data.data;
        }
        catch (error) {
            console.error(`[ClaudeAgentHTTP] Tool call failed:`, error.response?.data || error.message);
            throw new Error(`Tool call failed: ${error.response?.data?.error || error.message}`);
        }
    }
    /**
     * 处理智能请求
     */
    async processRequest(request) {
        const startTime = Date.now();
        const { userId, prompt, systemPrompt } = request;
        console.log(`[ClaudeAgentHTTP] Processing request for user ${userId}`);
        // 构建系统提示
        const defaultSystemPrompt = `你是一个小红书自动化运营助手。

**当前用户ID**: ${userId}

你可以帮助用户：
1. 管理小红书账号登录状态
2. 创作和发布图文/视频内容
3. 搜索和浏览小红书内容
4. 与用户互动（评论、点赞等）
5. 获取用户资料和数据分析

你有以下工具可用：
${MCP_TOOLS.map(t => `- ${t.name}: ${t.description}`).join('\n')}

**重要规则**：
1. 所有工具调用都必须包含 "userId" 参数，值为 "${userId}"
2. 直接执行用户请求，不要问用户要userId（因为已经有了）
3. 根据用户请求智能选择合适的工具
4. 如果需要多步骤，自动执行所有步骤

请根据用户的请求，智能地使用这些工具完成任务。`;
        const messages = [
            {
                role: 'user',
                content: prompt,
            },
        ];
        const toolCalls = [];
        let assistantResponse = '';
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        // Agent loop: 最多5轮工具调用
        for (let iteration = 0; iteration < 5; iteration++) {
            console.log(`[ClaudeAgentHTTP] Iteration ${iteration + 1}`);
            const response = await this.anthropic.messages.create({
                model: this.config.model || 'claude-3-5-sonnet-20241022',
                max_tokens: this.config.maxTokens || 4096,
                system: systemPrompt || defaultSystemPrompt,
                messages,
                tools: MCP_TOOLS,
            });
            console.log(`[ClaudeAgentHTTP] Stop reason: ${response.stop_reason}`);
            // 累计token使用
            totalInputTokens += response.usage.input_tokens;
            totalOutputTokens += response.usage.output_tokens;
            // 处理响应
            for (const content of response.content) {
                if (content.type === 'text') {
                    assistantResponse += content.text;
                }
                else if (content.type === 'tool_use') {
                    console.log(`[ClaudeAgentHTTP] Tool call: ${content.name}`);
                    toolCalls.push({
                        id: content.id,
                        name: content.name,
                        input: content.input,
                    });
                    // 调用 MCP 工具 (HTTP)
                    try {
                        const toolResult = await this.callMCPTool(content.name, content.input);
                        console.log(`[ClaudeAgentHTTP] Tool result:`, JSON.stringify(toolResult).slice(0, 200));
                        // 将工具结果添加到对话
                        messages.push({
                            role: 'assistant',
                            content: response.content,
                        });
                        messages.push({
                            role: 'user',
                            content: [
                                {
                                    type: 'tool_result',
                                    tool_use_id: content.id,
                                    content: JSON.stringify(toolResult),
                                },
                            ],
                        });
                    }
                    catch (error) {
                        console.error(`[ClaudeAgentHTTP] Tool call failed:`, error.message);
                        messages.push({
                            role: 'assistant',
                            content: response.content,
                        });
                        messages.push({
                            role: 'user',
                            content: [
                                {
                                    type: 'tool_result',
                                    tool_use_id: content.id,
                                    content: `Error: ${error.message}`,
                                    is_error: true,
                                },
                            ],
                        });
                    }
                }
            }
            // 如果 Claude 完成了响应（不需要更多工具），退出循环
            if (response.stop_reason === 'end_turn') {
                break;
            }
            // 如果没有工具调用，也退出
            if (!response.content.some((c) => c.type === 'tool_use')) {
                break;
            }
        }
        const duration = Date.now() - startTime;
        console.log(`[ClaudeAgentHTTP] Request completed in ${duration}ms`);
        console.log(`[ClaudeAgentHTTP] Token usage: ${totalInputTokens} input, ${totalOutputTokens} output`);
        return {
            content: assistantResponse,
            toolCalls,
            usage: {
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
            },
            duration,
        };
    }
}
//# sourceMappingURL=claudeAgentHTTP.js.map