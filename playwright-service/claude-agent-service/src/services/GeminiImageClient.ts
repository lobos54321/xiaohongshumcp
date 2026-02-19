/**
 * GeminiImageClient - 通过 OpenAI 兼容 API 调用 Gemini 图片生成
 *
 * @version 2.0.0
 */

import fetch from 'node-fetch';

// ============ 类型定义 ============

export interface ImageGenerationRequest {
    prompt: string;
    referenceImageUrl?: string;
    numberOfImages?: number;
    aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
}

export interface ImageGenerationResult {
    success: boolean;
    images: GeneratedImage[];
    error?: string;
}

export interface GeneratedImage {
    base64Data?: string;
    imageUrl?: string;
    mimeType: string;
}

// ============ GeminiImageClient 实现 ============

export class GeminiImageClient {
    private apiKey: string;
    private baseUrl: string;
    private model: string;

    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY || '';
        this.baseUrl = (process.env.GEMINI_BASE_URL || 'http://bruder.yukinoapi.com/v1').replace(/\/$/, '');
        this.model = process.env.GEMINI_MODEL || 'gemini-3-pro-image-preview';

        if (!this.apiKey) {
            console.warn('[GeminiImageClient] No GEMINI_API_KEY found in environment');
        }
    }

    /**
     * 生成图片
     */
    async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
        if (!this.apiKey) {
            return { success: false, images: [], error: 'GEMINI_API_KEY not configured' };
        }

        console.log('[GeminiImageClient] Generating image...');
        console.log('  Prompt:', request.prompt.substring(0, 100) + '...');

        try {
            const result = await this.callImageAPI(request.prompt);
            if (result) {
                return { success: true, images: [result] };
            }
            return { success: false, images: [], error: 'No image generated' };
        } catch (error) {
            console.error('[GeminiImageClient] Generation error:', error);
            return {
                success: false,
                images: [],
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * 带参考图生成（编辑/风格迁移）
     */
    async generateWithReference(
        prompt: string,
        referenceImageUrl: string
    ): Promise<ImageGenerationResult> {
        console.log('[GeminiImageClient] Generating with reference image...');

        // 下载参考图转 base64，拼入 prompt
        const referenceBase64 = await this.downloadImageAsBase64(referenceImageUrl);
        const enhancedPrompt = referenceBase64
            ? `Based on a reference product image, generate: ${prompt}. Style: realistic, high quality, social media ready.`
            : prompt;

        return this.generateImage({ prompt: enhancedPrompt });
    }

    /**
     * 批量生成
     */
    async batchGenerate(
        requests: ImageGenerationRequest[]
    ): Promise<ImageGenerationResult[]> {
        console.log('[GeminiImageClient] Batch generating', requests.length, 'images...');

        const results: ImageGenerationResult[] = [];
        for (const req of requests) {
            const result = await this.generateImage(req);
            results.push(result);
            // 避免速率限制
            await this.sleep(2000);
        }
        return results;
    }

    /**
     * 核心 API 调用
     */
    private async callImageAPI(prompt: string): Promise<GeneratedImage | null> {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: this.model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 4096
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.status} - ${errorText.substring(0, 200)}`);
        }

        const data = await response.json() as any;
        const content = data.choices?.[0]?.message?.content || '';

        // 匹配 base64 data URI
        const base64Match = content.match(/!\[.*?\]\(data:(image\/[^;]+);base64,([^)]+)\)/);
        if (base64Match) {
            return {
                base64Data: base64Match[2],
                mimeType: base64Match[1],
            };
        }

        // 匹配图片 URL
        const urlMatch = content.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/);
        if (urlMatch) {
            return {
                imageUrl: urlMatch[1],
                mimeType: 'image/png',
            };
        }

        console.error('[GeminiImageClient] No image found in response:', content.substring(0, 200));
        return null;
    }

    /**
     * 下载图片并转为 Base64
     */
    private async downloadImageAsBase64(imageUrl: string): Promise<string | null> {
        try {
            const response = await fetch(imageUrl);
            if (!response.ok) return null;
            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer).toString('base64');
        } catch (error) {
            console.error('[GeminiImageClient] Failed to download image:', error);
            return null;
        }
    }

    /**
     * 上传 Base64 图片到 Supabase Storage
     */
    async uploadToStorage(
        base64Data: string,
        mimeType: string,
        supabaseUuid: string
    ): Promise<string | null> {
        console.log('[GeminiImageClient] TODO: Upload to Supabase Storage');
        return null;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 单例导出
export const geminiImageClient = new GeminiImageClient();
