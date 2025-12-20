/**
 * ContentGenerationExecutor - 内容生成执行器
 * 
 * 处理 generate_copy 和 generate_video 步骤：
 * 1. 调用 Dify 生成文案 (title, text, emotion, hashtags)
 * 2. 调用 Index TTS 生成语音
 * 3. 调用 RunningHub 生成数字人视频
 * 
 * @version 1.0.0
 */

import { getSupabaseAdmin } from '../db/supabase.js';
import { contentPipelineService } from '../../services/ContentPipelineService.js';
import { ContentMode, TaskMetadata } from '../types/contracts.js';

// ==================== 配置 ====================
const CONFIG = {
    // 轮询配置
    POLL_INTERVAL_MS: 30 * 1000,  // 30 秒

    // 超时配置
    CONTENT_GEN_TIMEOUT: 15 * 60 * 1000,  // 15 分钟（Dify + TTS + Video）
};

// ==================== 类型定义 ====================
interface ContentStep {
    id: string;
    task_id: string;
    step_type: string;
    status: string;
    input_snapshot: any;
    xhs_account_id: string;
    supabase_uuid: string;
    attempt: number;
    max_attempts: number;
}

interface TaskRecord {
    id: string;
    content_mode: ContentMode;
    metadata: TaskMetadata;
}

// ==================== 状态管理 ====================
let executorState = {
    isRunning: false,
    pollTimer: null as NodeJS.Timeout | null,
    activeJobs: new Map<string, Promise<void>>(),  // stepId -> running promise
};

// ==================== 主类 ====================
class ContentGenerationExecutor {
    private supabase = getSupabaseAdmin();

    /**
     * 启动 Content Generation Executor
     */
    async start(): Promise<void> {
        if (executorState.isRunning) {
            console.log('[ContentGenerationExecutor] Already running');
            return;
        }

        executorState.isRunning = true;
        console.log('[ContentGenerationExecutor] Starting...');

        // 启动轮询
        await this.pollPendingSteps();

        // 设置定时轮询
        executorState.pollTimer = setInterval(
            () => this.pollPendingSteps(),
            CONFIG.POLL_INTERVAL_MS
        );

        console.log('[ContentGenerationExecutor] Started with poll interval:', CONFIG.POLL_INTERVAL_MS / 1000, 's');
    }

    /**
     * 停止 Content Generation Executor
     */
    stop(): void {
        console.log('[ContentGenerationExecutor] Stopping...');
        executorState.isRunning = false;

        if (executorState.pollTimer) {
            clearInterval(executorState.pollTimer);
            executorState.pollTimer = null;
        }

        console.log('[ContentGenerationExecutor] Stopped');
    }

    /**
     * 轮询待执行的内容生成 steps
     */
    async pollPendingSteps(): Promise<void> {
        if (!executorState.isRunning) return;

        try {
            // 查询 pending 的 generate_copy 或 generate_video steps
            const { data: steps, error } = await this.supabase
                .from('xhs_daily_task_steps')
                .select('*')
                .in('step_type', ['generate_copy', 'generate_video'])
                .eq('status', 'pending')
                .order('created_at', { ascending: true })
                .limit(5);  // 每次最多处理 5 个

            if (error) {
                console.error('[ContentGenerationExecutor] Query error:', error);
                return;
            }

            if (!steps || steps.length === 0) {
                return;
            }

            console.log(`[ContentGenerationExecutor] Found ${steps.length} pending steps`);

            // 并行处理（受 DifyClient 信号量限制）
            for (const step of steps) {
                // 跳过已在处理的
                if (executorState.activeJobs.has(step.id)) {
                    continue;
                }

                // 异步执行，不等待
                const jobPromise = this.executeStep(step as ContentStep);
                executorState.activeJobs.set(step.id, jobPromise);

                // 清理完成的 job
                jobPromise.finally(() => {
                    executorState.activeJobs.delete(step.id);
                });
            }

        } catch (error) {
            console.error('[ContentGenerationExecutor] Poll error:', error);
        }
    }

