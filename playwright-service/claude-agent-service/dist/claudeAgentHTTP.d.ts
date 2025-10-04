/**
 * Claude Agent - 通过HTTP调用MCP Router
 */
export interface AgentConfig {
    apiKey: string;
    model?: string;
    maxTokens?: number;
    mcpRouterURL: string;
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
export declare class ClaudeAgentHTTP {
    private anthropic;
    private config;
    constructor(config: AgentConfig);
    /**
     * 调用MCP工具 (通过HTTP)
     */
    private callMCPTool;
    /**
     * 处理智能请求
     */
    processRequest(request: AgentRequest): Promise<AgentResponse>;
}
//# sourceMappingURL=claudeAgentHTTP.d.ts.map