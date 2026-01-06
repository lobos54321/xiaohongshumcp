/**
 * PublishService - 多平台发布服务
 * 
 * 管理内容发布到多个平台的任务调度和状态追踪
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 支持的平台类型
export type Platform = 'xiaohongshu' | 'tiktok' | 'instagram' | 'youtube' | 'pinterest';

// 发布方式
export type PublishMethod = 'chrome_extension' | 'skyvern';

// 发布状态
export type PublishStatus = 'pending' | 'queued' | 'publishing' | 'completed' | 'failed';

// 内容类型
export type ContentType = 'image_text' | 'video';

// 发布任务接口
export interface PublishTask {
    id?: string;
    user_id: string;
    content_id?: string;
    content_type: ContentType;
    title: string;
    content?: string;
    images?: string[];
    video_url?: string;
    tags?: string[];
    platform: Platform;
    method: PublishMethod;
    status: PublishStatus;
    platform_post_id?: string;
    published_url?: string;
    skyvern_task_id?: string;
    skyvern_run_id?: string;
    error_message?: string;
    retry_count?: number;
    scheduled_at?: Date;
    published_at?: Date;
    created_at?: Date;
    updated_at?: Date;
}

// 创建发布任务请求
export interface CreatePublishTaskRequest {
    userId: string;
    contentId?: string;
    contentType: ContentType;
    title: string;
    content?: string;
    images?: string[];
    videoUrl?: string;
    tags?: string[];
    platforms: Platform[];
    scheduledAt?: Date;
}

// Skyvern 配置
interface SkyvernConfig {
    baseUrl: string;
    apiKey: string;
}

// 平台配置
const PLATFORM_CONFIG: Record<Platform, { method: PublishMethod; enabled: boolean }> = {
    xiaohongshu: { method: 'chrome_extension', enabled: true },
    tiktok: { method: 'skyvern', enabled: true },
    instagram: { method: 'skyvern', enabled: true },
    youtube: { method: 'skyvern', enabled: false },
    pinterest: { method: 'skyvern', enabled: false }
};

export class PublishService {
    private supabase: SupabaseClient;
    private skyvernConfig: SkyvernConfig;

    constructor() {
        const supabaseUrl = process.env.SUPABASE_URL || '';
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

        this.supabase = createClient(supabaseUrl, supabaseKey);

        this.skyvernConfig = {
            baseUrl: process.env.SKYVERN_API_URL || 'http://localhost:8000/api/v1',
            apiKey: process.env.SKYVERN_API_KEY || ''
        };
    }

    /**
     * 创建发布任务
     */
    async createPublishTasks(request: CreatePublishTaskRequest): Promise<PublishTask[]> {
        const tasks: PublishTask[] = [];

        for (const platform of request.platforms) {
            const config = PLATFORM_CONFIG[platform];
            if (!config.enabled) {
                console.warn(`[PublishService] Platform ${platform} is not enabled, skipping`);
                continue;
            }

            const task: Partial<PublishTask> = {
                user_id: request.userId,
                content_id: request.contentId,
                content_type: request.contentType,
                title: request.title,
                content: request.content,
                images: request.images || [],
                video_url: request.videoUrl,
                tags: request.tags || [],
                platform,
                method: config.method,
                status: 'pending',
                scheduled_at: request.scheduledAt
            };

            const { data, error } = await this.supabase
                .from('publish_tasks')
                .insert(task)
                .select()
                .single();

            if (error) {
                console.error(`[PublishService] Failed to create task for ${platform}:`, error);
                throw error;
            }

            tasks.push(data);
        }

        return tasks;
    }

    /**
     * 获取用户的发布任务
     */
    async getPublishTasks(userId: string, options?: {
        platform?: Platform;
        status?: PublishStatus;
        limit?: number;
    }): Promise<PublishTask[]> {
        let query = this.supabase
            .from('publish_tasks')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (options?.platform) {
            query = query.eq('platform', options.platform);
        }
        if (options?.status) {
            query = query.eq('status', options.status);
        }
        if (options?.limit) {
            query = query.limit(options.limit);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[PublishService] Failed to get tasks:', error);
            throw error;
        }

        return data || [];
    }

    /**
     * 更新任务状态
     */
    async updateTaskStatus(
        taskId: string,
        status: PublishStatus,
        extraData?: Partial<PublishTask>
    ): Promise<PublishTask> {
        const updateData: Partial<PublishTask> = {
            status,
            ...extraData
        };

        if (status === 'completed') {
            updateData.published_at = new Date();
        }

        const { data, error } = await this.supabase
            .from('publish_tasks')
            .update(updateData)
            .eq('id', taskId)
            .select()
            .single();

        if (error) {
            console.error('[PublishService] Failed to update task:', error);
            throw error;
        }

        return data;
    }

    /**
     * 通过 Skyvern 发布到平台
     */
    async publishViaSkyvern(task: PublishTask): Promise<{ taskId: string; runId: string }> {
        console.log(`[PublishService] Publishing via Skyvern to ${task.platform}`);

        // 根据平台选择工作流
        const workflowId = this.getSkyvernWorkflowId(task.platform);
        if (!workflowId) {
            throw new Error(`No Skyvern workflow configured for platform: ${task.platform}`);
        }

        // 准备 Skyvern 任务数据
        const skyvernPayload = {
            workflow_id: workflowId,
            data: {
                title: task.title,
                content: task.content || '',
                images: task.images || [],
                video_url: task.video_url,
                tags: task.tags || []
            }
        };

        try {
            // 调用 Skyvern API 创建任务
            const response = await fetch(`${this.skyvernConfig.baseUrl}/workflows/${workflowId}/run`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.skyvernConfig.apiKey
                },
                body: JSON.stringify(skyvernPayload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Skyvern API error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();

            // 更新任务状态
            await this.updateTaskStatus(task.id!, 'publishing', {
                skyvern_task_id: workflowId,
                skyvern_run_id: result.workflow_run_id
            });

            return {
                taskId: workflowId,
                runId: result.workflow_run_id
            };

        } catch (error) {
            console.error(`[PublishService] Skyvern publish failed:`, error);

            await this.updateTaskStatus(task.id!, 'failed', {
                error_message: error instanceof Error ? error.message : 'Unknown error',
                retry_count: (task.retry_count || 0) + 1
            });

            throw error;
        }
    }

    /**
     * 获取 Skyvern 工作流 ID
     */
    private getSkyvernWorkflowId(platform: Platform): string | null {
        // 这些工作流 ID 需要在 Skyvern 中创建
        const workflows: Record<string, string> = {
            tiktok: process.env.SKYVERN_WORKFLOW_TIKTOK || '',
            instagram: process.env.SKYVERN_WORKFLOW_INSTAGRAM || '',
            youtube: process.env.SKYVERN_WORKFLOW_YOUTUBE || '',
            pinterest: process.env.SKYVERN_WORKFLOW_PINTEREST || ''
        };

        return workflows[platform] || null;
    }

    /**
     * 检查 Skyvern 任务状态
     */
    async checkSkyvernTaskStatus(runId: string): Promise<{
        status: 'running' | 'completed' | 'failed';
        result?: any;
        error?: string;
    }> {
        try {
            const response = await fetch(
                `${this.skyvernConfig.baseUrl}/workflows/runs/${runId}`,
                {
                    headers: {
                        'x-api-key': this.skyvernConfig.apiKey
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Failed to check Skyvern status: ${response.status}`);
            }

            const result = await response.json();

            // 映射 Skyvern 状态到我们的状态
            let status: 'running' | 'completed' | 'failed';
            if (result.status === 'completed') {
                status = 'completed';
            } else if (result.status === 'failed' || result.status === 'terminated') {
                status = 'failed';
            } else {
                status = 'running';
            }

            return {
                status,
                result: result.outputs,
                error: result.failure_reason
            };

        } catch (error) {
            console.error('[PublishService] Failed to check Skyvern status:', error);
            throw error;
        }
    }

    /**
     * 处理待发布任务队列
     */
    async processPublishQueue(): Promise<void> {
        // 获取所有 pending 状态的 Skyvern 任务
        const { data: pendingTasks, error } = await this.supabase
            .from('publish_tasks')
            .select('*')
            .eq('status', 'pending')
            .eq('method', 'skyvern')
            .order('created_at', { ascending: true })
            .limit(5);

        if (error || !pendingTasks) {
            console.error('[PublishService] Failed to get pending tasks:', error);
            return;
        }

        for (const task of pendingTasks) {
            try {
                await this.publishViaSkyvern(task);
            } catch (error) {
                console.error(`[PublishService] Failed to process task ${task.id}:`, error);
            }
        }
    }

    /**
     * 轮询检查正在进行的 Skyvern 任务
     */
    async pollSkyvernTasks(): Promise<void> {
        const { data: runningTasks, error } = await this.supabase
            .from('publish_tasks')
            .select('*')
            .eq('status', 'publishing')
            .eq('method', 'skyvern')
            .not('skyvern_run_id', 'is', null);

        if (error || !runningTasks) {
            console.error('[PublishService] Failed to get running tasks:', error);
            return;
        }

        for (const task of runningTasks) {
            try {
                const status = await this.checkSkyvernTaskStatus(task.skyvern_run_id);

                if (status.status === 'completed') {
                    await this.updateTaskStatus(task.id, 'completed', {
                        platform_post_id: status.result?.post_id,
                        published_url: status.result?.post_url
                    });
                } else if (status.status === 'failed') {
                    await this.updateTaskStatus(task.id, 'failed', {
                        error_message: status.error
                    });
                }
            } catch (error) {
                console.error(`[PublishService] Failed to poll task ${task.id}:`, error);
            }
        }
    }
}

// 导出单例
export const publishService = new PublishService();
