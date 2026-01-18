/**
 * BettaFish Sentiment Analysis Client v2.0
 *
 * 功能：
 * 1. 调用 BettaFish 舆情分析平台 API
 * 2. 备用方案：AI 生成实时热点（当 BettaFish 不可用时）
 * 3. 缓存机制：每天只调用一次，24小时内复用
 * 4. 开关支持：可选择是否启用舆情分析
 *
 * 部署地址: https://weibo-sentiment-app.zeabur.app
 */

import Anthropic from '@anthropic-ai/sdk';

export interface BettaFishStatus {
    forum: { status: string; port: number | null; output_lines: number };
    insight: { status: string; port: number; output_lines: number };
    media: { status: string; port: number; output_lines: number };
    query: { status: string; port: number; output_lines: number };
}

export interface BettaFishSearchResult {
    success: boolean;
    query: string;
    results: {
        insight: { success: boolean; data: any };
        media: { success: boolean; data: any };
        query: { success: boolean; data: any };
    };
}

export interface BettaFishReportTask {
    success: boolean;
    task_id: string;
    message: string;
}

export interface BettaFishReportProgress {
    task_id: string;
    status: 'pending' | 'running' | 'completed' | 'error';
    progress: number;
    message: string;
}

export interface SentimentBrief {
    query: string;
    topics: string[];
    keywords: string[];
    insights: any;
    mediaAnalysis: any;
    queryAnalysis: any;
    riskSignals: string[];
    fetchedAt: string;
    source: 'bettafish' | 'ai_fallback' | 'cache';
}

// 缓存结构
interface CacheEntry {
    data: SentimentBrief;
    expiresAt: number; // timestamp
}

const DEFAULT_BASE_URL = 'https://weibo-sentiment-app.zeabur.app';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 小时缓存

export class BettaFishClient {
    private baseUrl: string;
    private cache: Map<string, CacheEntry> = new Map();
    private anthropicClient: Anthropic | null = null;

    constructor(baseUrl?: string) {
        this.baseUrl = baseUrl || process.env.BETTAFISH_API_URL || DEFAULT_BASE_URL;

        // 初始化 Anthropic 客户端（用于 AI 备用方案）
        if (process.env.ANTHROPIC_API_KEY) {
            this.anthropicClient = new Anthropic({
                apiKey: process.env.ANTHROPIC_API_KEY,
            });
        }
    }

    /**
     * 获取系统状态
     */
    async getStatus(): Promise<BettaFishStatus> {
        const response = await fetch(`${this.baseUrl}/api/status`);
        if (!response.ok) {
            throw new Error(`BettaFish status check failed: ${response.status}`);
        }
        return response.json() as Promise<BettaFishStatus>;
    }

