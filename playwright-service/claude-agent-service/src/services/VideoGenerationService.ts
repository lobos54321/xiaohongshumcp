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
 * 1. 文案 → Index TTS (RunningHub) → 语音音频
 * 2. 产品图片 + 语音 → N8n 工作流 → UGC 视频
 */

import { runningHubClient, RunningHubClient } from './RunningHubClient.js';
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

        // 1. 使用 Index TTS 生成语音
        console.log('[VideoGenerationService] Generating TTS using Index TTS...');
        const ttsTaskResponse = await this.runningHub.createVoiceCloneTask({
            cloneAudioUrl: voiceSampleUrl,
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

        // 提取生成的音频 URL
        const audioOutput = ttsResult.data?.outputs?.find(o =>
            o.fileType === 'audio' || o.fileName.endsWith('.mp3') || o.fileName.endsWith('.wav')
        );

        if (!audioOutput?.fileUrl) {
            throw new Error('No audio output from Index TTS');
        }

        const audioUrl = audioOutput.fileUrl;
        console.log('[VideoGenerationService] TTS audio generated:', audioUrl);

        // 估算音频时长（中文约 4 字/秒）
        const estimatedDuration = Math.ceil(script.replace(/\s/g, '').length / 4);

        // 2. 调用 RunningHub 生成数字人视频
        console.log('[VideoGenerationService] Starting RunningHub avatar video task...');
        const videoTaskResponse = await this.runningHub.createAvatarVideoTask({
            imageUrl: avatarPhotoUrl,
            audioUrl: audioUrl,
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

        // 提取视频 URL
        const videoOutput = videoResult.data?.outputs?.find(o =>
            o.fileType === 'video' || o.fileName.endsWith('.mp4')
        );

        if (!videoOutput?.fileUrl) {
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
     * 1. 文案 + 语音样本 → Index TTS → 语音音频
     * 2. 产品图片 + 语音 → N8n 工作流 → UGC 视频
     */
    private async generateUgcVideo(request: VideoGenerationRequest): Promise<VideoGenerationResult> {
        const { supabaseUuid, script, voiceSampleUrl, emotion = '', productImages } = request;

        // 检查是否有语音样本
        if (!voiceSampleUrl) {
            // 没有语音样本，暂不支持 UGC 视频
            return {
                success: false,
                error: 'UGC 视频需要语音样本，请先上传语音样本'
            };
        }

        // 1. 使用 Index TTS 生成语音
        console.log('[VideoGenerationService] Generating UGC TTS using Index TTS...');
        const ttsTaskResponse = await this.runningHub.createVoiceCloneTask({
            cloneAudioUrl: voiceSampleUrl,
            text: script,
            emotion: emotion
        });

        if (ttsTaskResponse.code !== 0) {
            throw new Error(`Index TTS task creation failed: ${ttsTaskResponse.msg}`);
        }

        // 等待 TTS 任务完成
        const ttsResult = await this.runningHub.waitForTaskCompletion(
            ttsTaskResponse.data.taskId,
            { maxWaitMs: 5 * 60 * 1000 }
        );

        // 提取生成的音频 URL
        const audioOutput = ttsResult.data?.outputs?.find(o =>
            o.fileType === 'audio' || o.fileName.endsWith('.mp3') || o.fileName.endsWith('.wav')
        );

        if (!audioOutput?.fileUrl) {
            throw new Error('No audio output from Index TTS');
        }

        const audioUrl = audioOutput.fileUrl;
        const estimatedDuration = Math.ceil(script.replace(/\s/g, '').length / 4);

        console.log('[VideoGenerationService] UGC TTS audio generated:', audioUrl);

        // 2. TODO: 调用 N8n 工作流生成 UGC 视频
        // 目前先返回音频，视频生成需要对接 N8n
        console.log('[VideoGenerationService] UGC video generation pending N8n integration');

        return {
            success: true,
            audioUrl: audioUrl,
            audioDuration: estimatedDuration,
            taskId: ttsTaskResponse.data.taskId,
            // videoUrl 需要 N8n 对接后返回
            error: 'UGC 视频生成需要对接 N8n 工作流'
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

            const audioOutput = ttsResult.data?.outputs?.find(o =>
                o.fileType === 'audio' || o.fileName.endsWith('.mp3') || o.fileName.endsWith('.wav')
            );

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
