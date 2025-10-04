/**
 * Claude Agent - 使用 Anthropic SDK 和 MCP 工具
 */
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
export declare class ClaudeAgent {
    private anthropic;
    private config;
    private mcpClients;
    constructor(config: AgentConfig);
    /**
     * 获取或创建用户的 MCP Client
     */
    private getMCPClient;
    /**
     * 处理智能请求
     */
    processRequest(request: AgentRequest): Promise<AgentResponse>;
    /**
     * 关闭所有 MCP 连接
     */
    cleanup(): Promise<void>;
}
//# sourceMappingURL=claudeAgent.d.ts.map