/**
 * N8nUgcClient - N8n UGC 视频工作流客户端
 * 
 * 调用现有 N8n 工作流生成 UGC 风格视频：
 * 1. 触发 My workflow 14 (入口工作流)
 * 2. 等待视频生成完成 (通过 callback 接收)
 * 3. 返回视频下载 URL
 * 
 * @version 1.0.0
 */

import { supabaseAdmin } from '../orchestrator/db/supabase.js';
import { configService } from './ConfigService.js';

// ============ 配置 ============

const CONFIG = {
    // N8n 工作流 Webhook URL
    N8N_WEBHOOK_URL: process.env.N8N_UGC_WEBHOOK_URL || 'https://n8n-worker-k4m9.zeabur.app/webhook/9d5986f5-fcba-42bf-b3d7-5fd94660943a',

    // 回调接收 URL (Agent 后端)
    CALLBACK_URL: process.env.N8N_CALLBACK_URL || 'https://xiaohongshu-automation-ai.zeabur.app/api/ugc-video-callback',

    // 轮询超时
    POLL_TIMEOUT_MS: 30 * 60 * 1000,  // 30 分钟
    POLL_INTERVAL_MS: 10 * 1000,       // 10 秒
};

// ============ 类型定义 ============

/**
 * UGC 视频生成请求
 */
export interface UgcVideoRequest {
    /** 任务 ID */
    taskId: string;
    /** 产品描述 (来自 Dify 文案或用户输入) */
    productDescription: string;
    /** 产品图片 URL (已处理后的最终图片) */
    productImageUrl: string;
    /** 人物性别 */
    gender: 'male' | 'female';
    /** 视频时长 (秒) */
    duration: number;
    /** 视频语言 */
    language: 'zh-CN' | 'en-US' | 'ja-JP';
}

/**
 * UGC 视频生成结果
 */
export interface UgcVideoResult {
    success: boolean;
    /** 最终视频 URL */
    videoUrl?: string;
    /** Session ID */
    sessionId?: string;
    /** 错误信息 */
    error?: string;
    /** 耗时 (毫秒) */
    durationMs?: number;
}

/**
 * 回调数据
 */
interface CallbackData {
    sessionId: string;
    finalvideourl: string;
    receivedAt: string;
}

// ============ N8nUgcClient 实现 ============

export class N8nUgcClient {

    /**
     * 从 ConfigService 获取动态配置
     */
    private async getConfig() {
        return {
            webhookUrl: await configService.get('N8N_UGC_WEBHOOK_URL') || CONFIG.N8N_WEBHOOK_URL,
            callbackUrl: await configService.get('N8N_CALLBACK_URL') || CONFIG.CALLBACK_URL,
        };
    }

    /**
     * 生成 UGC 视频
     * 
     * 流程:
     * 1. 触发 N8n 工作流
     * 2. 轮询数据库等待回调结果
     * 3. 返回视频 URL
     */
    async generateUgcVideo(request: UgcVideoRequest): Promise<UgcVideoResult> {
        const startTime = Date.now();
        const sessionId = `agent_${request.taskId}_${Date.now()}`;

        console.log('[N8nUgcClient] Starting UGC video generation:', {
            taskId: request.taskId,
            sessionId,
            duration: request.duration,
            language: request.language,
        });

        try {
            // 1. 创建回调记录 (用于接收结果)
            await this.createCallbackRecord(sessionId, request.taskId);

            // 2. 触发 N8n 工作流
            const dynamicConfig = await this.getConfig();
            const triggerResult = await this.triggerWorkflow({
                desc: request.productDescription,
                img: request.productImageUrl,
                gender: request.gender,
                duration: String(request.duration),
                language: request.language,
                sessionId,
                callbackUrl: dynamicConfig.callbackUrl,
            });

            if (!triggerResult.success) {
                return {
                    success: false,
                    sessionId,
                    error: triggerResult.error,
                    durationMs: Date.now() - startTime,
                };
            }

            console.log('[N8nUgcClient] Workflow triggered, waiting for callback...');

            // 3. 轮询等待回调结果
            const videoUrl = await this.waitForCallback(sessionId);

            if (!videoUrl) {
                return {
                    success: false,
                    sessionId,
                    error: 'Timeout waiting for video generation',
                    durationMs: Date.now() - startTime,
                };
            }

            console.log('[N8nUgcClient] Video generation completed:', videoUrl);

            return {
                success: true,
                videoUrl,
                sessionId,
                durationMs: Date.now() - startTime,
            };

        } catch (error) {
            console.error('[N8nUgcClient] Generation failed:', error);
            return {
                success: false,
                sessionId,
                error: error instanceof Error ? error.message : String(error),
                durationMs: Date.now() - startTime,
            };
        }
    }

