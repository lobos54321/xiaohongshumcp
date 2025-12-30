import fetch from 'node-fetch';
import { Response } from 'node-fetch';

// ============ 类型定义 ============

/**
 * Dify 文案生成结果
 */
export interface DifyContentGenerationResult {
    /** 笔记标题 */
    title: string;
    /** 完整文案正文 */
    text: string;
    /** 情感描述 (犀利的/温柔的/兴奋的/活泼的/严肃的) */
    emotion: string;
    /** 话题标签 */
    hashtags: string[];
    /** 原始响应 */
    rawResponse?: string;
}

/**
 * Dify Chat API 请求参数
 */
interface DifyChatRequest {
    inputs: Record<string, string>;
    query: string;
    response_mode: 'blocking' | 'streaming';
    conversation_id: string;
    user: string;
    files?: Array<{
        type: 'image' | 'document';
        transfer_method: 'remote_url' | 'local_file';
        url?: string;
        upload_file_id?: string;
    }>;
}

/**
 * Dify Chat API 响应
 */
interface DifyChatResponse {
    event: string;
    message_id: string;
    conversation_id: string;
    mode: string;
    answer: string;
    metadata: {
        usage: {
            prompt_tokens: number;
            completion_tokens: number;
            total_tokens: number;
        };
    };
    created_at: number;
}

/**
 * 文案生成请求参数
 */
export interface ContentGenerationParams {
    /** 产品/服务信息描述 */
    productInfo: string;
    /** 目标用户群体 */
    targetAudience?: string;
    /** 营销目标 */
    marketingGoal?: string;
    /** 目标字数 */
    targetWords?: number;
    /** 发布平台 */
    platform?: string;
    /** 用户 ID (用于 Dify 会话追踪) */
    userId?: string;
    /** 附加文档 URL (如舆情报告) */
    documentUrl?: string;
}

// ============ 并发控制 ============

/**
 * 简单的信号量实现，用于限制并发请求数
 */
class Semaphore {
    private permits: number;
    private waiting: Array<() => void> = [];

    constructor(permits: number) {
        this.permits = permits;
    }

    async acquire(): Promise<void> {
        if (this.permits > 0) {
            this.permits--;
            return;
        }
        return new Promise((resolve) => {
            this.waiting.push(resolve);
        });
    }

    release(): void {
        const next = this.waiting.shift();
        if (next) {
            next();
        } else {
            this.permits++;
        }
    }

    get available(): number {
        return this.permits;
    }

    get queueLength(): number {
        return this.waiting.length;
    }
}

// ============ DifyClient 实现 ============

export class DifyClient {
    private apiKey: string;
    private baseUrl: string;
    private semaphore: Semaphore;
    private maxConcurrent: number;

    constructor(maxConcurrent: number = 5) {
        this.apiKey = process.env.DIFY_API_KEY || 'app-fOxdNQgAutGXS3CThzoNUdfI';
        this.baseUrl = process.env.DIFY_API_URL || 'https://api.dify.ai/v1';
        this.maxConcurrent = maxConcurrent;
        this.semaphore = new Semaphore(maxConcurrent);

        console.log(`[DifyClient] 初始化完成:`);
        console.log(`   - API URL: ${this.baseUrl}`);
        console.log(`   - API Key: ${process.env.DIFY_API_KEY ? '来自环境变量' : '使用代码硬编码 (app-fOxd...)'}`);
        console.log(`   - 最大并发: ${maxConcurrent}`);
    }

    /**
     * 获取当前并发状态
     */
    getConcurrencyStatus(): { available: number; waiting: number; max: number } {
        return {
            available: this.semaphore.available,
            waiting: this.semaphore.queueLength,
            max: this.maxConcurrent,
        };
    }


    /**
     * 生成营销文案 (使用 Streaming 模式，支持长时间运行的工作流)
     * 
     * @param params 文案生成参数
     * @returns 生成的文案内容 (title, text, emotion, hashtags)
     */
    async generateMarketingCopy(params: ContentGenerationParams): Promise<DifyContentGenerationResult> {
        // 获取信号量，控制并发
        const status = this.getConcurrencyStatus();
        console.log(`[DifyClient] 请求生成文案，当前并发状态: ${status.max - status.available}/${status.max} 运行中，${status.waiting} 等待中`);

        await this.semaphore.acquire();
        console.log('[DifyClient] 获取到并发许可，开始生成...');

        try {
            return await this._generateMarketingCopyInternal(params);
        } finally {
            this.semaphore.release();
            console.log('[DifyClient] 释放并发许可');
        }
    }

