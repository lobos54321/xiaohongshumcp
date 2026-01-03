/**
 * Video Generation Service
 * 
 * 协调视频生成流程：
 * 
 * AVATAR_VIDEO 流程 (数字人视频):
 * 1. 文案 → Index TTS (RunningHub) → 语音音频
 * 2. 数字人照片 + 语音 → RunningHub 数字人 → 视频
 * 
 * UGC_VIDEO 流程:
 * 1. 产品图片 + 描述 → N8n 工作流 → UGC 视频 (含 Veo3 AI 语音)
 */

import { runningHubClient, RunningHubClient } from './RunningHubClient.js';
import { n8nUgcClient } from './N8nUgcClient.js';
import { supabaseAdmin } from '../orchestrator/db/supabase.js';
import { ContentMode } from '../orchestrator/types/contracts.js';


export interface VideoGenerationRequest {
    supabaseUuid: string;
    taskId: string;
    contentMode: ContentMode;
    script: string;          // 视频脚本文案
    avatarPhotoUrl?: string; // 数字人照片 (AVATAR_VIDEO 需要)
    voiceSampleUrl?: string; // 语音样本 URL (用于 Index TTS 克隆)
    emotion?: string;        // 情感描述: "害羞的", "兴奋的", "严肃的"
    productImages?: string[]; // 产品图片 (UGC_VIDEO 需要)
    ugcParams?: {
        gender?: 'male' | 'female';
        language?: string;
        duration?: number;
    };
}

export interface VideoGenerationResult {
    success: boolean;
    videoUrl?: string;
    audioUrl?: string;
    audioDuration?: number;
    taskId?: string;
    error?: string;
}

export class VideoGenerationService {
    private runningHub: RunningHubClient;

    constructor() {
        this.runningHub = runningHubClient;
    }

    /**
     * 从 URL 提取文件名
     */
    private extractFileName(url: string): string {
        if (!url) return '';
        if (url.startsWith('http://') || url.startsWith('https://')) {
            const urlParts = url.split('/');
            return urlParts[urlParts.length - 1].split('?')[0];
        }
        return url;
    }

