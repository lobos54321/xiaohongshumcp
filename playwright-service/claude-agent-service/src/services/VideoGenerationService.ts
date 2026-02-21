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
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, unlink, readFile } from 'fs/promises';

// 设置 ffmpeg 路径
ffmpeg.setFfmpegPath(ffmpegPath.path);


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
    // 进度回调
    onProgress?: (stage: 'tts_started' | 'tts_completed' | 'video_started' | 'video_progress' | 'video_completed', data?: any) => void;
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
     * 从用户 ID 字符串中提取标准 UUID
     * 例如: "user_9dee489189a644ee8fe869097846e97d_prome" -> "9dee4891-89a6-44ee-8fe8-69097846e97d"
     */
    private extractUuid(userId: string): string | null {
        // 移除前缀和后缀
        let cleaned = userId.replace(/^user_/, '').replace(/_prome$/, '');

        // 如果是 32 个字符（没有连字符的 UUID），添加连字符
        if (/^[a-f0-9]{32}$/i.test(cleaned)) {
            cleaned = `${cleaned.slice(0, 8)}-${cleaned.slice(8, 12)}-${cleaned.slice(12, 16)}-${cleaned.slice(16, 20)}-${cleaned.slice(20)}`;
        }

        // 验证是否为有效 UUID 格式
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(cleaned)) {
            return cleaned.toLowerCase();
        }

        return null;
    }

    /**
     * 格式化时间（秒 -> MM:SS 或 HH:MM:SS）
     */
    private formatTime(seconds: number): string {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
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
     * 将 FLAC 音频转换为 MP3 格式（浏览器兼容性）
     */
    private async convertFlacToMp3(flacBuffer: Buffer): Promise<Buffer> {
        const inputPath = join(tmpdir(), `input_${Date.now()}.flac`);
        const outputPath = join(tmpdir(), `output_${Date.now()}.mp3`);

        try {
            // 写入临时 FLAC 文件
            await writeFile(inputPath, flacBuffer);

            // 使用 ffmpeg 转换
            await new Promise<void>((resolve, reject) => {
                ffmpeg(inputPath)
                    .audioBitrate('192k')
                    .audioCodec('libmp3lame')
                    .output(outputPath)
                    .on('end', () => resolve())
                    .on('error', (err: Error) => reject(err))
                    .run();
            });

            // 读取 MP3 文件
            const mp3Buffer = await readFile(outputPath);

            // 清理临时文件
            await unlink(inputPath).catch(() => { });
            await unlink(outputPath).catch(() => { });

            return Buffer.from(mp3Buffer);
        } catch (error) {
            // 清理临时文件（如果存在）
            await unlink(inputPath).catch(() => { });
            await unlink(outputPath).catch(() => { });
            throw error;
        }
    }

    /**
     * 下载文件并上传到 Supabase Storage（永久存储 + 解决 CORS）
     */
    private async uploadToSupabaseStorage(
        sourceUrl: string,
        userId: string,
        fileType: 'audio' | 'video'
    ): Promise<string | null> {
        try {
            console.log(`[VideoGenerationService] Downloading ${fileType} from: ${sourceUrl}`);

            // 1. 下载文件
            const response = await fetch(sourceUrl);
            if (!response.ok) {
                throw new Error(`Failed to download: ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            let buffer = Buffer.from(arrayBuffer);
            let ext = sourceUrl.split('.').pop()?.split('?')[0] || (fileType === 'video' ? 'mp4' : 'flac');
            let contentType = fileType === 'video' ? 'video/mp4' : 'audio/flac';

            // 2. 如果是 FLAC 音频，转换为 MP3（浏览器兼容性更好）
            if (fileType === 'audio' && ext.toLowerCase() === 'flac') {
                console.log('[VideoGenerationService] Converting FLAC to MP3 for browser compatibility...');
                try {
                    buffer = await this.convertFlacToMp3(buffer) as Buffer<ArrayBuffer>;
                    ext = 'mp3';
                    contentType = 'audio/mpeg';
                    console.log('[VideoGenerationService] ✅ FLAC converted to MP3 successfully');
                } catch (conversionError) {
                    console.warn('[VideoGenerationService] FLAC to MP3 conversion failed, using original:', conversionError);
                    // 继续使用原始 FLAC
                }
            }

            // 3. 生成文件路径
            const timestamp = Date.now();
            const fileName = `${fileType}_${timestamp}.${ext}`;
            const filePath = `${userId}/${fileName}`;

            // 4. 上传到 Supabase Storage
            const bucketName = 'avatar-videos';
            const { data, error } = await supabaseAdmin.storage
                .from(bucketName)
                .upload(filePath, buffer, {
                    contentType,
                    upsert: true
                });

            if (error) {
                console.error(`[VideoGenerationService] Storage upload error:`, error);
                return null;
            }

            // 4. 获取公开 URL
            const { data: publicUrl } = supabaseAdmin.storage
                .from(bucketName)
                .getPublicUrl(filePath);

            console.log(`[VideoGenerationService] ✅ Uploaded to Supabase: ${publicUrl.publicUrl}`);
            return publicUrl.publicUrl;

        } catch (error) {
            console.error(`[VideoGenerationService] Upload to Supabase failed:`, error);
            return null;
        }
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
        const { supabaseUuid, script, avatarPhotoUrl, voiceSampleUrl, emotion = '', onProgress } = request;

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

        const rawAudioUrl = audioOutput.fileUrl;
        console.log('[VideoGenerationService] TTS audio generated:', rawAudioUrl);

        // 🔥 立即上传音频到 Supabase（FLAC→MP3 转换 + 永久存储）
        console.log('[VideoGenerationService] Uploading TTS audio to Supabase (with FLAC→MP3 conversion)...');
        const supabaseAudioUrl = await this.uploadToSupabaseStorage(rawAudioUrl, supabaseUuid, 'audio');
        const audioUrl = supabaseAudioUrl || rawAudioUrl;  // 用 Supabase URL（如有）
        console.log('[VideoGenerationService] Audio URL for frontend:', audioUrl);

        // 🔥 通知 TTS 完成（现在发送的是可播放的 Supabase MP3 URL）
        if (onProgress) {
            onProgress('tts_completed', { audioUrl });
        }

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

        // 🔥 通知视频渲染开始
        if (onProgress) {
            onProgress('video_started', { taskId: videoTaskResponse.data.taskId });
        }

        // 3. 等待视频生成完成
        console.log('[VideoGenerationService] Waiting for RunningHub video completion...');
        const videoResult = await this.runningHub.waitForTaskCompletion(
            videoTaskResponse.data.taskId,
            {
                maxWaitMs: 3 * 60 * 60 * 1000,  // 视频最多等待 3 小时
                onProgress: onProgress ? (data) => {
                    onProgress('video_progress', {
                        elapsed: data.elapsed,
                        elapsedFormatted: this.formatTime(data.elapsed),
                        status: data.status
                    });
                } : undefined
            }
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

        // 🔥 上传视频到 Supabase Storage（永久存储 + 解决 CORS）
        // 注意：音频已经在 TTS 完成后上传了，这里只需要上传视频
        console.log('[VideoGenerationService] Uploading video to Supabase Storage...');
        const supabaseVideoUrl = await this.uploadToSupabaseStorage(videoOutput.fileUrl, supabaseUuid, 'video');
        const finalVideoUrl = supabaseVideoUrl || videoOutput.fileUrl;

        console.log('[VideoGenerationService] Final URLs:', {
            audio: audioUrl,  // 已经是 Supabase URL（在 TTS 完成后上传的）
            video: finalVideoUrl,
            usingSupabase: !!supabaseVideoUrl
        });

        // 🔥 保存生成记录到 Supabase（持久化存储）
        const cleanUserId = this.extractUuid(supabaseUuid);
        if (cleanUserId) {
            try {
                const { error: saveError } = await supabaseAdmin
                    .from('avatar_video_generations')
                    .insert({
                        user_id: cleanUserId,
                        task_id: request.taskId,
                        script: script,
                        audio_url: audioUrl,  // 已经是 Supabase URL
                        video_url: finalVideoUrl,
                        audio_duration: estimatedDuration,
                        runninghub_task_id: videoTaskResponse.data.taskId,
                        status: 'completed',
                        created_at: new Date().toISOString()
                    });

                if (saveError) {
                    console.warn('[VideoGenerationService] Failed to save to Supabase:', saveError);
                } else {
                    console.log('[VideoGenerationService] ✅ Video record saved to Supabase');
                }
            } catch (dbError) {
                console.warn('[VideoGenerationService] Database save error:', dbError);
                // 不阻塞主流程
            }
        } else {
            console.warn(`[VideoGenerationService] Invalid user ID format, skipping database save: ${supabaseUuid}`);
        }

        return {
            success: true,
            videoUrl: finalVideoUrl,
            audioUrl: audioUrl,  // 已经是 Supabase URL
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
