/**
 * MiniMax Client
 * 
 * 对接 MiniMax 语音克隆和 TTS API
 * 
 * 工作流程：
 * 1. 上传音频文件 → 获取 file_id
 * 2. 克隆语音 → 获取 voice_id
 * 3. 使用 voice_id 生成语音 (TTS)
 * 
 * API 文档：https://api.minimaxi.chat/
 */

const MINIMAX_BASE_URL = 'https://api.minimaxi.chat/v1';

export interface MiniMaxConfig {
    apiKey: string;
    groupId?: string;
}

// 上传文件响应
export interface MiniMaxUploadResponse {
    file_id: string;
    bytes: number;
    created_at: number;
    filename: string;
    object: string;
    purpose: string;
}

// 语音克隆响应
export interface MiniMaxVoiceCloneResponse {
    voice_id: string;
    preview_audio_url?: string;
    base_resp?: {
        status_code: number;
        status_msg: string;
    };
}

// TTS 请求参数
export interface MiniMaxTTSRequest {
    model?: string;
    text: string;
    voice_setting?: {
        voice_id: string;
        speed?: number;  // 0.5-2.0, 默认 1.0
        vol?: number;    // 0-10, 默认 1.0
        pitch?: number;  // -12 到 12, 默认 0
    };
    audio_setting?: {
        sample_rate?: number;  // 16000, 24000, 32000
        bitrate?: number;      // 64000, 128000, 192000
        format?: string;       // mp3, wav, pcm
    };
}

// TTS 响应
export interface MiniMaxTTSResponse {
    data?: {
        audio: string;  // Base64 encoded audio
    };
    extra_info?: {
        audio_length: number;
        audio_sample_rate: number;
        audio_size: number;
    };
    base_resp?: {
        status_code: number;
        status_msg: string;
    };
}

export class MiniMaxClient {
    private apiKey: string;
    private groupId: string;

    constructor(config: MiniMaxConfig) {
        this.apiKey = config.apiKey || process.env.MINIMAX_API_KEY || '';
        this.groupId = config.groupId || process.env.MINIMAX_GROUP_ID || '';

        if (!this.apiKey) {
            console.warn('[MiniMaxClient] No API key provided, some operations may fail');
        }
    }

