/**
 * SkyvernExecutor - 矩阵执行器 Provider
 * 
 * 通过自部署 Skyvern 执行 publish/fetch_metrics 步骤
 * 支持多账号并行发布和数据采集
 * 
 * @version 1.0.0 - MVP
 */

import { getSupabaseAdmin } from '../db/supabase.js';

// ==================== 配置 ====================
const SKYVERN_CONFIG = {
    // Skyvern API 地址（自部署）
    API_URL: process.env.SKYVERN_API_URL || 'http://localhost:8000/api/v1',
    API_KEY: process.env.SKYVERN_API_KEY || '',

    // 轮询间隔
    POLL_INTERVAL: 30000,  // 30 秒

    // 超时配置
    PUBLISH_TIMEOUT: 15 * 60 * 1000,   // 15 分钟
    FETCH_METRICS_TIMEOUT: 10 * 60 * 1000,  // 10 分钟

    // 重试配置
    MAX_RETRIES: 3,
};

// ==================== 类型定义 ====================
interface TaskStep {
    id: string;
    task_id: string;
    step_type: string;
    status: string;
    input_snapshot: any;
    xhs_account_id: string;
    supabase_uuid: string;
    attempt: number;
    max_attempts: number;
    platform?: string;  // 支持多平台: 'xiaohongshu' | 'x' | 'tiktok' | 'instagram' 等
}

interface SkyvernJobResponse {
    task_id: string;
    status: string;
    output?: any;
    error?: string;
}

interface XhsAccount {
    id: string;
    xhs_user_id: string;
    execution_provider: string;
    skyvern_profile_id: string | null;
}

// ==================== 状态管理 ====================
let executorState = {
    isRunning: false,
    pollTimer: null as NodeJS.Timeout | null,
    activeJobs: new Map<string, string>(),  // stepId -> skyvernTaskId
};

// ==================== 主类 ====================
export class SkyvernExecutor {
    private supabase = getSupabaseAdmin();

    /**
     * 启动 Skyvern Executor
     */
    async start(): Promise<void> {
        if (executorState.isRunning) {
            console.log('[SkyvernExecutor] Already running');
            return;
        }

        console.log('[SkyvernExecutor] Starting...');
        executorState.isRunning = true;

        // 立即执行一次
        await this.pollPendingSteps();

        // 设置定时轮询
        executorState.pollTimer = setInterval(
            () => this.pollPendingSteps(),
            SKYVERN_CONFIG.POLL_INTERVAL
        );

        console.log('[SkyvernExecutor] Started, polling every', SKYVERN_CONFIG.POLL_INTERVAL / 1000, 'seconds');
    }

    /**
     * 停止 Skyvern Executor
     */
    stop(): void {
        console.log('[SkyvernExecutor] Stopping...');
        executorState.isRunning = false;

        if (executorState.pollTimer) {
            clearInterval(executorState.pollTimer);
            executorState.pollTimer = null;
        }

        console.log('[SkyvernExecutor] Stopped');
    }

    /**
     * 轮询待执行的 Skyvern steps
     */
    async pollPendingSteps(): Promise<void> {
        if (!executorState.isRunning) return;

        try {
            const now = new Date().toISOString();

            // 查询 pending steps (provider=skyvern)
            const { data: steps, error } = await this.supabase
                .from('xhs_task_steps')
                .select('*')
                .eq('status', 'pending')
                .eq('provider', 'skyvern')
                .in('step_type', ['publish', 'fetch_metrics'])
                .or(`scheduled_at.is.null,scheduled_at.lte.${now}`)
                .order('created_at', { ascending: true })
                .limit(5);  // 并行5个

            if (error) {
                console.error('[SkyvernExecutor] Query error:', error.message);
                return;
            }

            if (!steps || steps.length === 0) {
                console.log('[SkyvernExecutor] No pending steps');
                return;
            }

            console.log('[SkyvernExecutor] Found', steps.length, 'pending steps');

            // 并行执行
            await Promise.all(steps.map(step => this.executeStep(step)));

        } catch (error) {
            console.error('[SkyvernExecutor] Poll error:', error);
        }
    }