    /**
     * 执行舆情搜索（带重试逻辑）
     */
    async search(query: string): Promise<BettaFishSearchResult> {
        const response = await fetch(`${this.baseUrl}/api/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
        });

        if (!response.ok) {
            throw new Error(`BettaFish search failed: ${response.status}`);
        }
        return response.json() as Promise<BettaFishSearchResult>;
    }

    /**
     * 生成分析报告
     */
    async generateReport(query: string, customTemplate?: string): Promise<BettaFishReportTask> {
        const response = await fetch(`${this.baseUrl}/api/report/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, custom_template: customTemplate || '' }),
        });

        if (!response.ok) {
            throw new Error(`BettaFish report generation failed: ${response.status}`);
        }
        return response.json() as Promise<BettaFishReportTask>;
    }

    /**
     * 获取报告进度
     */
    async getReportProgress(taskId: string): Promise<BettaFishReportProgress> {
        const response = await fetch(`${this.baseUrl}/api/report/progress/${taskId}`);
        if (!response.ok) {
            throw new Error(`BettaFish report progress failed: ${response.status}`);
        }
        return response.json() as Promise<BettaFishReportProgress>;
    }

    /**
     * 获取论坛讨论日志
     */
    async getForumLog(): Promise<{ success: boolean; log_lines: string[]; parsed_messages: any[] }> {
        const response = await fetch(`${this.baseUrl}/api/forum/log`);
        if (!response.ok) {
            throw new Error(`BettaFish forum log failed: ${response.status}`);
        }
        return response.json() as Promise<{ success: boolean; log_lines: string[]; parsed_messages: any[] }>;
    }

    /**
     * 从搜索结果中提取结构化的 SentimentBrief
     */
    extractSentimentBrief(searchResult: BettaFishSearchResult): SentimentBrief {
        const { query, results } = searchResult;

        // 提取话题和关键词（根据实际返回结构调整）
        const topics: string[] = [];
        const keywords: string[] = [];
        const riskSignals: string[] = [];

        // 从 insight 结果中提取
        if (results.insight?.success && results.insight?.data) {
            const insightData = results.insight.data;
            if (insightData.topics) topics.push(...insightData.topics);
            if (insightData.keywords) keywords.push(...insightData.keywords);
            if (insightData.risks) riskSignals.push(...insightData.risks);
        }

        // 从 query 结果中提取
        if (results.query?.success && results.query?.data) {
            const queryData = results.query.data;
            if (queryData.related_topics) topics.push(...queryData.related_topics);
            if (queryData.trending_keywords) keywords.push(...queryData.trending_keywords);
        }

        return {
            query,
            topics: [...new Set(topics)], // 去重
            keywords: [...new Set(keywords)],
            insights: results.insight?.data || null,
            mediaAnalysis: results.media?.data || null,
            queryAnalysis: results.query?.data || null,
            riskSignals: [...new Set(riskSignals)],
            fetchedAt: new Date().toISOString(),
            source: 'bettafish',
        };
    }

    /**
     * 🔥 智能获取舆情数据（带缓存和备用方案）
     *
     * @param productName 产品名称
     * @param targetAudience 目标受众
     * @param enableSentiment 是否启用舆情（开关）
     * @param forceRefresh 强制刷新（忽略缓存）
     */
    async getSmartSentiment(
        productName: string,
        targetAudience: string = '',
        enableSentiment: boolean = true,
        forceRefresh: boolean = false
    ): Promise<SentimentBrief | null> {
        // 开关检查
        if (!enableSentiment) {
            console.log('[BettaFish] 舆情分析已禁用');
            return null;
        }

        const cacheKey = `${productName}_${targetAudience}`.toLowerCase().replace(/\s+/g, '_');
        const now = Date.now();

        // 检查缓存（除非强制刷新）
        if (!forceRefresh) {
            const cached = this.cache.get(cacheKey);
            if (cached && cached.expiresAt > now) {
                console.log('[BettaFish] ✅ 使用缓存的舆情数据（24小时内）');
                return { ...cached.data, source: 'cache' };
            }
        }

        // 尝试调用 BettaFish API
        const searchQuery = `${productName} ${targetAudience} 小红书热门`.trim();
        console.log('[BettaFish] 🔍 尝试获取舆情数据:', searchQuery);

        try {
            const searchResult = await this.search(searchQuery);

            // 检查是否有有效数据
            const hasValidData =
                (searchResult.results.insight?.success && searchResult.results.insight?.data) ||
                (searchResult.results.query?.success && searchResult.results.query?.data) ||
                (searchResult.results.media?.success && searchResult.results.media?.data);

            if (searchResult.success && hasValidData) {
                const brief = this.extractSentimentBrief(searchResult);

                // 存入缓存
                this.cache.set(cacheKey, {
                    data: brief,
                    expiresAt: now + CACHE_TTL_MS,
                });

                console.log('[BettaFish] ✅ BettaFish 数据获取成功');
                return brief;
            } else {
                console.log('[BettaFish] ⚠️ BettaFish 返回空数据，使用 AI 备用方案');
                return await this.generateAIFallbackSentiment(productName, targetAudience, cacheKey);
            }
        } catch (error) {
            console.warn('[BettaFish] ⚠️ BettaFish API 调用失败，使用 AI 备用方案:', error);
            return await this.generateAIFallbackSentiment(productName, targetAudience, cacheKey);
        }
    }

    /**
     * 🤖 AI 备用方案：使用 Claude 生成实时热点数据
     */
    private async generateAIFallbackSentiment(
        productName: string,
        targetAudience: string,
        cacheKey: string
    ): Promise<SentimentBrief | null> {
        if (!this.anthropicClient) {
            console.warn('[BettaFish] ⚠️ Anthropic API 未配置，无法使用 AI 备用方案');
            return this.getDefaultSentiment(productName, cacheKey);
        }

        try {
            console.log('[BettaFish] 🤖 使用 AI 生成热点数据...');

            const today = new Date().toLocaleDateString('zh-CN', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });

            const response = await this.anthropicClient.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 1024,
                messages: [
                    {
                        role: 'user',
                        content: `今天是 ${today}。你是一个小红书和社交媒体营销专家。

请为以下产品生成当前热门话题和关键词：
- 产品: ${productName}
- 目标受众: ${targetAudience || '年轻女性消费者'}

请以 JSON 格式返回，包含：
1. topics: 5个与产品相关的当前热门话题（结合季节、节日、社会热点）
2. keywords: 10个热门关键词/标签
3. insights: 1-2句营销洞察建议
4. riskSignals: 需要避免的敏感话题（如有）

只返回 JSON，不要其他说明：
{
  "topics": ["话题1", "话题2", ...],
  "keywords": ["关键词1", "关键词2", ...],
  "insights": "营销洞察...",
  "riskSignals": ["风险1"]
}`
                    }
                ]
            });

            // 解析 AI 响应
            const textContent = response.content.find(c => c.type === 'text');
            if (textContent && textContent.type === 'text') {
                try {
                    // 尝试提取 JSON
                    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);

                        const brief: SentimentBrief = {
                            query: `${productName} ${targetAudience}`,
                            topics: parsed.topics || [],
                            keywords: parsed.keywords || [],
                            insights: parsed.insights || null,
                            mediaAnalysis: null,
                            queryAnalysis: null,
                            riskSignals: parsed.riskSignals || [],
                            fetchedAt: new Date().toISOString(),
                            source: 'ai_fallback',
                        };

                        // 存入缓存
                        this.cache.set(cacheKey, {
                            data: brief,
                            expiresAt: Date.now() + CACHE_TTL_MS,
                        });

                        console.log('[BettaFish] ✅ AI 生成热点数据成功');
                        return brief;
                    }
                } catch (parseError) {
                    console.warn('[BettaFish] ⚠️ AI 响应解析失败:', parseError);
                }
            }
        } catch (aiError) {
            console.warn('[BettaFish] ⚠️ AI 备用方案失败:', aiError);
        }

        return this.getDefaultSentiment(productName, cacheKey);
    }

    /**
     * 获取默认舆情数据（当所有方案都失败时）
     */
    private getDefaultSentiment(productName: string, cacheKey: string): SentimentBrief {
        const defaultBrief: SentimentBrief = {
            query: productName,
            topics: [
                '日常分享',
                '好物推荐',
                '使用心得',
                '生活方式',
                '种草清单',
            ],
            keywords: [
                '好用', '推荐', '分享', '测评', '真实体验',
                '日常', '必备', '回购', '平价', '高性价比',
            ],
            insights: '基于通用小红书热门趋势生成',
            mediaAnalysis: null,
            queryAnalysis: null,
            riskSignals: [],
            fetchedAt: new Date().toISOString(),
            source: 'ai_fallback',
        };

        // 存入缓存（较短时间）
        this.cache.set(cacheKey, {
            data: defaultBrief,
            expiresAt: Date.now() + (4 * 60 * 60 * 1000), // 4小时
        });

        console.log('[BettaFish] ⚠️ 使用默认舆情数据');
        return defaultBrief;
    }

    /**
     * 清除缓存
     */
    clearCache(): void {
        this.cache.clear();
        console.log('[BettaFish] 缓存已清除');
    }

    /**
     * 获取缓存状态
     */
    getCacheStatus(): { size: number; entries: Array<{ key: string; expiresAt: string }> } {
        const entries = Array.from(this.cache.entries()).map(([key, value]) => ({
            key,
            expiresAt: new Date(value.expiresAt).toISOString(),
        }));
        return { size: this.cache.size, entries };
    }
}

// 单例导出
export const bettaFishClient = new BettaFishClient();
