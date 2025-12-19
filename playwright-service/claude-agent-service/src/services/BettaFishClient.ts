/**
 * BettaFish Sentiment Analysis Client
 * 
 * 用于调用 BettaFish 舆情分析平台 API
 * 部署地址: https://weibo-sentiment-app.zeabur.app
 */

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
}

const DEFAULT_BASE_URL = 'https://weibo-sentiment-app.zeabur.app';

export class BettaFishClient {
    private baseUrl: string;

    constructor(baseUrl?: string) {
        this.baseUrl = baseUrl || process.env.BETTAFISH_API_URL || DEFAULT_BASE_URL;
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
     * 执行舆情搜索
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
        };
    }
}

// 单例导出
export const bettaFishClient = new BettaFishClient();