    /**
     * 执行单个 Step
     */
    async executeStep(step: TaskStep): Promise<void> {
        const stepId = step.id;

        // 检查是否已在执行中
        if (executorState.activeJobs.has(stepId)) {
            console.log('[SkyvernExecutor] Step already running:', stepId);
            return;
        }

        try {
            // 1. 锁定 Step
            const lockedStep = await this.lockStep(stepId);
            if (!lockedStep) {
                console.log('[SkyvernExecutor] Failed to lock step:', stepId);
                return;
            }

            console.log('[SkyvernExecutor] Step locked:', stepId, step.step_type);

            // 2. 获取账号信息（包含 skyvern_profile_id）
            const account = await this.getAccountInfo(step.xhs_account_id);
            if (!account || !account.skyvern_profile_id) {
                await this.finishStep(stepId, 'failed', {}, { error: 'Account not configured for Skyvern' });
                return;
            }

            // 3. 检查账号是否可用
            const isAvailable = await this.isAccountAvailable(step.xhs_account_id);
            if (!isAvailable) {
                await this.finishStep(stepId, 'failed', {}, { error: 'Account disabled (circuit breaker)' });
                return;
            }

            // 4. 创建 Skyvern Job
            const skyvernTaskId = await this.createSkyvernJob(step, account);
            if (!skyvernTaskId) {
                await this.finishStep(stepId, 'failed', {}, { error: 'Failed to create Skyvern job' });
                return;
            }

            executorState.activeJobs.set(stepId, skyvernTaskId);
            console.log('[SkyvernExecutor] Skyvern job created:', skyvernTaskId);

            // 5. 等待 Skyvern 完成（轮询方式）
            const result = await this.waitForSkyvernJob(skyvernTaskId, step.step_type);

            // 6. 处理结果
            if (result.status === 'completed') {
                await this.handleSuccess(step, result);
            } else {
                await this.handleFailure(step, result);
            }

        } catch (error: any) {
            console.error('[SkyvernExecutor] Execute error:', error);
            await this.finishStep(stepId, 'failed', {}, { error: error.message });
        } finally {
            executorState.activeJobs.delete(stepId);
        }
    }

    /**
     * 锁定 Step（调用 RPC）
     */
    private async lockStep(stepId: string): Promise<TaskStep | null> {
        const { data, error } = await this.supabase.rpc('lock_task_step', {
            p_step_id: stepId,
            p_lock_owner: 'SkyvernExecutor'
        });

        if (error || !data || data.length === 0) {
            return null;
        }

        return data[0];
    }

    /**
     * 获取账号信息
     */
    private async getAccountInfo(accountId: string): Promise<XhsAccount | null> {
        const { data, error } = await this.supabase
            .from('xhs_accounts')
            .select('id, xhs_user_id, execution_provider, skyvern_profile_id')
            .eq('id', accountId)
            .single();

        if (error) {
            console.error('[SkyvernExecutor] Get account error:', error.message);
            return null;
        }

        return data;
    }

    /**
     * 检查账号是否可用（circuit breaker）
     */
    private async isAccountAvailable(accountId: string): Promise<boolean> {
        const { data, error } = await this.supabase.rpc('is_account_available', {
            p_account_id: accountId
        });

        return !error && data === true;
    }