    /**
     * 仅触发工作流 (不等待结果)
     * 
     * 用于异步模式，结果通过回调处理
     */
    async triggerOnly(request: UgcVideoRequest): Promise<{ success: boolean; sessionId: string; error?: string }> {
        const sessionId = `agent_${request.taskId}_${Date.now()}`;

        console.log('[N8nUgcClient] Triggering workflow only:', sessionId);

        try {
            // 创建回调记录
            await this.createCallbackRecord(sessionId, request.taskId);

            // 触发工作流
            const dynamicConfig2 = await this.getConfig();
            const result = await this.triggerWorkflow({
                desc: request.productDescription,
                img: request.productImageUrl,
                gender: request.gender,
                duration: String(request.duration),
                language: request.language,
                sessionId,
                callbackUrl: dynamicConfig2.callbackUrl,
            });

            return {
                success: result.success,
                sessionId,
                error: result.error,
            };

        } catch (error) {
            return {
                success: false,
                sessionId,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * 处理回调 (由 API endpoint 调用)
     */
    async handleCallback(data: {
        sessionId: string;
        finalvideourl: string;
    }): Promise<void> {
        console.log('[N8nUgcClient] Received callback:', data.sessionId);

        // 更新回调记录
        const { error } = await supabaseAdmin
            .from('n8n_ugc_callbacks')
            .update({
                video_url: data.finalvideourl,
                status: 'completed',
                completed_at: new Date().toISOString(),
            })
            .eq('session_id', data.sessionId);

        if (error) {
            console.error('[N8nUgcClient] Failed to update callback record:', error);
        }
    }

    // ============ 私有方法 ============

    /**
     * 触发 N8n 工作流
     */
    private async triggerWorkflow(params: {
        desc: string;
        img: string;
        gender: string;
        duration: string;
        language: string;
        sessionId: string;
        callbackUrl: string;
    }): Promise<{ success: boolean; error?: string }> {
        try {
            const dynamicConfig = await this.getConfig();
            const response = await fetch(dynamicConfig.webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    chatInput: `视频创作需求：
🎬 视频时长：${params.duration}秒
📝 产品描述：${params.desc}
🖼️ 产品图片：${params.img}
👤 人物性别：${params.gender}
🌐 语言：${params.language}

请根据以上信息创建视频内容。`,
                    metadata: {
                        duration: params.duration,
                        productDescription: params.desc,
                        imageUrl: params.img,
                        characterGender: params.gender,
                        language: params.language,
                    },
                    sessionId: params.sessionId,
                    callbackUrl: params.callbackUrl,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[N8nUgcClient] Webhook error:', response.status, errorText);
                return {
                    success: false,
                    error: `Webhook failed: ${response.status}`,
                };
            }

            const result = await response.json();
            console.log('[N8nUgcClient] Webhook response:', result);

            return { success: true };

        } catch (error) {
            console.error('[N8nUgcClient] Trigger error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * 创建回调记录
     */
    private async createCallbackRecord(sessionId: string, taskId: string): Promise<void> {
        const { error } = await supabaseAdmin
            .from('n8n_ugc_callbacks')
            .insert({
                session_id: sessionId,
                task_id: taskId,
                status: 'pending',
                created_at: new Date().toISOString(),
            });

        if (error) {
            console.warn('[N8nUgcClient] Failed to create callback record:', error);
            // 不抛出错误，继续执行
        }
    }

    /**
     * 轮询等待回调结果
     */
    private async waitForCallback(sessionId: string): Promise<string | null> {
        const startTime = Date.now();

        while (Date.now() - startTime < CONFIG.POLL_TIMEOUT_MS) {
            // 查询回调记录
            const { data, error } = await supabaseAdmin
                .from('n8n_ugc_callbacks')
                .select('video_url, status')
                .eq('session_id', sessionId)
                .single();

            if (error) {
                console.warn('[N8nUgcClient] Poll error:', error);
            } else if (data?.status === 'completed' && data.video_url) {
                return data.video_url;
            }

            // 等待后继续
            await this.sleep(CONFIG.POLL_INTERVAL_MS);
        }

        return null;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 单例导出
export const n8nUgcClient = new N8nUgcClient();