    /**
     * 上传音频文件用于语音克隆
     * 
     * 音频要求：
     * - 格式：MP3, M4A, WAV
     * - 时长：10秒 ~ 5分钟
     * - 大小：< 20MB
     */
    async uploadAudioFile(audioBuffer: Buffer, fileName: string): Promise<MiniMaxUploadResponse> {
        const formData = new FormData();
        formData.append('purpose', 'voice_clone');
        formData.append('file', new Blob([audioBuffer]), fileName);

        const response = await fetch(`${MINIMAX_BASE_URL}/files/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: formData
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`MiniMax upload failed: ${response.status} - ${error}`);
        }

        const result = await response.json() as MiniMaxUploadResponse;
        console.log('[MiniMaxClient] File uploaded:', result.file_id);
        return result;
    }

    /**
     * 从 URL 上传音频文件
     */
    async uploadAudioFromUrl(audioUrl: string): Promise<MiniMaxUploadResponse> {
        // 下载音频文件
        const audioResponse = await fetch(audioUrl);
        if (!audioResponse.ok) {
            throw new Error(`Failed to download audio: ${audioResponse.status}`);
        }

        const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
        const fileName = audioUrl.split('/').pop()?.split('?')[0] || 'audio.mp3';

        return this.uploadAudioFile(audioBuffer, fileName);
    }

    /**
     * 克隆语音
     * 
     * @param fileId - 上传音频后获得的 file_id
     * @param voiceId - 自定义 voice_id (8-256字符, 字母开头)
     * @param options - 可选参数
     */
    async cloneVoice(
        fileId: string,
        voiceId: string,
        options: {
            needNoiseReduction?: boolean;
            needVolumeNormalization?: boolean;
            previewText?: string;
        } = {}
    ): Promise<MiniMaxVoiceCloneResponse> {
        const {
            needNoiseReduction = false,
            needVolumeNormalization = false,
            previewText
        } = options;

        const body: Record<string, unknown> = {
            file_id: fileId,
            voice_id: voiceId,
            need_noise_reduction: needNoiseReduction,
            need_volume_normalization: needVolumeNormalization
        };

        // 如果提供预览文本，添加到请求
        if (previewText) {
            body.text = previewText;
            body.model = 'speech-02-hd';
        }

        const response = await fetch(`${MINIMAX_BASE_URL}/voice_clone`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`MiniMax voice clone failed: ${response.status} - ${error}`);
        }

        const result = await response.json() as MiniMaxVoiceCloneResponse;
        console.log('[MiniMaxClient] Voice cloned:', result.voice_id);
        return result;
    }

    /**
     * 快速克隆语音（从 URL）
     * 
     * 将上传和克隆合并为一步
     */
    async quickCloneFromUrl(audioUrl: string, voiceId: string): Promise<string> {
        // 1. 上传音频
        const uploadResult = await this.uploadAudioFromUrl(audioUrl);

        // 2. 克隆语音
        const cloneResult = await this.cloneVoice(uploadResult.file_id, voiceId, {
            needNoiseReduction: true,
            needVolumeNormalization: true
        });

        return cloneResult.voice_id;
    }

    /**
     * 使用克隆语音生成 TTS
     * 
     * @param text - 要转换的文本
     * @param voiceId - 克隆后的 voice_id
     * @param options - 可选参数
     */
    async textToSpeech(
        text: string,
        voiceId: string,
        options: {
            speed?: number;
            volume?: number;
            pitch?: number;
            format?: 'mp3' | 'wav' | 'pcm';
        } = {}
    ): Promise<Buffer> {
        const { speed = 1.0, volume = 1.0, pitch = 0, format = 'mp3' } = options;

        const body: MiniMaxTTSRequest = {
            model: 'speech-02-hd',
            text,
            voice_setting: {
                voice_id: voiceId,
                speed,
                vol: volume,
                pitch
            },
            audio_setting: {
                sample_rate: 24000,
                bitrate: 128000,
                format
            }
        };

        const response = await fetch(`${MINIMAX_BASE_URL}/t2a_v2?GroupId=${this.groupId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`MiniMax TTS failed: ${response.status} - ${error}`);
        }

        const result = await response.json() as MiniMaxTTSResponse;

        if (result.base_resp?.status_code !== 0) {
            throw new Error(`MiniMax TTS error: ${result.base_resp?.status_msg}`);
        }

        if (!result.data?.audio) {
            throw new Error('MiniMax TTS: No audio data in response');
        }

        // 解码 Base64 音频
        const audioBuffer = Buffer.from(result.data.audio, 'base64');
        console.log('[MiniMaxClient] TTS generated:', {
            voiceId,
            textLength: text.length,
            audioSize: audioBuffer.length
        });

        return audioBuffer;
    }

    /**
     * 使用系统预置语音生成 TTS
     * 
     * 预置语音 ID 列表：https://api.minimaxi.chat/
     */
    async textToSpeechWithPreset(
        text: string,
        presetVoice: string = 'female-tianmei-jingpin'
    ): Promise<Buffer> {
        return this.textToSpeech(text, presetVoice);
    }

    /**
     * 从文案生成语音（用于 UGC 视频）
     * 
     * @param script - 视频脚本文案
     * @param voiceId - 使用的语音 ID（克隆语音或预置语音）
     */
    async generateVideoAudio(script: string, voiceId: string): Promise<{
        audioBuffer: Buffer;
        duration: number;
    }> {
        const audioBuffer = await this.textToSpeech(script, voiceId);

        // 估算音频时长（中文约 4 字/秒，英文约 3 词/秒）
        const charCount = script.replace(/\s/g, '').length;
        const estimatedDuration = Math.ceil(charCount / 4);

        return {
            audioBuffer,
            duration: estimatedDuration
        };
    }
}

// 默认配置的单例（需要设置环境变量）
export const miniMaxClient = new MiniMaxClient({
    apiKey: process.env.MINIMAX_API_KEY || '',
    groupId: process.env.MINIMAX_GROUP_ID || ''
});