    /**
     * 创建 Skyvern Job
     */
    private async createSkyvernJob(step: TaskStep, account: XhsAccount): Promise<string | null> {
        try {
            const input = step.input_snapshot;
            const platform = step.platform || 'xiaohongshu';  // 默认小红书

            let taskConfig: any;

            if (step.step_type === 'publish') {
                // 根据平台选择不同的配置
                switch (platform) {
                    case 'x':
                        taskConfig = this.buildXPublishTaskConfig(input, account);
                        break;
                    case 'tiktok':
                        taskConfig = this.buildTikTokPublishTaskConfig(input, account);
                        break;
                    case 'instagram':
                        taskConfig = this.buildInstagramPublishTaskConfig(input, account);
                        break;
                    case 'xiaohongshu':
                    default:
                        taskConfig = this.buildPublishTaskConfig(input, account);
                        break;
                }
            } else if (step.step_type === 'fetch_metrics') {
                taskConfig = this.buildFetchMetricsTaskConfig(input, account);
            } else {
                throw new Error(`Unsupported step type: ${step.step_type}`);
            }

            const response = await fetch(`${SKYVERN_CONFIG.API_URL}/tasks`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': SKYVERN_CONFIG.API_KEY,
                },
                body: JSON.stringify(taskConfig),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Skyvern API error: ${response.status} ${errorText}`);
            }

            const result = await response.json() as { task_id: string };
            return result.task_id;

        } catch (error) {
            console.error('[SkyvernExecutor] Create job error:', error);
            return null;
        }
    }

    /**
     * 构建 Publish 任务配置 (小红书)
     */
    private buildPublishTaskConfig(input: any, account: XhsAccount): any {
        const noteType = input.note_type || 'IMAGE_TEXT';
        const isVideo = noteType === 'VIDEO' || input.video_url;

        const goalText = isVideo
            ? `在小红书发布视频笔记。标题: ${input.title}。正文: ${input.content}。视频URL: ${input.video_url}`
            : `在小红书发布图文笔记。标题: ${input.title}。正文: ${input.content}。图片数量: ${input.image_urls?.length || 0}`;

        return {
            url: isVideo
                ? 'https://creator.xiaohongshu.com/publish/publish?from=menu&target=video'
                : 'https://creator.xiaohongshu.com/publish/publish?from=menu&target=image',
            navigation_goal: goalText,
            data_extraction_goal: '提取发布成功后的笔记ID和笔记URL',
            browser_session_id: account.skyvern_profile_id,
            navigation_payload: {
                title: input.title,
                content: input.content,
                images: input.image_urls || [],
                video: input.video_url || null,
                hashtags: input.hashtags || [],
            },
            max_steps_override: 50,
            error_code_mapping: {
                'login_required': '需要重新登录',
                'content_blocked': '内容被限制发布',
            },
        };
    }

    /**
     * 构建 X (Twitter) 平台发布任务配置
     */
    private buildXPublishTaskConfig(input: any, account: XhsAccount): any {
        const hasMedia = (input.image_urls?.length > 0) || input.video_url;

        return {
            url: 'https://x.com/compose/post',
            navigation_goal: `在 X (Twitter) 发布推文。内容: ${input.content || input.title}`,
            data_extraction_goal: '提取发布成功后的推文ID和推文URL',
            browser_session_id: account.skyvern_profile_id,
            navigation_payload: {
                content: input.content || input.title,
                images: input.image_urls || [],
                video: input.video_url || null,
            },
            max_steps_override: 30,
            error_code_mapping: {
                'login_required': '需要重新登录 X',
                'rate_limited': '发布频率受限',
                'content_blocked': '内容被限制',
            },
        };
    }

    /**
     * 构建 TikTok 平台发布任务配置
     */
    private buildTikTokPublishTaskConfig(input: any, account: XhsAccount): any {
        return {
            url: 'https://www.tiktok.com/upload',
            navigation_goal: `在 TikTok 发布视频。标题: ${input.title}。描述: ${input.content}`,
            data_extraction_goal: '提取发布成功后的视频ID和视频URL',
            browser_session_id: account.skyvern_profile_id,
            navigation_payload: {
                title: input.title,
                description: input.content,
                video: input.video_url,
                hashtags: input.hashtags || [],
            },
            max_steps_override: 40,
            error_code_mapping: {
                'login_required': '需要重新登录 TikTok',
                'upload_failed': '视频上传失败',
            },
        };
    }

    /**
     * 构建 Instagram 平台发布任务配置
     */
    private buildInstagramPublishTaskConfig(input: any, account: XhsAccount): any {
        const isReel = input.video_url ? true : false;

        return {
            url: isReel
                ? 'https://www.instagram.com/reels/create/'
                : 'https://www.instagram.com/create/style/',
            navigation_goal: isReel
                ? `在 Instagram 发布 Reel 视频。描述: ${input.content}`
                : `在 Instagram 发布图片帖子。描述: ${input.content}`,
            data_extraction_goal: '提取发布成功后的帖子ID和帖子URL',
            browser_session_id: account.skyvern_profile_id,
            navigation_payload: {
                caption: input.content,
                images: input.image_urls || [],
                video: input.video_url || null,
                hashtags: input.hashtags || [],
            },
            max_steps_override: 40,
            error_code_mapping: {
                'login_required': '需要重新登录 Instagram',
                'content_blocked': '内容被限制发布',
            },
        };
    }

    /**
     * 构建 Fetch Metrics 任务配置
     */
    private buildFetchMetricsTaskConfig(input: any, account: XhsAccount): any {
        return {
            url: 'https://creator.xiaohongshu.com/statistics/overview',
            navigation_goal: `查找笔记ID为 ${input.note_id} 的数据，提取点赞数、收藏数、评论数、分享数、浏览量`,
            data_extraction_goal: 'Extract likes, collects, comments, shares, views for the specified note',
            browser_session_id: account.skyvern_profile_id,
            navigation_payload: {
                note_id: input.note_id,
                metrics_window: input.metrics_window,
            },
            max_steps_override: 30,
        };
    }

    /**
     * 等待 Skyvern Job 完成
     */
    private async waitForSkyvernJob(taskId: string, stepType: string): Promise<SkyvernJobResponse> {
        const timeout = stepType === 'publish'
            ? SKYVERN_CONFIG.PUBLISH_TIMEOUT
            : SKYVERN_CONFIG.FETCH_METRICS_TIMEOUT;

        const startTime = Date.now();
        const pollInterval = 5000;  // 5 秒

        while (Date.now() - startTime < timeout) {
            await this.sleep(pollInterval);

            try {
                const response = await fetch(`${SKYVERN_CONFIG.API_URL}/tasks/${taskId}`, {
                    headers: {
                        'x-api-key': SKYVERN_CONFIG.API_KEY,
                    },
                });

                if (!response.ok) {
                    continue;
                }

                const result = await response.json() as SkyvernJobResponse;

                // 检查是否完成
                if (['completed', 'failed', 'terminated'].includes(result.status)) {
                    return result;
                }

                console.log('[SkyvernExecutor] Job status:', taskId, result.status);

            } catch (error) {
                console.error('[SkyvernExecutor] Poll job error:', error);
            }
        }

        // 超时
        return {
            task_id: taskId,
            status: 'failed',
            error: 'Timeout waiting for Skyvern job',
        };
    }

    /**
     * 处理成功结果
     */
    private async handleSuccess(step: TaskStep, result: SkyvernJobResponse): Promise<void> {
        const output = result.output || {};

        let outputPayload: any;

        if (step.step_type === 'publish') {
            outputPayload = {
                note_id: output.note_id || output.extracted_data?.note_id,
                note_url: output.note_url || output.extracted_data?.note_url,
                published_at: new Date().toISOString(),
                raw: output,
            };

            // 冗余写回 task.metadata（供 create_fetch_metrics_steps 使用）
            if (outputPayload.note_id) {
                await this.updateTaskMetadata(step.task_id, {
                    note_id: outputPayload.note_id,
                    note_url: outputPayload.note_url,
                });
            }

        } else if (step.step_type === 'fetch_metrics') {
            const extracted = output.extracted_data || output;
            outputPayload = {
                likes: extracted.likes || 0,
                collects: extracted.collects || 0,
                comments: extracted.comments || 0,
                shares: extracted.shares || 0,
                views: extracted.views || 0,
                fetched_at: new Date().toISOString(),
            };
        }

        await this.finishStep(step.id, 'succeeded', outputPayload, null);
        await this.refreshTaskStatus(step.task_id);

        console.log('[SkyvernExecutor] Step succeeded:', step.id);
    }

    /**
     * 处理失败结果
     */
    private async handleFailure(step: TaskStep, result: SkyvernJobResponse): Promise<void> {
        const errorPayload = {
            error: result.error || 'Skyvern job failed',
            skyvern_task_id: result.task_id,
            skyvern_status: result.status,
        };

        await this.finishStep(step.id, 'failed', {}, errorPayload);
        await this.refreshTaskStatus(step.task_id);

        console.log('[SkyvernExecutor] Step failed:', step.id, result.error);
    }

    /**
     * 完成 Step（调用 RPC）
     */
    private async finishStep(
        stepId: string,
        status: string,
        outputPayload: any,
        errorPayload: any
    ): Promise<void> {
        const { error } = await this.supabase.rpc('finish_task_step', {
            p_step_id: stepId,
            p_status: status,
            p_output_payload: outputPayload || {},
            p_usage: {},
            p_provider: 'skyvern',
            p_provider_run_id: null,
            p_error: errorPayload,
        });

        if (error) {
            console.error('[SkyvernExecutor] Finish step error:', error.message);
        }
    }

    /**
     * 更新 Task metadata
     */
    private async updateTaskMetadata(taskId: string, newData: any): Promise<void> {
        const { data: task, error: fetchError } = await this.supabase
            .from('xhs_daily_tasks')
            .select('metadata')
            .eq('id', taskId)
            .single();

        if (fetchError) return;

        const updatedMetadata = { ...task.metadata, ...newData };

        await this.supabase
            .from('xhs_daily_tasks')
            .update({ metadata: updatedMetadata })
            .eq('id', taskId);
    }

    /**
     * 刷新 Task 状态
     */
    private async refreshTaskStatus(taskId: string): Promise<void> {
        await this.supabase.rpc('refresh_task_status', { p_task_id: taskId });
    }

    /**
     * Sleep 工具函数
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 导出单例
export const skyvernExecutor = new SkyvernExecutor();
