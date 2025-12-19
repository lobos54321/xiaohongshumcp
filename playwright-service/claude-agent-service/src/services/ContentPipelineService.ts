/**
 * ContentPipelineService - 内容生成管道服务
 * 
 * 完整内容生成流程：
 * 1. Dify 工作流 → 生成文案 (title, text, emotion, hashtags)
 * 2. Index TTS → 生成语音
 * 3. RunningHub 数字人 / N8n UGC 工作流 → 生成视频
 * 4. 返回完整内容包（文案 + 音频 + 视频）
 */

import { difyClient, ContentGenerationParams, DifyContentGenerationResult } from './DifyClient.js';
import { videoGenerationService, VideoGenerationRequest, VideoGenerationResult } from './VideoGenerationService.js';
import { ContentMode } from '../orchestrator/types/contracts.js';
import { supabaseAdmin } from '../orchestrator/db/supabase.js';

// ============ 类型定义 ============

/**
 * 完整内容生成请求
 */
export interface ContentPipelineRequest {
    /** Supabase 用户 UUID */
    supabaseUuid: string;
    /** 任务 ID */
    taskId: string;
    /** 内容模式 */
    contentMode: ContentMode;
    /** 产品信息 */
    productInfo: string;
    /** 目标用户群体 */
    targetAudience?: string;
    /** 营销目标 */
    marketingGoal?: string;
    /** 目标字数 */
    targetWords?: number;
    /** 舆情报告 URL (可选，用于 Dify 参考) */
    sentimentReportUrl?: string;
    /** 数字人照片 URL (AVATAR_VIDEO 模式需要) */
    avatarPhotoUrl?: string;
    /** 语音样本 URL */
    voiceSampleUrl?: string;
    /** 产品图片 (UGC_VIDEO 模式需要) */
    productImages?: string[];
}

/**
 * 完整内容生成结果
 */
export interface ContentPipelineResult {
    success: boolean;
    /** 文案生成结果 */
    content?: DifyContentGenerationResult;
    /** 视频生成结果 */
    video?: VideoGenerationResult;
    /** 错误信息 */
    error?: string;
    /** 生成耗时（毫秒） */
    durationMs?: number;
}

// ============ ContentPipelineService 实现 ============

export class ContentPipelineService {

    /**
     * 执行完整内容生成管道
     * 
     * @param request 内容生成请求
     * @returns 完整内容结果（文案 + 视频）
     */
    async generateContent(request: ContentPipelineRequest): Promise<ContentPipelineResult> {
        const startTime = Date.now();

        console.log('[ContentPipelineService] Starting content pipeline:', {
            taskId: request.taskId,
            contentMode: request.contentMode,
            productInfoLength: request.productInfo.length,
        });

        try {
            // ========== 阶段 1：生成文案 ==========
            console.log('[ContentPipelineService] Stage 1: Generating marketing copy via Dify...');

            const contentParams: ContentGenerationParams = {
                productInfo: request.productInfo,
                targetAudience: request.targetAudience,
                marketingGoal: request.marketingGoal,
                targetWords: request.targetWords,
                platform: '小红书',
                userId: request.supabaseUuid,
                documentUrl: request.sentimentReportUrl,
            };

            const contentResult = await difyClient.generateMarketingCopy(contentParams);

            console.log('[ContentPipelineService] Content generated:', {
                title: contentResult.title.substring(0, 30) + '...',
                textLength: contentResult.text.length,
                emotion: contentResult.emotion,
                hashtags: contentResult.hashtags.length,
            });

            // ========== 阶段 2：处理不同内容模式 ==========

            // 如果是图文模式，直接返回文案
            if (request.contentMode === 'IMAGE_TEXT') {
                console.log('[ContentPipelineService] IMAGE_TEXT mode - returning content only');
                return {
                    success: true,
                    content: contentResult,
                    durationMs: Date.now() - startTime,
                };
            }

            // ========== 阶段 3：生成视频 ==========
            console.log('[ContentPipelineService] Stage 2: Generating video...');

            // 检查必要的资源
            if (request.contentMode === 'AVATAR_VIDEO' && !request.avatarPhotoUrl) {
                return {
                    success: false,
                    content: contentResult,
                    error: '数字人视频模式需要上传数字人照片',
                    durationMs: Date.now() - startTime,
                };
            }

            if (!request.voiceSampleUrl) {
                return {
                    success: false,
                    content: contentResult,
                    error: '视频模式需要语音样本进行 TTS',
                    durationMs: Date.now() - startTime,
                };
            }

            const videoRequest: VideoGenerationRequest = {
                supabaseUuid: request.supabaseUuid,
                taskId: request.taskId,
                contentMode: request.contentMode,
                script: contentResult.text,
                avatarPhotoUrl: request.avatarPhotoUrl,
                voiceSampleUrl: request.voiceSampleUrl,
                emotion: contentResult.emotion,  // 使用 Dify 推断的情感
                productImages: request.productImages,
            };

            const videoResult = await videoGenerationService.generateVideo(videoRequest);

            console.log('[ContentPipelineService] Video generation result:', {
                success: videoResult.success,
                hasVideoUrl: !!videoResult.videoUrl,
                hasAudioUrl: !!videoResult.audioUrl,
            });

            return {
                success: videoResult.success,
                content: contentResult,
                video: videoResult,
                error: videoResult.error,
                durationMs: Date.now() - startTime,
            };

        } catch (error) {
            console.error('[ContentPipelineService] Pipeline failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                durationMs: Date.now() - startTime,
            };
        }
    }