    /**
     * 内部实现：生成营销文案
     */
    private async _generateMarketingCopyInternal(params: ContentGenerationParams): Promise<DifyContentGenerationResult> {
        console.log('[DifyClient] 开始生成营销文案 (Streaming 模式)...', {
            productInfo: params.productInfo.substring(0, 100) + '...',
            targetWords: params.targetWords,
        });

        // 构建完整的查询内容 - 按照工作流要求的格式
        const queryParts: string[] = [];

        // 什么产品？
        queryParts.push(`什么产品？尽可能详细描述，解决问题的方法与众不同的地方，取得过什么成功案例或结果？或者有什么经验？`);
        queryParts.push(params.productInfo);

        // 目标用户和营销目标
        queryParts.push(`\n你的目标用户是？你想要提高用户认知，还是解决疑惑（说服），还是直接销售？`);
        if (params.targetAudience) {
            queryParts.push(`目标用户：${params.targetAudience}`);
        }
        if (params.marketingGoal) {
            queryParts.push(`营销目标：${params.marketingGoal}`);
        }

        // 平台和字数
        queryParts.push(`\n想发在哪个平台？想要多少字的文案？`);
        queryParts.push(`平台：${params.platform || '小红书'}`);
        queryParts.push(`字数：${params.targetWords || 800}字`);

        const query = queryParts.join('\n');

        // 构建请求 - 使用 streaming 模式
        const request: DifyChatRequest = {
            inputs: {},
            query: query,
            response_mode: 'streaming',  // 使用 streaming 模式避免超时
            conversation_id: '',
            user: params.userId || `prome-user-${Date.now()}`,
        };

        // 如果有文档 URL，添加到 files
        if (params.documentUrl) {
            request.files = [
                {
                    type: 'document',
                    transfer_method: 'remote_url',
                    url: params.documentUrl,
                },
            ];
        }

        try {
            console.log('[DifyClient] 发送 streaming 请求...');
            const response = await fetch(`${this.baseUrl}/chat-messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request),
            }) as any; // Cast for node-fetch vs global fetch compatibility

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[DifyClient] API 请求失败:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: errorText.substring(0, 500),
                });
                throw new Error(`Dify API 请求失败: ${response.status} ${response.statusText}`);
            }

            // 处理 SSE (Server-Sent Events) 流
            const answer = await this.processStreamingResponse(response);

            console.log('[DifyClient] Streaming 完成，响应长度:', answer.length);
            console.log('[DifyClient] 🔍 原始响应内容 (前500字符):', answer.substring(0, 500));
            console.log('[DifyClient] 🔍 原始响应内容 (后500字符):', answer.substring(Math.max(0, answer.length - 500)));

            // 解析 LLM8b 输出的 JSON 格式
            const result = this.parseContentGenerationResult(answer);
            return result;

        } catch (error) {
            console.error('[DifyClient] 生成文案失败:', error);
            throw error;
        }
    }

    /**
     * 处理 Streaming 响应 (SSE 格式)
     */
    private async processStreamingResponse(response: Response): Promise<string> {
        if (!response.body) {
            throw new Error('无法获取响应流');
        }

        const decoder = new TextDecoder();
        let fullAnswer = '';
        let lastProgressLog = Date.now();

        try {
            // node-fetch and global fetch handle streams differently
            // for await works for most modern stream implementations
            for await (const value of response.body as any) {
                const chunk = decoder.decode(value as any, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.trim().startsWith('data: ')) {
                        const jsonStr = line.trim().slice(6);
                        if (jsonStr === '[DONE]') continue;

                        try {
                            const event = JSON.parse(jsonStr);

                            // 处理不同类型的事件
                            if (event.event === 'message' || event.event === 'agent_message') {
                                if (event.answer) {
                                    fullAnswer += event.answer;
                                }
                            } else if (event.event === 'message_end') {
                                // 流结束
                                console.log('[DifyClient] 收到 message_end 事件');
                            } else if (event.event === 'error') {
                                throw new Error(`Dify 错误: ${event.message || JSON.stringify(event)}`);
                            }
                        } catch (parseError) {
                            // 忽略非 JSON 行
                        }
                    }
                }

                // 每 30 秒记录一次进度
                if (Date.now() - lastProgressLog > 30000) {
                    console.log('[DifyClient] 生成中...当前长度:', fullAnswer.length);
                    lastProgressLog = Date.now();
                }
            }
        } catch (err) {
            console.error('[DifyClient] 流处理过程中出错:', err);
            throw err;
        }

        return fullAnswer;
    }

    /**
     * 解析 Dify 响应中的 JSON 内容
     * LLM8b 输出格式: { title, text, emotion, hashtags }
     */
    private parseContentGenerationResult(answer: string): DifyContentGenerationResult {
        console.log('[DifyClient] 解析响应内容...');

        try {
            // 🔥 使用更强力的清洗逻辑
            const jsonStr = this.cleanJSONResponse(answer);
            const parsed = JSON.parse(jsonStr);

            // 验证必需字段
            if (!parsed.title || !parsed.text) {
                // 如果缺少基本字段，尝试第二次智能提取
                throw new Error('Dify JSON 缺少必需字段 title 或 text');
            }

            const result: DifyContentGenerationResult = {
                title: parsed.title,
                text: parsed.text,
                emotion: parsed.emotion || '严肃的',
                hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
                rawResponse: answer,
            };

            return result;

        } catch (parseError) {
            console.warn('[DifyClient] JSON 解析失败，尝试终极降级方案...', parseError);
            return this.extractContentFallback(answer);
        }
    }

    /**
     * 实现与 AutoContentManager 一致的强力 JSON 清洗逻辑
     */
    private cleanJSONResponse(responseText: string): string {
        try {
            let cleanedText = responseText
                .replace(/```json\s*/gi, '')
                .replace(/```\s*/g, '')
                .trim();

            const extracted = this.extractCompleteJSON(cleanedText);
            if (extracted && this.isValidJSON(extracted)) {
                return extracted;
            }

            const escaped = this.escapeJSONStringLiterals(cleanedText);
            return escaped;
        } catch (error) {
            return responseText.trim();
        }
    }

    private extractCompleteJSON(text: string): string {
        const objectStart = text.indexOf('{');
        if (objectStart === -1) return '';

        let depth = 0;
        let inString = false;
        let escapeNext = false;

        for (let i = objectStart; i < text.length; i++) {
            const char = text[i];
            if (escapeNext) { escapeNext = false; continue; }
            if (char === '\\') { escapeNext = true; continue; }
            if (char === '"') { inString = !inString; continue; }
            if (inString) continue;

            if (char === '{') depth++;
            else if (char === '}') {
                depth--;
                if (depth === 0) return text.substring(objectStart, i + 1);
            }
        }
        return '';
    }

    private escapeJSONStringLiterals(jsonString: string): string {
        let result = '';
        let inString = false;
        let escapeNext = false;

        for (let i = 0; i < jsonString.length; i++) {
            const char = jsonString[i];
            if (escapeNext) { result += char; escapeNext = false; continue; }
            if (char === '\\') { result += char; escapeNext = true; continue; }
            if (char === '"') { result += char; inString = !inString; continue; }

            if (inString) {
                if (char === '\n') result += '\\n';
                else if (char === '\r') result += '\\r';
                else if (char === '\t') result += '\\t';
                else result += char;
            } else {
                result += char;
            }
        }
        return result;
    }

    private isValidJSON(str: string): boolean {
        try { JSON.parse(str); return true; } catch { return false; }
    }

    /**
     * 降级方案：从非 JSON 响应中提取内容
     */
    private extractContentFallback(answer: string): DifyContentGenerationResult {
        console.log('[DifyClient] 使用降级提取方案...');

        // 尝试提取标题 (通常是第一行或 ## 标题)
        let title = '';
        const titleMatch = answer.match(/^#+\s*(.+)$/m) || answer.match(/^(.{10,50})[\n\r]/);
        if (titleMatch) {
            title = titleMatch[1].trim();
        }

        // 尝试提取话题标签
        const hashtags: string[] = [];
        const hashtagMatches = answer.match(/#[^\s#]+/g);
        if (hashtagMatches) {
            hashtags.push(...hashtagMatches);
        }

        // 推断情感
        let emotion = '严肃的';
        if (answer.includes('揭露') || answer.includes('真相') || answer.includes('问题')) {
            emotion = '犀利的';
        } else if (answer.includes('温暖') || answer.includes('感动') || answer.includes('分享')) {
            emotion = '温柔的';
        } else if (answer.includes('激励') || answer.includes('希望') || answer.includes('突破')) {
            emotion = '兴奋的';
        } else if (answer.includes('幽默') || answer.includes('哈哈') || answer.includes('笑')) {
            emotion = '活泼的';
        }

        return {
            title: title || '营销文案',
            text: answer,
            emotion: emotion,
            hashtags: hashtags.slice(0, 5), // 最多 5 个话题
            rawResponse: answer,
        };
    }

    /**
     * 获取对话历史 (可选)
     */
    async getConversationHistory(conversationId: string, userId: string): Promise<any> {
        const response = await fetch(
            `${this.baseUrl}/messages?conversation_id=${conversationId}&user=${userId}&limit=20`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                },
            }
        );

        if (!response.ok) {
            throw new Error(`获取对话历史失败: ${response.status}`);
        }

        return response.json();
    }

    /**
     * 停止生成 (用于 streaming 模式)
     */
    async stopGeneration(taskId: string, userId: string): Promise<void> {
        await fetch(`${this.baseUrl}/chat-messages/${taskId}/stop`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ user: userId }),
        });
    }

    /**
     * 提交消息反馈
     */
    async submitFeedback(messageId: string, rating: 'like' | 'dislike', userId: string): Promise<void> {
        await fetch(`${this.baseUrl}/messages/${messageId}/feedbacks`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                rating: rating,
                user: userId,
            }),
        });
    }
}

// 导出单例
export const difyClient = new DifyClient();