    /**
     * 执行单个内容生成 Step
     */
    async executeStep(step: ContentStep): Promise<void> {
        console.log(`[ContentGenerationExecutor] Executing step ${step.id}:`, step.step_type);

        try {
            // 1. 锁定 Step
            const lockedStep = await this.lockStep(step.id);
            if (!lockedStep) {
                console.log(`[ContentGenerationExecutor] Step ${step.id} already locked`);
                return;
            }

            // 2. 获取 Task 信息
            const task = await this.getTask(step.task_id);
            if (!task) {
                await this.finishStep(step.id, 'failed', null, { error: 'Task not found' });
                return;
            }

            // 3. 调用 ContentPipelineService
            const contentConfig = task.metadata.content_generation;
            if (!contentConfig) {
                await this.finishStep(step.id, 'failed', null, { error: 'No content_generation config' });
                return;
            }

            console.log(`[ContentGenerationExecutor] Generating content for task ${task.id}:`, {
                mode: contentConfig.content_mode,
                hasVoice: !!contentConfig.voice_sample_url,
                hasAvatar: !!contentConfig.avatar_photo_url,
            });

            const result = await contentPipelineService.generateContent({
                supabaseUuid: step.supabase_uuid,
                taskId: task.id,
                contentMode: contentConfig.content_mode,
                productInfo: contentConfig.product_info,
                targetAudience: contentConfig.target_audience,
                marketingGoal: contentConfig.marketing_goal,
                targetWords: contentConfig.target_words,
                avatarPhotoUrl: contentConfig.avatar_photo_url,
                voiceSampleUrl: contentConfig.voice_sample_url,
            });

            if (!result.success) {
                console.error(`[ContentGenerationExecutor] Content generation failed:`, result.error);
                await this.finishStep(step.id, 'failed', null, { error: result.error });
                return;
            }

            // 4. 更新 Task metadata with generated content
            const generatedContent: TaskMetadata['generated_content'] = {
                title: result.content?.title || '',
                text: result.content?.text || '',
                emotion: result.content?.emotion || '',
                hashtags: result.content?.hashtags || [],
                video_url: result.video?.videoUrl,
                audio_url: result.video?.audioUrl,
                // IMAGE_TEXT 模式额外字段
                image_urls: result.finalImages || [],
                golden_quotes: result.copyAnalysis?.goldenQuotes || [],
                copy_strategy: result.copyAnalysis?.strategy,
                copy_variants: result.copyVariants,
                image_decision_summary: result.imageDecision?.summary,
            };

            await this.updateTaskWithGeneratedContent(task.id, generatedContent);

            // 5. 完成 Step
            await this.finishStep(step.id, 'succeeded', {
                title: generatedContent.title,
                text_length: generatedContent.text.length,
                emotion: generatedContent.emotion,
                has_video: !!generatedContent.video_url,
                duration_ms: result.durationMs,
            }, null);

            console.log(`[ContentGenerationExecutor] Step ${step.id} completed successfully`);

        } catch (error) {
            console.error(`[ContentGenerationExecutor] Step ${step.id} error:`, error);
            await this.finishStep(step.id, 'failed', null, {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    /**
     * 锁定 Step（标记为 running）
     */
    async lockStep(stepId: string): Promise<ContentStep | null> {
        const { data, error } = await this.supabase.rpc('lock_step_for_execution', {
            p_step_id: stepId,
            p_executor: 'content_generation',
        });

        if (error || !data) {
            console.warn(`[ContentGenerationExecutor] Lock step failed:`, error);
            return null;
        }

        return data as ContentStep;
    }

    /**
     * 获取 Task 信息
     */
    async getTask(taskId: string): Promise<TaskRecord | null> {
        const { data, error } = await this.supabase
            .from('xhs_daily_tasks')
            .select('id, content_mode, metadata')
            .eq('id', taskId)
            .single();

        if (error) {
            console.error('[ContentGenerationExecutor] Get task error:', error);
            return null;
        }

        return data as TaskRecord;
    }

    /**
     * 更新 Task 的 generated_content
     */
    async updateTaskWithGeneratedContent(
        taskId: string,
        generatedContent: TaskMetadata['generated_content']
    ): Promise<void> {
        // 先获取现有 metadata
        const { data: task, error: getError } = await this.supabase
            .from('xhs_daily_tasks')
            .select('metadata')
            .eq('id', taskId)
            .single();

        if (getError) {
            console.error('[ContentGenerationExecutor] Get task metadata error:', getError);
            return;
        }

        // 合并 generated_content
        const updatedMetadata = {
            ...(task.metadata || {}),
            generated_content: generatedContent,
        };

        // 更新任务 (包括 image_urls 供 Chrome Extension 读取)
        const { error: updateError } = await this.supabase
            .from('xhs_daily_tasks')
            .update({
                metadata: updatedMetadata,
                title: generatedContent?.title || null,
                content: generatedContent?.text || null,
                image_urls: generatedContent?.image_urls || [],  // IMAGE_TEXT 的最终图片
                status: 'copy_ready',  // 标记为文案就绪
            })
            .eq('id', taskId);

        if (updateError) {
            console.error('[ContentGenerationExecutor] Update task error:', updateError);
        } else {
            console.log(`[ContentGenerationExecutor] Task ${taskId} updated with generated content`, {
                title: generatedContent?.title?.substring(0, 30),
                imageCount: generatedContent?.image_urls?.length || 0,
            });
        }
    }

    /**
     * 完成 Step
     */
    async finishStep(
        stepId: string,
        status: 'succeeded' | 'failed',
        outputPayload: any,
        errorPayload: any
    ): Promise<void> {
        const { error } = await this.supabase.rpc('finish_step', {
            p_step_id: stepId,
            p_status: status,
            p_output_payload: outputPayload,
            p_error_payload: errorPayload,
        });

        if (error) {
            console.error('[ContentGenerationExecutor] Finish step error:', error);
        }
    }

    /**
     * 获取执行器状态
     */
    getStatus(): { isRunning: boolean; activeJobs: number } {
        return {
            isRunning: executorState.isRunning,
            activeJobs: executorState.activeJobs.size,
        };
    }
}

// 导出单例
export const contentGenerationExecutor = new ContentGenerationExecutor();
