/**
 * ContentPipelineService - 内容生成管道服务 (v2)
 * 
 * 完整内容生成流程：
 * 
 * 图文模式 (IMAGE_TEXT):
 * 1. Dify 工作流 → 生成母文案
 * 2. CopyAnalyzer → 分析母文案（金句提取、变体/拆分策略）
 * 3. ImageAdaptationBrain → 图片评估与决策
 * 4. GeminiImageClient → 必要时生成图片
 * 
 * 视频模式 (AVATAR_VIDEO / UGC_VIDEO):
 * 1. Dify 工作流 → 生成文案
 * 2. Index TTS → 生成语音
 * 3. RunningHub / N8n → 生成视频
 */

import { difyClient, ContentGenerationParams, DifyContentGenerationResult } from './DifyClient.js';
import { videoGenerationService, VideoGenerationRequest, VideoGenerationResult } from './VideoGenerationService.js';
import { copyAnalyzer, CopyAnalysisResult, CopySplitResult, CopyVariantResult } from './CopyAnalyzer.js';
import { imageAdaptationBrain, ImageAnalysis, BrainDecision, GenerationRequest } from './ImageAdaptationBrain.js';
import { geminiImageClient, ImageGenerationResult } from './GeminiImageClient.js';
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
    /** 产品图片 (IMAGE_TEXT / UGC_VIDEO 模式使用) */
    productImages?: string[];
    /** 图片 AI 分析结果 */
    imageAnalyses?: ImageAnalysis[];
}

/**
 * 完整内容生成结果
 */