    /**
     * 生成视频（根据内容模式）
     */
    async generateVideo(request: VideoGenerationRequest): Promise<VideoGenerationResult> {
        const { contentMode } = request;

        console.log('[VideoGenerationService] Starting video generation:', {
            contentMode,
            taskId: request.taskId,
            scriptLength: request.script.length
        });

        try {
            switch (contentMode) {
                case 'AVATAR_VIDEO':
                    return await this.generateAvatarVideo(request);
                case 'UGC_VIDEO':
                    return await this.generateUgcVideo(request);
                default:
                    return {
                        success: false,
                        error: `Unsupported content mode for video: ${contentMode}`
                    };
            }
        } catch (error) {
            console.error('[VideoGenerationService] Video generation failed:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * 生成数字人视频 (AVATAR_VIDEO)
     * 
     * 流程：
     * 1. 文案 + 语音样本 → Index TTS → 语音音频
     * 2. 数字人照片 + 语音 → RunningHub → 视频
     */
    private async generateAvatarVideo(request: VideoGenerationRequest): Promise<VideoGenerationResult> {
        const { supabaseUuid, script, avatarPhotoUrl, voiceSampleUrl, emotion = '' } = request;

        if (!avatarPhotoUrl) {
            return { success: false, error: '缺少数字人照片' };
        }

        if (!voiceSampleUrl) {
            return { success: false, error: '缺少语音样本' };
        }

        // 1. 先把语音样本上传到 RunningHub
        console.log('[VideoGenerationService] Uploading voice sample to RunningHub...');
        let uploadedVoiceFileName: string;
        try {
            uploadedVoiceFileName = await this.runningHub.uploadFileFromUrl(voiceSampleUrl);
            console.log(`[VideoGenerationService] Voice sample uploaded: ${uploadedVoiceFileName}`);
        } catch (uploadError) {
            console.error('[VideoGenerationService] Failed to upload voice sample:', uploadError);
            throw new Error(`上传语音样本失败: ${uploadError instanceof Error ? uploadError.message : uploadError}`);
        }

        // 2. 使用 Index TTS 生成语音
        console.log('[VideoGenerationService] Generating TTS using Index TTS...');
        const ttsTaskResponse = await this.runningHub.createVoiceCloneTask({
            cloneAudioUrl: uploadedVoiceFileName,  // 使用上传后的文件名
            text: script,
            emotion: emotion
        });

        if (ttsTaskResponse.code !== 0) {
            throw new Error(`Index TTS task creation failed: ${ttsTaskResponse.msg}`);
        }

        // 等待 TTS 任务完成
        console.log('[VideoGenerationService] Waiting for Index TTS completion...');
        const ttsResult = await this.runningHub.waitForTaskCompletion(
            ttsTaskResponse.data.taskId,
            { maxWaitMs: 5 * 60 * 1000 }  // TTS 最多等待 5 分钟
        );

        // 提取生成的音频 URL (data 是数组)
        const audioOutput = Array.isArray(ttsResult.data)
            ? ttsResult.data.find(o =>
                o.fileType === 'flac' || o.fileType === 'audio' || o.fileType === 'mp3' || o.fileType === 'wav' ||
                o.fileUrl?.endsWith('.flac') || o.fileUrl?.endsWith('.mp3') || o.fileUrl?.endsWith('.wav')
            )
            : undefined;

        if (!audioOutput?.fileUrl) {
            console.error('[VideoGenerationService] TTS result data:', JSON.stringify(ttsResult.data));
            throw new Error('No audio output from Index TTS');
        }

        const audioUrl = audioOutput.fileUrl;
        console.log('[VideoGenerationService] TTS audio generated:', audioUrl);

        // 估算音频时长（中文约 4 字/秒）
        const estimatedDuration = Math.ceil(script.replace(/\s/g, '').length / 4);

        // 3. 上传数字人照片到 RunningHub
        console.log('[VideoGenerationService] Uploading avatar photo to RunningHub...');
        let uploadedAvatarFileName: string;
        try {
            uploadedAvatarFileName = await this.runningHub.uploadFileFromUrl(avatarPhotoUrl);
            console.log(`[VideoGenerationService] Avatar photo uploaded: ${uploadedAvatarFileName}`);
        } catch (uploadError) {
            console.error('[VideoGenerationService] Failed to upload avatar photo:', uploadError);
            throw new Error(`上传数字人照片失败: ${uploadError instanceof Error ? uploadError.message : uploadError}`);
        }

        // 4. TTS 生成的音频在 CDN 上，需要重新上传到 RunningHub 输入存储
        console.log('[VideoGenerationService] Re-uploading TTS audio to RunningHub input storage...');
        let uploadedAudioFileName: string;
        try {
            uploadedAudioFileName = await this.runningHub.uploadFileFromUrl(audioUrl);
            console.log(`[VideoGenerationService] TTS audio re-uploaded: ${uploadedAudioFileName}`);
        } catch (uploadError) {
            console.error('[VideoGenerationService] Failed to re-upload TTS audio:', uploadError);
            throw new Error(`重新上传 TTS 音频失败: ${uploadError instanceof Error ? uploadError.message : uploadError}`);
        }

        // 5. 调用 RunningHub 生成数字人视频
        console.log('[VideoGenerationService] Starting RunningHub avatar video task...');
        const videoTaskResponse = await this.runningHub.createAvatarVideoTask({
            imageUrl: uploadedAvatarFileName,   // 使用上传后的照片文件名
            audioUrl: uploadedAudioFileName,    // 使用重新上传后的音频文件名
            audioStartTime: 0,
            audioEndTime: estimatedDuration
        });

        if (videoTaskResponse.code !== 0) {
            throw new Error(`RunningHub avatar video task creation failed: ${videoTaskResponse.msg}`);
        }

        // 3. 等待视频生成完成
        console.log('[VideoGenerationService] Waiting for RunningHub video completion...');
        const videoResult = await this.runningHub.waitForTaskCompletion(
            videoTaskResponse.data.taskId,
            { maxWaitMs: 10 * 60 * 1000 }  // 视频最多等待 10 分钟
        );

        // 提取视频 URL (data 是数组)
        const videoOutput = Array.isArray(videoResult.data)
            ? videoResult.data.find((o: { fileType: string; fileUrl?: string }) =>
                o.fileType === 'video' || o.fileType === 'mp4' ||
                o.fileUrl?.endsWith('.mp4') || o.fileUrl?.endsWith('.webm')
            )
            : undefined;

        if (!videoOutput?.fileUrl) {
            console.error('[VideoGenerationService] Video result data:', JSON.stringify(videoResult.data));
            throw new Error('No video output from RunningHub');
        }

        console.log('[VideoGenerationService] Avatar video generated:', videoOutput.fileUrl);

        return {
            success: true,
            videoUrl: videoOutput.fileUrl,
            audioUrl: audioUrl,
            audioDuration: estimatedDuration,
            taskId: videoTaskResponse.data.taskId
        };
    }

    /**
     * 生成 UGC 视频 (UGC_VIDEO)
     * 
     * 流程：
     * 产品图片 + 描述 → N8n 工作流 → UGC 视频 (含 Veo3 AI 语音)
     * 
     * N8n 工作流内部处理:
     * 1. Nano Banana 将产品放入 UGC 场景
     * 2. Veo3 生成视频片段（含 AI 语音）
     * 3. FFmpeg 合并视频
     */
    private async generateUgcVideo(request: VideoGenerationRequest): Promise<VideoGenerationResult> {
        const { taskId, script, productImages, ugcParams } = request;

        // 检查是否有产品图片
        if (!productImages || productImages.length === 0) {
            return {
                success: false,
                error: 'UGC 视频需要至少一张产品图片'
            };
        }

        // 使用第一张产品图片作为主图
        const primaryImage = productImages[0];

        console.log('[VideoGenerationService] Calling N8n UGC workflow:', {
            taskId,
            imageUrl: primaryImage,
            gender: ugcParams?.gender || 'female',
            duration: ugcParams?.duration || 16,
            language: ugcParams?.language || 'zh-CN',
        });

        // 调用 N8n UGC 工作流
        const result = await n8nUgcClient.generateUgcVideo({
            taskId,
            productDescription: script,
            productImageUrl: primaryImage,
            gender: ugcParams?.gender || 'female',
            duration: ugcParams?.duration || 16,
            language: (ugcParams?.language as 'zh-CN' | 'en-US' | 'ja-JP') || 'zh-CN',
        });

        if (!result.success) {
            return {
                success: false,
                error: result.error || 'N8n UGC 工作流执行失败',
            };
        }

        console.log('[VideoGenerationService] UGC video generated:', result.videoUrl);

        return {
            success: true,
            videoUrl: result.videoUrl,
            taskId: result.sessionId,
        };
    }

    /**
     * 仅生成语音（不生成视频）
     * 
     * 用于需要先预览语音或单独 TTS 的场景
     */
    async generateAudio(params: {
        supabaseUuid: string;
        script: string;
        voiceSampleUrl: string;
        emotion?: string;
    }): Promise<{
        success: boolean;
        audioUrl?: string;
        duration?: number;
        error?: string;
    }> {
        const { script, voiceSampleUrl, emotion = '' } = params;

        try {
            // 使用 Index TTS 生成语音
            const ttsTaskResponse = await this.runningHub.createVoiceCloneTask({
                cloneAudioUrl: voiceSampleUrl,
                text: script,
                emotion
            });

            if (ttsTaskResponse.code !== 0) {
                throw new Error(`Index TTS failed: ${ttsTaskResponse.msg}`);
            }

            // 等待完成
            const ttsResult = await this.runningHub.waitForTaskCompletion(
                ttsTaskResponse.data.taskId,
                { maxWaitMs: 5 * 60 * 1000 }
            );

            const audioOutput = Array.isArray(ttsResult.data)
                ? ttsResult.data.find((o: { fileType: string; fileUrl?: string }) =>
                    o.fileType === 'flac' || o.fileType === 'audio' || o.fileType === 'mp3' || o.fileType === 'wav' ||
                    o.fileUrl?.endsWith('.flac') || o.fileUrl?.endsWith('.mp3') || o.fileUrl?.endsWith('.wav')
                )
                : undefined;

            if (!audioOutput?.fileUrl) {
                throw new Error('No audio output');
            }

            return {
                success: true,
                audioUrl: audioOutput.fileUrl,
                duration: Math.ceil(script.replace(/\s/g, '').length / 4)
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}

// 单例导出
export const videoGenerationService = new VideoGenerationService();
