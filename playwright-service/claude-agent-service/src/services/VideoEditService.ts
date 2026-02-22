/**
 * Video Edit Service
 *
 * 视频编辑服务：
 * - exportVideo: 字幕烧录、变速、BGM混音，上传到 Supabase
 * - generateSubtitles: 提取音频，调用 Gemini 转录字幕
 * - getMusicLibrary: 返回预设 BGM 列表
 */

import { supabaseAdmin } from '../orchestrator/db/supabase.js';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, unlink, readFile } from 'fs/promises';

ffmpeg.setFfmpegPath(ffmpegPath.path);

interface Subtitle {
  text: string;
  startTime: number;
  endTime: number;
  position?: 'top' | 'center' | 'bottom';
  fontSize?: number;
  color?: string;
}

interface ExportParams {
  videoUrl: string;
  subtitles?: Subtitle[];
  speed?: number;
  bgm?: { url: string; volume?: number };
}

interface ExportResult {
  success: boolean;
  exportedUrl?: string;
  error?: string;
}

interface SubtitleResult {
  success: boolean;
  text?: string;
  error?: string;
}

interface MusicTrack {
  id: string;
  name: string;
  url: string;
  category: string;
}

class VideoEditService {

  /**
   * 导出编辑后的视频：字幕烧录、变速、BGM混音
   */
  async exportVideo(params: ExportParams): Promise<ExportResult> {
    const { videoUrl, subtitles, speed, bgm } = params;
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const inputPath = join(tmpdir(), `input_${timestamp}.mp4`);
    const outputPath = join(tmpdir(), `output_${timestamp}_${random}.mp4`);
    const bgmPath = bgm ? join(tmpdir(), `bgm_${timestamp}.mp3`) : null;

    try {
      // 下载源视频
      const videoRes = await fetch(videoUrl);
      if (!videoRes.ok) throw new Error(`Failed to download video: ${videoRes.status}`);
      const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
      await writeFile(inputPath, videoBuffer);

      // 下载 BGM（如果有）
      if (bgm && bgmPath) {
        const bgmRes = await fetch(bgm.url);
        if (!bgmRes.ok) throw new Error(`Failed to download BGM: ${bgmRes.status}`);
        const bgmBuffer = Buffer.from(await bgmRes.arrayBuffer());
        await writeFile(bgmPath, bgmBuffer);
      }

      // 构建 ffmpeg 命令
      await new Promise<void>((resolve, reject) => {
        let cmd = ffmpeg(inputPath);

        if (bgm && bgmPath) {
          cmd = cmd.input(bgmPath);
        }

        const videoFilters: string[] = [];
        const audioFilters: string[] = [];

        // 字幕烧录
        if (subtitles && subtitles.length > 0) {
          for (const sub of subtitles) {
            const fontSize = sub.fontSize || 24;
            const color = sub.color || 'white';
            const posY = this.getSubtitleY(sub.position || 'bottom');
            const escapedText = sub.text.replace(/'/g, "\\'").replace(/:/g, "\\:");
            videoFilters.push(
              `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${color}:x=(w-text_w)/2:y=${posY}:enable='between(t,${sub.startTime},${sub.endTime})'`
            );
          }
        }

        // 变速
        if (speed && speed !== 1) {
          videoFilters.push(`setpts=PTS/${speed}`);
          audioFilters.push(`atempo=${speed}`);
        }

        // 应用视频滤镜
        if (videoFilters.length > 0) {
          cmd = cmd.videoFilters(videoFilters);
        }

        // 音频处理
        if (bgm && bgmPath) {
          const bgmVol = bgm.volume ?? 0.3;
          if (audioFilters.length > 0) {
            cmd = cmd.complexFilter([
              `[0:a]${audioFilters.join(',')}[a0]`,
              `[1:a]volume=${bgmVol}[a1]`,
              `[a0][a1]amix=inputs=2:duration=first[aout]`
            ], ['aout']);
          } else {
            cmd = cmd.complexFilter([
              `[0:a]volume=1[a0]`,
              `[1:a]volume=${bgmVol}[a1]`,
              `[a0][a1]amix=inputs=2:duration=first[aout]`
            ], ['aout']);
          }
        } else if (audioFilters.length > 0) {
          cmd = cmd.audioFilters(audioFilters);
        }

        cmd
          .output(outputPath)
          .outputOptions(['-y'])
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err))
          .run();
      });

      // 上传到 Supabase
      const outputBuffer = await readFile(outputPath);
      const filePath = `edited-videos/${timestamp}_${random}.mp4`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from('avatar-videos')
        .upload(filePath, outputBuffer, {
          contentType: 'video/mp4',
          upsert: true,
        });

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const { data: publicUrl } = supabaseAdmin.storage
        .from('avatar-videos')
        .getPublicUrl(filePath);

      return { success: true, exportedUrl: publicUrl.publicUrl };
    } catch (err: any) {
      console.error('[VideoEditService] exportVideo error:', err);
      return { success: false, error: err.message };
    } finally {
      await this.cleanupFiles([inputPath, outputPath, bgmPath].filter(Boolean) as string[]);
    }
  }

  /**
   * 提取音频并调用 Gemini 转录字幕
   */
  async generateSubtitles(videoUrl: string): Promise<SubtitleResult> {
    const timestamp = Date.now();
    const inputPath = join(tmpdir(), `sub_input_${timestamp}.mp4`);
    const audioPath = join(tmpdir(), `sub_audio_${timestamp}.mp3`);

    try {
      // 下载视频
      const videoRes = await fetch(videoUrl);
      if (!videoRes.ok) throw new Error(`Failed to download video: ${videoRes.status}`);
      const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
      await writeFile(inputPath, videoBuffer);

      // 提取音频
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputPath)
          .noVideo()
          .audioCodec('libmp3lame')
          .output(audioPath)
          .outputOptions(['-y'])
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err))
          .run();
      });

      // 读取音频并发送给 Gemini
      const audioBuffer = await readFile(audioPath);
      const base64Audio = audioBuffer.toString('base64');

      const geminiApiKey = process.env.GEMINI_API_KEY;
      const geminiBaseUrl = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';

      if (!geminiApiKey) throw new Error('GEMINI_API_KEY not configured');

      const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
      const response = await fetch(
        `${geminiBaseUrl}/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  inlineData: {
                    mimeType: 'audio/mp3',
                    data: base64Audio,
                  },
                },
                {
                  text: '请将这段音频转录为文字。只输出转录文本，不要添加任何额外说明。',
                },
              ],
            }],
          }),
        }
      );

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Gemini API error: ${response.status} ${errBody}`);
      }

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

      return { success: true, text };
    } catch (err: any) {
      console.error('[VideoEditService] generateSubtitles error:', err);
      return { success: false, error: err.message };
    } finally {
      await this.cleanupFiles([inputPath, audioPath]);
    }
  }

  /**
   * 返回预设 BGM 音乐库
   */
  getMusicLibrary(): MusicTrack[] {
    return [
      { id: 'relaxed-1', name: '午后阳光', url: '/audio/relaxed-1.mp3', category: '轻松' },
      { id: 'relaxed-2', name: '微风拂面', url: '/audio/relaxed-2.mp3', category: '轻松' },
      { id: 'energetic-1', name: '活力满满', url: '/audio/energetic-1.mp3', category: '活力' },
      { id: 'energetic-2', name: '节奏跳动', url: '/audio/energetic-2.mp3', category: '活力' },
      { id: 'elegant-1', name: '优雅时光', url: '/audio/elegant-1.mp3', category: '优雅' },
      { id: 'elegant-2', name: '古典韵律', url: '/audio/elegant-2.mp3', category: '优雅' },
      { id: 'relaxed-3', name: '静谧森林', url: '/audio/relaxed-3.mp3', category: '轻松' },
      { id: 'energetic-3', name: '电子脉冲', url: '/audio/energetic-3.mp3', category: '活力' },
    ];
  }

  private getSubtitleY(position: 'top' | 'center' | 'bottom'): string {
    switch (position) {
      case 'top': return '50';
      case 'center': return '(h-text_h)/2';
      case 'bottom': return 'h-text_h-50';
    }
  }

  private async cleanupFiles(paths: string[]): Promise<void> {
    for (const p of paths) {
      try { await unlink(p); } catch { /* ignore */ }
    }
  }
}

export const videoEditService = new VideoEditService();