export interface ContentPipelineResult {
    success: boolean;
    /** 母文案生成结果 */
    content?: DifyContentGenerationResult;
    /** 文案分析结果 */
    copyAnalysis?: CopyAnalysisResult;
    /** 变体/拆分结果 */
    copyVariants?: CopyVariantResult | CopySplitResult;
    /** 图片决策结果 */
    imageDecision?: BrainDecision;
    /** 生成的图片 URL */
    generatedImages?: string[];
    /** 最终使用的图片 */
    finalImages?: string[];
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
     */
    async generateContent(request: ContentPipelineRequest): Promise<ContentPipelineResult> {
        const startTime = Date.now();

        console.log('[ContentPipelineService] Starting content pipeline:', {
            taskId: request.taskId,
            contentMode: request.contentMode,
            productInfoLength: request.productInfo.length,
            hasImages: !!request.productImages?.length,
        });

        try {
            // ========== 阶段 1：生成母文案 ==========
            console.log('[ContentPipelineService] Stage 1: Generating mother copy via Dify...');

            const contentParams: ContentGenerationParams = {
                productInfo: request.productInfo,
                targetAudience: request.targetAudience,
                marketingGoal: request.marketingGoal,
                targetWords: request.targetWords,
                platform: '小红书',
                userId: request.supabaseUuid,
                documentUrl: request.sentimentReportUrl,
            };

            console.log(`🚀 [ContentPipelineService] 发起 Dify 请求 (Task: ${request.taskId})...`);
            const motherCopy = await difyClient.generateMarketingCopy(contentParams);

            console.log('✅ [ContentPipelineService] Dify 母文案生成成功:', {
                title: motherCopy.title.substring(0, 30) + '...',
                textLength: motherCopy.text.length,
                emotion: motherCopy.emotion,
            });

            // ========== 根据模式分流 ==========

            if (request.contentMode === 'IMAGE_TEXT') {
                return this.processImageTextMode(request, motherCopy, startTime);
            } else {
                return this.processVideoMode(request, motherCopy, startTime);
            }

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
     * 处理图文模式 (IMAGE_TEXT)
     * 
     * 完整流程：母文案 → 分析 → 变体/拆分 → 图片评估 → 图片生成
     */
    private async processImageTextMode(
        request: ContentPipelineRequest,
        motherCopy: DifyContentGenerationResult,
        startTime: number
    ): Promise<ContentPipelineResult> {
        console.log('[ContentPipelineService] Processing IMAGE_TEXT mode...');

        // ========== 阶段 2：分析母文案 ==========
        console.log('[ContentPipelineService] Stage 2: Analyzing mother copy...');

        const copyAnalysis = await copyAnalyzer.analyze({
            title: motherCopy.title,
            text: motherCopy.text,
        });

        console.log('[ContentPipelineService] Copy analysis result:', {
            wordCount: copyAnalysis.wordCount,
            structureType: copyAnalysis.structureType,
            strategy: copyAnalysis.strategy,
            goldenQuotes: copyAnalysis.goldenQuotes.length,
        });

        // ========== 阶段 3：生成变体或拆分 ==========
        console.log('[ContentPipelineService] Stage 3: Generating variants/splits...');

        let copyVariants: CopyVariantResult | CopySplitResult;

        if (copyAnalysis.strategy === 'split') {
            // 深度文案 → 拆分
            copyVariants = await copyAnalyzer.split(
                { title: motherCopy.title, text: motherCopy.text },
                copyAnalysis
            );
            console.log('[ContentPipelineService] Split into', (copyVariants as CopySplitResult).segments.length, 'segments');
        } else {
            // 短/中等文案 → 变体扩展
            copyVariants = await copyAnalyzer.generateVariants(
                { title: motherCopy.title, text: motherCopy.text },
                copyAnalysis
            );
            console.log('[ContentPipelineService] Generated', (copyVariants as CopyVariantResult).variants.length, 'variants');
        }

        // ========== 阶段 4：图片适配决策 ==========
        console.log('[ContentPipelineService] Stage 4: Image adaptation decision...');

        const imageDecision = await imageAdaptationBrain.analyze({
            images: request.imageAnalyses || [],
            copyTitle: motherCopy.title,
            copyText: motherCopy.text,
            productInfo: request.productInfo,
        });

        console.log('[ContentPipelineService] Image decision:', imageDecision.summary);

        // ========== 阶段 5：生成缺失图片 ==========
        let generatedImages: string[] = [];
        let finalImages: string[] = [];

        if (imageDecision.generationRequests.length > 0) {
            console.log('[ContentPipelineService] Stage 5: Generating', imageDecision.generationRequests.length, 'images via Gemini...');

            generatedImages = await this.generateImages(
                imageDecision.generationRequests,
                request.supabaseUuid
            );
        }

        // 合并可用图片和生成的图片
        finalImages = [
            ...imageDecision.usableImages.map(img => img.imageUrl),
            ...generatedImages,
        ];

        console.log('[ContentPipelineService] Final images:', finalImages.length);

        return {
            success: true,
            content: motherCopy,
            copyAnalysis,
            copyVariants,
            imageDecision,
            generatedImages,
            finalImages,
            durationMs: Date.now() - startTime,
        };
    }

    /**
     * 处理视频模式 (AVATAR_VIDEO / UGC_VIDEO)
     */
    private async processVideoMode(
        request: ContentPipelineRequest,
        motherCopy: DifyContentGenerationResult,
        startTime: number
    ): Promise<ContentPipelineResult> {
        console.log('[ContentPipelineService] Processing video mode:', request.contentMode);

        // 检查必要的资源
        if (request.contentMode === 'AVATAR_VIDEO' && !request.avatarPhotoUrl) {
            return {
                success: false,
                content: motherCopy,
                error: '数字人视频模式需要上传数字人照片',
                durationMs: Date.now() - startTime,
            };
        }

        if (!request.voiceSampleUrl) {
            return {
                success: false,
                content: motherCopy,
                error: '视频模式需要语音样本进行 TTS',
                durationMs: Date.now() - startTime,
            };
        }

        // 生成视频
        const videoRequest: VideoGenerationRequest = {
            supabaseUuid: request.supabaseUuid,
            taskId: request.taskId,
            contentMode: request.contentMode,
            script: motherCopy.text,
            avatarPhotoUrl: request.avatarPhotoUrl,
            voiceSampleUrl: request.voiceSampleUrl,
            emotion: motherCopy.emotion,
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
            content: motherCopy,
            video: videoResult,
            error: videoResult.error,
            durationMs: Date.now() - startTime,
        };
    }

    /**
     * 通过 Gemini 生成图片
     */
    private async generateImages(
        requests: GenerationRequest[],
        supabaseUuid: string
    ): Promise<string[]> {
        const generatedUrls: string[] = [];

        for (const req of requests) {
            console.log('[ContentPipelineService] Generating image:', req.type, '-', req.reason);

            let result: ImageGenerationResult;

            if (req.referenceImageUrl) {
                result = await geminiImageClient.generateWithReference(
                    req.prompt,
                    req.referenceImageUrl
                );
            } else {
                result = await geminiImageClient.generateImage({
                    prompt: req.prompt,
                });
            }

            if (result.success && result.images.length > 0) {
                // 上传到 Supabase Storage
                const image = result.images[0];
                if (image.base64Data) {
                    const url = await geminiImageClient.uploadToStorage(
                        image.base64Data,
                        image.mimeType,
                        supabaseUuid
                    );
                    if (url) {
                        generatedUrls.push(url);
                    }
                }
            } else {
                console.warn('[ContentPipelineService] Image generation failed:', result.error);
            }
        }

        return generatedUrls;
    }

    /**
     * 仅生成文案（不生成视频）
     */
    async generateContentOnly(params: ContentGenerationParams): Promise<DifyContentGenerationResult> {
        return difyClient.generateMarketingCopy(params);
    }

    /**
     * 使用已有文案生成视频
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
     * 获取用户的资产信息
     */
    async getUserAssets(supabaseUuid: string): Promise<{
        avatarPhotoUrl?: string;
        voiceSampleUrl?: string;
        productImages?: string[];
        imageAnalyses?: ImageAnalysis[];
        hasCompleteAssets: boolean;
    }> {
        try {
            const { data, error } = await supabaseAdmin
                .from('xhs_user_profiles')
                .select('avatar_photo_url, voice_sample_url, material_images, material_analysis')
                .eq('supabase_uuid', supabaseUuid)
                .single();

            if (error || !data) {
                return { hasCompleteAssets: false };
            }

            // 解析图片分析结果
            let imageAnalyses: ImageAnalysis[] | undefined;
            if (data.material_images && data.material_analysis) {
                // 尝试将 material_analysis 解析为图片分析结果
                imageAnalyses = this.parseImageAnalyses(
                    data.material_images,
                    data.material_analysis
                );
            }

            return {
                avatarPhotoUrl: data.avatar_photo_url || undefined,
                voiceSampleUrl: data.voice_sample_url || undefined,
                productImages: data.material_images || undefined,
                imageAnalyses,
                hasCompleteAssets: !!(data.avatar_photo_url && data.voice_sample_url),
            };
        } catch {
            return { hasCompleteAssets: false };
        }
    }

    /**
     * 解析图片分析结果
     */
    private parseImageAnalyses(
        imageUrls: string[],
        analysisText: string
    ): ImageAnalysis[] {
        // 简单解析，后续可以根据实际 AI 分析格式优化
        return imageUrls.map((url, index) => ({
            imageUrl: url,
            description: `图片 ${index + 1} 分析结果`, // 需要从 analysisText 提取
            mainElements: [],
            hasProduct: true, // 默认假设有产品
            hasPerson: false,
            sceneType: 'product' as const,
        }));
    }

    /**
     * 保存生成的内容到数据库
     */
    async saveGeneratedContent(
        taskId: string,
        result: ContentPipelineResult
    ): Promise<void> {
        try {
            await supabaseAdmin
                .from('xhs_generated_content')
                .upsert({
                    task_id: taskId,
                    title: result.content?.title,
                    text: result.content?.text,
                    emotion: result.content?.emotion,
                    hashtags: result.content?.hashtags,
                    golden_quotes: result.copyAnalysis?.goldenQuotes,
                    final_images: result.finalImages,
                    video_url: result.video?.videoUrl,
                    audio_url: result.video?.audioUrl,
                    audio_duration: result.video?.audioDuration,
                    generated_at: new Date().toISOString(),
                }, {
                    onConflict: 'task_id',
                });

            console.log('[ContentPipelineService] Content saved to database:', taskId);
        } catch (error) {
            console.error('[ContentPipelineService] Failed to save content:', error);
        }
    }
}

// 单例导出
export const contentPipelineService = new ContentPipelineService();
