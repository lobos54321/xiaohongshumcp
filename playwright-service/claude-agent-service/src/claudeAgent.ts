/**
 * Claude Agent - 使用 Anthropic SDK 和 MCP 工具
 */

import Anthropic from '@anthropic-ai/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface AgentConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  mcpCommand: string;
  mcpArgs: string[];
}

export interface AgentRequest {
  userId: string;
  prompt: string;
  systemPrompt?: string;
}

export interface AgentResponse {
  content: string;
  toolCalls: any[];
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  duration: number;
}

export class ClaudeAgent {
  private anthropic: Anthropic;
  private config: AgentConfig;
  private mcpClients: Map<string, Client>;

  constructor(config: AgentConfig) {
    this.config = config;
    this.anthropic = new Anthropic({
      apiKey: config.apiKey,
    });
    this.mcpClients = new Map();
  }

  /**
   * 获取或创建用户的 MCP Client
   */
  private async getMCPClient(userId: string): Promise<Client> {
    let client = this.mcpClients.get(userId);

    if (!client) {
      console.log(`[ClaudeAgent] Creating MCP client for user ${userId}`);

      // 创建 stdio transport
      const transport = new StdioClientTransport({
        command: this.config.mcpCommand,
        args: this.config.mcpArgs,
        env: {
          ...process.env,
          USER_ID: userId,
        },
      });

      // 创建 MCP client
      client = new Client(
        {
          name: 'xiaohongshu-agent',
          version: '1.0.0',
        },
        {
          capabilities: {
            tools: {},
          },
        }
      );

      await client.connect(transport);

      this.mcpClients.set(userId, client);
      console.log(`[ClaudeAgent] MCP client created for user ${userId}`);
    }

    return client;
  }

  /**
   * 处理智能请求
   */
  async processRequest(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();
    const { userId, prompt, systemPrompt } = request;

    console.log(`[ClaudeAgent] Processing request for user ${userId}`);

    // 获取 MCP client
    const mcpClient = await this.getMCPClient(userId);

    // 获取可用工具
    const toolsResponse = await mcpClient.listTools();
    const tools = toolsResponse.tools.map((tool: any) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));

    console.log(`[ClaudeAgent] Available tools: ${tools.map((t: any) => t.name).join(', ')}`);

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
${tools.map((t: any) => `- ${t.name}: ${t.description}`).join('\n')}

**重要规则**：
1. 所有工具调用都必须包含 "userId" 参数，值为 "${userId}"
2. 直接执行用户请求，不要问用户要userId（因为已经有了）
3. 根据用户请求智能选择合适的工具
4. 如果需要多步骤，自动执行所有步骤

请根据用户的请求，智能地使用这些工具完成任务。`;

    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: prompt,
      },
    ];

    const toolCalls: any[] = [];
    let assistantResponse = '';

    // Agent loop: 最多5轮工具调用
    for (let iteration = 0; iteration < 5; iteration++) {
      console.log(`[ClaudeAgent] Iteration ${iteration + 1}`);

      const response = await this.anthropic.messages.create({
        model: this.config.model || 'claude-3-5-sonnet-20241022',
        max_tokens: this.config.maxTokens || 4096,
        system: systemPrompt || defaultSystemPrompt,
        messages,
        tools: tools,
      });

      console.log(`[ClaudeAgent] Stop reason: ${response.stop_reason}`);

      // 处理响应
      for (const content of response.content) {
        if (content.type === 'text') {
          assistantResponse += content.text;
        } else if (content.type === 'tool_use') {
          console.log(`[ClaudeAgent] Tool call: ${content.name}`);
          toolCalls.push({
            id: content.id,
            name: content.name,
            input: content.input,
          });

          // 调用 MCP 工具
          try {
            const toolResult = await mcpClient.callTool({
              name: content.name,
              arguments: {
                userId,
                ...(content.input as object),
              },
            });

            console.log(`[ClaudeAgent] Tool result:`, toolResult);

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
                  content: JSON.stringify(toolResult.content),
                },
              ],
            });
          } catch (error: any) {
            console.error(`[ClaudeAgent] Tool call failed:`, error.message);

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
      if (!response.content.some((c: any) => c.type === 'tool_use')) {
        break;
      }
    }

    const duration = Date.now() - startTime;

    console.log(`[ClaudeAgent] Request completed in ${duration}ms`);

    return {
      content: assistantResponse,
      toolCalls,
      usage: {
        inputTokens: 0, // 需要从response中获取
        outputTokens: 0,
      },
      duration,
    };
  }

  /**
   * 关闭所有 MCP 连接
   */
  async cleanup() {
    console.log('[ClaudeAgent] Cleaning up MCP clients');
    for (const [userId, client] of this.mcpClients.entries()) {
      try {
        await client.close();
        console.log(`[ClaudeAgent] Closed MCP client for user ${userId}`);
      } catch (error) {
        console.error(`[ClaudeAgent] Failed to close client for ${userId}:`, error);
      }
    }
    this.mcpClients.clear();
  }
}
