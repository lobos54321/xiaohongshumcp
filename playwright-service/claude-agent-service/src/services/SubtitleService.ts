/**
 * SubtitleService - 从视频中提取字幕（语音转文字）
 *
 * 流程：下载视频 → ffmpeg 提取音频 → base64 编码 → Gemini API 转录 → 解析为 Subtitle[]
 */

import fetch from 'node-fetch';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlink, readFile } from 'fs/promises';
import { createWriteStream } from 'fs';
import { randomUUID } from 'crypto';
import { configService } from './ConfigService.js';

// 设置 ffmpeg 路径
ffmpeg.setFfmpegPath(ffmpegPath.path);

// ============ 类型定义 ============

export interface Subtitle {
    id: string;
    startTime: number;
    endTime: number;
    text: string;
}

export interface SubtitleResult {
    success: boolean;
    subtitles: Subtitle[];
    error?: string;
}

// ============ SubtitleService 实现 ============

export class SubtitleService {
    private apiKey: string = '';
    private baseUrl: string = '';
    private model: string = '';

    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY || '';
        this.baseUrl = (process.env.GEMINI_BASE_URL || 'http://bruder.yukinoapi.com/v1').replace(/\/$/, '');
        this.model = process.env.GEMINI_MODEL || 'gemini-3-pro-image-preview';
    }

    /**
     * 从 ConfigService 刷新配置
     */
    private async refreshConfig(): Promise<void> {
        try {
            const key = await configService.get('GEMINI_API_KEY');
            const url = await configService.get('GEMINI_BASE_URL');
            const model = await configService.get('GEMINI_MODEL');
            if (key) this.apiKey = key;
            if (url) this.baseUrl = url.replace(/\/$/, '');
            if (model) this.model = model;
        } catch {
            // fallback to current values
        }
    }

    /**
     * 从视频 URL 生成字幕
     */
    async generateSubtitles(videoUrl: string): Promise<SubtitleResult> {
        await this.refreshConfig();
        if (!this.apiKey) {
            return { success: false, subtitles: [], error: 'GEMINI_API_KEY not configured' };
        }

        const id = randomUUID().slice(0, 8);
        const videoPath = join(tmpdir(), `subtitle_video_${id}.mp4`);
        const audioPath = join(tmpdir(), `subtitle_audio_${id}.wav`);

        console.log('[SubtitleService] Generating subtitles for:', videoUrl.substring(0, 80));

        try {
            // 1. 下载视频
            await this.downloadFile(videoUrl, videoPath);
            console.log('[SubtitleService] Video downloaded');

            // 2. 提取音频 (wav, pcm_s16le, 16kHz, mono)
            await this.extractAudio(videoPath, audioPath);
            console.log('[SubtitleService] Audio extracted');

            // 3. 读取音频并 base64 编码
            const audioBuffer = await readFile(audioPath);
            const audioBase64 = audioBuffer.toString('base64');
            console.log('[SubtitleService] Audio base64 encoded, size:', audioBase64.length);

            // 4. 调用 Gemini API 转录
            const subtitles = await this.transcribeAudio(audioBase64);
            console.log('[SubtitleService] Transcription complete, subtitles:', subtitles.length);

            return { success: true, subtitles };
        } catch (error) {
            console.error('[SubtitleService] Error:', error);
            return {
                success: false,
                subtitles: [],
                error: error instanceof Error ? error.message : String(error),
            };
        } finally {
            // 5. 清理临时文件
            await this.cleanupFile(videoPath);
            await this.cleanupFile(audioPath);
        }
    }

    /**
     * 下载文件到本地
     */
    private async downloadFile(url: string, destPath: string): Promise<void> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to download video: ${response.status}`);
        }

        return new Promise((resolve, reject) => {
            const fileStream = createWriteStream(destPath);
            response.body!.pipe(fileStream);
            fileStream.on('finish', resolve);
            fileStream.on('error', reject);
        });
    }

    /**
     * 用 ffmpeg 提取音频：wav, pcm_s16le, 16kHz, mono
     */
    private extractAudio(videoPath: string, audioPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            ffmpeg(videoPath)
                .noVideo()
                .audioCodec('pcm_s16le')
                .audioFrequency(16000)
                .audioChannels(1)
                .format('wav')
                .output(audioPath)
                .on('end', () => resolve())
                .on('error', (err: Error) => reject(new Error(`ffmpeg error: ${err.message}`)))
                .run();
        });
    }

    /**
     * 调用 Gemini API 进行语音转文字
     */
    private async transcribeAudio(audioBase64: string): Promise<Subtitle[]> {
        const prompt = `You are a speech-to-text transcription service. I will provide you with audio data encoded in base64 (WAV format, 16kHz, mono, PCM).

Please transcribe the audio and return the result as a JSON array of subtitle objects. Each object should have:
- "id": string like "sub_1", "sub_2", etc.
- "startTime": number in seconds (e.g., 0, 3.5, 7.2)
- "endTime": number in seconds (e.g., 3.5, 7.2, 10.0)
- "text": the transcribed text for that segment

Break the transcription into natural segments (sentences or phrases), each roughly 3-8 seconds long.

Return ONLY the JSON array, no other text. Example:
[{"id":"sub_1","startTime":0,"endTime":3.5,"text":"Hello world"}]

Audio data (base64):
${audioBase64}`;

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this.model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 8192,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API error: ${response.status} - ${errorText.substring(0, 200)}`);
        }

        const data = await response.json() as any;
        const content = data.choices?.[0]?.message?.content || '';

        return this.parseSubtitles(content);
    }

    /**
     * 解析 Gemini 返回的字幕 JSON
     */
    private parseSubtitles(content: string): Subtitle[] {
        try {
            // 尝试提取 JSON 数组（可能被 markdown 代码块包裹）
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                console.error('[SubtitleService] No JSON array found in response:', content.substring(0, 200));
                return [];
            }

            const parsed = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(parsed)) return [];

            return parsed.map((item: any, index: number) => ({
                id: String(item.id || `sub_${index + 1}`),
                startTime: typeof item.startTime === 'number' ? item.startTime : (typeof item.start === 'number' ? item.start : 0),
                endTime: typeof item.endTime === 'number' ? item.endTime : (typeof item.end === 'number' ? item.end : 0),
                text: item.text || '',
            }));
        } catch (error) {
            console.error('[SubtitleService] Failed to parse subtitles:', error);
            return [];
        }
    }

    /**
     * 安全删除临时文件
     */
    private async cleanupFile(filePath: string): Promise<void> {
        try {
            await unlink(filePath);
        } catch {
            // 文件可能不存在，忽略
        }
    }
}

// 单例导出
export const subtitleService = new SubtitleService();
