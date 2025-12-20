/**
 * GeminiImageClient - Gemini API 图片生成客户端
 * 
 * 使用 Google Gemini API (Nano Banana 2 Pro) 生成真实感图片
 * 
 * 文档: https://ai.google.dev/gemini-api/docs/imagen
 * 
 * @version 1.0.0
 */

// ============ 类型定义 ============

/**
 * 图片生成请求
 */
export interface ImageGenerationRequest {
    /** 生成描述 */
    prompt: string;
    /** 参考图片 URL（用于风格参考） */
    referenceImageUrl?: string;
    /** 图片数量 */
    numberOfImages?: number;
    /** 宽高比 */
    aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
}

/**
 * 图片生成结果
 */
export interface ImageGenerationResult {
    success: boolean;
    images: GeneratedImage[];
    error?: string;
}

/**
 * 生成的图片
 */
export interface GeneratedImage {
    /** Base64 编码的图片数据 */
    base64Data?: string;
    /** 图片 URL（上传后） */
    imageUrl?: string;
    /** MIME 类型 */
    mimeType: string;
}

// ============ GeminiImageClient 实现 ============

export class GeminiImageClient {
    private apiKey: string;
    private baseUrl: string;

    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY || '';
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

        if (!this.apiKey) {
            console.warn('[GeminiImageClient] No GEMINI_API_KEY found in environment');
        }
    }

    /**
     * 生成图片
     */
    async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
        if (!this.apiKey) {
            return {
                success: false,
                images: [],
                error: 'GEMINI_API_KEY not configured',
            };
        }

        console.log('[GeminiImageClient] Generating image...');
        console.log('  Prompt:', request.prompt.substring(0, 100) + '...');
        console.log('  Has reference:', !!request.referenceImageUrl);

        try {
            // 构建请求 - 使用 Imagen 3
            const endpoint = `${this.baseUrl}/models/imagen-3.0-generate-002:predict`;

            const requestBody = this.buildRequestBody(request);

            const response = await fetch(`${endpoint}?key=${this.apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[GeminiImageClient] API error:', response.status, errorText);
                return {
                    success: false,
                    images: [],
                    error: `API error: ${response.status} - ${errorText}`,
                };
            }

            const result = await response.json();

            // 解析结果
            const images = this.parseGenerationResult(result);

            console.log('[GeminiImageClient] Generated', images.length, 'images');

            return {
                success: true,
                images,
            };

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

        try {
            // 下载参考图片并转为 base64
            const referenceBase64 = await this.downloadImageAsBase64(referenceImageUrl);

            if (!referenceBase64) {
                console.warn('[GeminiImageClient] Could not download reference image');
                // 回退到纯文本生成
                return this.generateImage({ prompt });
            }

            // 使用 Gemini Pro Vision 进行图片编辑/生成
            const endpoint = `${this.baseUrl}/models/gemini-2.0-flash-exp:generateContent`;

            const requestBody = {
                contents: [
                    {
                        parts: [
                            {
                                text: `基于这张参考图片，${prompt}

要求：
1. 保持参考图片的整体风格和构图
2. 确保生成的图片真实自然
3. 产品/人物位置合理
4. 高清晰度，适合社交媒体发布`,
                            },
                            {
                                inline_data: {
                                    mime_type: 'image/jpeg',
                                    data: referenceBase64,
                                },
                            },
                        ],
                    },
                ],
                generationConfig: {
                    responseModalities: ['IMAGE', 'TEXT'],
                    responseMimeType: 'image/jpeg',
                },
            };

            const response = await fetch(`${endpoint}?key=${this.apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[GeminiImageClient] Reference generation error:', response.status);
                // 回退到纯文本生成
                return this.generateImage({ prompt });
            }

            const result = await response.json();
            const images = this.parseGeminiVisionResult(result);

            return {
                success: images.length > 0,
                images,
            };

        } catch (error) {
            console.error('[GeminiImageClient] Reference generation error:', error);
            // 回退到纯文本生成
            return this.generateImage({ prompt });
        }
    }

    /**
     * 批量生成图片
     */
    async generateBatch(
        requests: Array<{ prompt: string; referenceImageUrl?: string }>
    ): Promise<ImageGenerationResult[]> {
        console.log('[GeminiImageClient] Batch generating', requests.length, 'images...');

        const results: ImageGenerationResult[] = [];

        // 串行处理，避免 API 限制
        for (const request of requests) {
            if (request.referenceImageUrl) {
                const result = await this.generateWithReference(
                    request.prompt,
                    request.referenceImageUrl
                );
                results.push(result);
            } else {
                const result = await this.generateImage({ prompt: request.prompt });
                results.push(result);
            }

            // 简单限流
            await this.sleep(1000);
        }

        return results;
    }

    // ============ 私有方法 ============

    /**
     * 构建 Imagen API 请求体
     */
    private buildRequestBody(request: ImageGenerationRequest): any {
        return {
            instances: [
                {
                    prompt: this.enhancePrompt(request.prompt),
                },
            ],
            parameters: {
                sampleCount: request.numberOfImages || 1,
                aspectRatio: request.aspectRatio || '1:1',
                safetyFilterLevel: 'block_only_high',
                personGeneration: 'allow_adult',
                language: 'zh',
            },
        };
    }

    /**
     * 增强 Prompt（添加质量要求）
     */
    private enhancePrompt(prompt: string): string {
        // 添加真实感和质量要求
        const qualityModifiers = [
            '真实摄影风格',
            '高清细节',
            '自然光线',
            '专业构图',
        ];

        // 检查是否已有质量修饰词
        const hasQualityMod = qualityModifiers.some(mod => prompt.includes(mod));

        if (!hasQualityMod) {
            return `${prompt}。真实摄影风格，高清画质，自然光线，适合社交媒体发布。`;
        }

        return prompt;
    }

    /**
     * 解析 Imagen 生成结果
     */
    private parseGenerationResult(result: any): GeneratedImage[] {
        const images: GeneratedImage[] = [];

        if (result.predictions) {
            for (const prediction of result.predictions) {
                if (prediction.bytesBase64Encoded) {
                    images.push({
                        base64Data: prediction.bytesBase64Encoded,
                        mimeType: prediction.mimeType || 'image/png',
                    });
                }
            }
        }

        return images;
    }

    /**
     * 解析 Gemini Vision 结果
     */
    private parseGeminiVisionResult(result: any): GeneratedImage[] {
        const images: GeneratedImage[] = [];

        if (result.candidates) {
            for (const candidate of result.candidates) {
                if (candidate.content?.parts) {
                    for (const part of candidate.content.parts) {
                        if (part.inline_data?.data) {
                            images.push({
                                base64Data: part.inline_data.data,
                                mimeType: part.inline_data.mime_type || 'image/jpeg',
                            });
                        }
                    }
                }
            }
        }

        return images;
    }

    /**
     * 下载图片并转为 Base64
     */
    private async downloadImageAsBase64(imageUrl: string): Promise<string | null> {
        try {
            const response = await fetch(imageUrl);
            if (!response.ok) return null;

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            return buffer.toString('base64');
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
        // TODO: 实现 Supabase Storage 上传
        // 这里需要根据你的 Supabase 配置实现
        console.log('[GeminiImageClient] TODO: Upload to Supabase Storage');
        return null;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 单例导出
export const geminiImageClient = new GeminiImageClient();