    /**
     * 仅生成文案（不生成视频）
     */
    async generateContentOnly(params: ContentGenerationParams): Promise<DifyContentGenerationResult> {
        return difyClient.generateMarketingCopy(params);
    }

    /**
     * 使用已有文案生成视频
     * 
     * 用于文案已经生成/编辑过，只需要生成视频的场景
     */
    async generateVideoFromContent(
        supabaseUuid: string,
        taskId: string,
        contentMode: ContentMode,
        content: DifyContentGenerationResult,
        options: {
            avatarPhotoUrl?: string;
            voiceSampleUrl?: string;
            productImages?: string[];
        }
    ): Promise<VideoGenerationResult> {

        if (!options.voiceSampleUrl) {
            return { success: false, error: '需要语音样本' };
        }

        const videoRequest: VideoGenerationRequest = {
            supabaseUuid,
            taskId,
            contentMode,
            script: content.text,
            avatarPhotoUrl: options.avatarPhotoUrl,
            voiceSampleUrl: options.voiceSampleUrl,
            emotion: content.emotion,
            productImages: options.productImages,
        };

        return videoGenerationService.generateVideo(videoRequest);
    }

    /**
     * 获取用户的资产信息（数字人照片、语音样本等）
     */
    async getUserAssets(supabaseUuid: string): Promise<{
        avatarPhotoUrl?: string;
        voiceSampleUrl?: string;
        hasCompleteAssets: boolean;
    }> {
        try {
            const { data, error } = await supabaseAdmin
                .from('xhs_user_profiles')
                .select('avatar_photo_url, voice_sample_url')
                .eq('supabase_uuid', supabaseUuid)
                .single();

            if (error || !data) {
                return { hasCompleteAssets: false };
            }

            return {
                avatarPhotoUrl: data.avatar_photo_url || undefined,
                voiceSampleUrl: data.voice_sample_url || undefined,
                hasCompleteAssets: !!(data.avatar_photo_url && data.voice_sample_url),
            };
        } catch {
            return { hasCompleteAssets: false };
        }
    }

    /**
     * 保存生成的内容到数据库
     */
    async saveGeneratedContent(
        taskId: string,
        content: DifyContentGenerationResult,
        video?: VideoGenerationResult
    ): Promise<void> {
        try {
            await supabaseAdmin
                .from('xhs_generated_content')
                .upsert({
                    task_id: taskId,
                    title: content.title,
                    text: content.text,
                    emotion: content.emotion,
                    hashtags: content.hashtags,
                    video_url: video?.videoUrl,
                    audio_url: video?.audioUrl,
                    audio_duration: video?.audioDuration,
                    generated_at: new Date().toISOString(),
                }, {
                    onConflict: 'task_id',
                });

            console.log('[ContentPipelineService] Content saved to database:', taskId);
        } catch (error) {
            console.error('[ContentPipelineService] Failed to save content:', error);
            // 不抛出错误，保存失败不应该影响主流程
        }
    }
}

// 单例导出
export const contentPipelineService = new ContentPipelineService();
