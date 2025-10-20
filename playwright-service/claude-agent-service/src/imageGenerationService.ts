/**
 * 图片生成服务
 * 支持 Gemini Imagen 和 Unsplash 图片库
 * 图片存储到 Supabase Storage
 */

import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface ImageGenerationConfig {
  geminiKey?: string;
  unsplashKey?: string;
  supabaseUrl?: string;
  supabaseKey?: string;
}

interface ImageRequest {
  prompt: string;
  userId: string;  // 用户ID，用于Supabase路径隔离
  style?: 'realistic' | 'cartoon' | 'painting' | 'sketch';
  aspectRatio?: '1:1' | '9:16' | '16:9';
  negativePrompt?: string;
}

interface ImageResult {
  url: string;
  storageKey?: string;  // Supabase Storage路径
  source: 'gemini' | 'unsplash' | 'placeholder';
  cost?: number;
}

export class ImageGenerationService {
  private geminiKey?: string;
  private unsplashKey?: string;
  private supabase?: SupabaseClient;

  constructor(config: ImageGenerationConfig) {
    this.geminiKey = config.geminiKey;
    this.unsplashKey = config.unsplashKey;

    // 初始化 Supabase 客户端
    if (config.supabaseUrl && config.supabaseKey) {
      this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
      console.log('✅ Supabase Storage 已初始化');
    } else {
      console.warn('⚠️ Supabase 配置缺失，图片将使用本地存储');
    }
  }

  /**
   * 生成图片 - 优先使用Gemini Imagen，失败时降级到Unsplash
   */
  async generateImage(request: ImageRequest): Promise<ImageResult> {
    try {
      // 优先尝试 Gemini Imagen
      if (this.geminiKey) {
        const result = await this.generateWithGemini(request);
        if (result) {
          console.log('🎨 图片生成成功 (Gemini Imagen):', result.url);
          return result;
        }
      }

      // 降级到 Unsplash
      if (this.unsplashKey) {
        const result = await this.getFromUnsplash(request);
        if (result) {
          console.log('📷 图片获取成功 (Unsplash):', result.url);
          return result;
        }
      }

      // 最后使用占位图
      console.log('⚠️ 使用占位图片');
      return this.getPlaceholderImage(request);

    } catch (error) {
      console.error('图片生成失败:', error);
      return this.getPlaceholderImage(request);
    }
  }

  /**
   * 使用 Gemini 2.5 Flash Image (Nano Banana) 生成图片
   */
  private async generateWithGemini(request: ImageRequest): Promise<ImageResult | null> {
    try {
      if (!this.geminiKey) {
        console.log('⚠️ [Gemini] 未配置GEMINI_API_KEY');
        return null;
      }

      console.log('🎨 [Gemini] 开始使用 gemini-2.5-flash-image 生成图片');
      const stylePrompt = this.getStylePrompt(request.style);
      const fullPrompt = `${request.prompt}, ${stylePrompt}, high quality, vibrant colors, social media ready`;
      console.log('🎨 [Gemini] 提示词:', fullPrompt.substring(0, 100) + '...');

      // 调用 Gemini 2.5 Flash Image API
      const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
        {
          method: 'POST',
          headers: {
            'x-goog-api-key': this.geminiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: fullPrompt
              }]
            }]
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('🎨 [Gemini] API错误:', response.status, errorText);
        return null;
      }

      const data = await response.json() as any;
      console.log('🎨 [Gemini] API响应状态:', response.status);

      // 🔥 增强调试：记录完整响应结构
      console.log('🎨 [Gemini] 响应结构:', JSON.stringify({
        has_candidates: !!data.candidates,
        candidates_length: data.candidates?.length || 0,
        first_candidate_has_content: !!data.candidates?.[0]?.content,
        parts_count: data.candidates?.[0]?.content?.parts?.length || 0,
        parts_types: data.candidates?.[0]?.content?.parts?.map((p: any) => Object.keys(p)) || []
      }));

      // 从响应中提取图片数据（base64）
      if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        const parts = data.candidates[0].content.parts;

        // 查找inlineData类型的part（包含图片）
        const imagePart = parts.find((part: any) => part.inlineData && part.inlineData.mimeType?.startsWith('image/'));

        if (imagePart && imagePart.inlineData && imagePart.inlineData.data) {
          const base64Data = imagePart.inlineData.data;
          const mimeType = imagePart.inlineData.mimeType || 'image/png';

          console.log('🎨 [Gemini] 成功获取图片数据，mimeType:', mimeType);

          // 上传到 Supabase Storage
          if (this.supabase) {
            const { url, storageKey } = await this.uploadToSupabase(
              base64Data,
              request.userId,
              'gemini',
              mimeType
            );

            return {
              url,
              storageKey,
              source: 'gemini',
              cost: 0.03 // Gemini定价：$0.03 per image
            };
          } else {
            // 备用方案：保存到本地
            console.warn('⚠️ [Gemini] Supabase未配置，使用本地存储');
            const localPath = await this.saveBase64Image(base64Data, 'gemini', mimeType);
            const filename = path.basename(localPath);
            const imageUrl = `/images/${filename}`;

            return {
              url: imageUrl,
              storageKey: localPath,  // 本地路径作为storageKey
              source: 'gemini',
              cost: 0.03
            };
          }
        }
      }

      // 🔥 详细记录为什么找不到图片数据
      console.error('🎨 [Gemini] 响应中未找到图片数据！');
      console.error('🎨 [Gemini] 完整响应:', JSON.stringify(data, null, 2).substring(0, 1000));

      // 检查是否有错误信息
      if (data.error) {
        console.error('🎨 [Gemini] API返回错误:', data.error);
      }

      // 检查是否被安全过滤
      if (data.candidates?.[0]?.finishReason) {
        console.error('🎨 [Gemini] 生成终止原因:', data.candidates[0].finishReason);
      }

      return null;

    } catch (error: any) {
      console.error('🎨 [Gemini] 生成失败:', error.message);
      console.error('🎨 [Gemini] 错误详情:', error);
      return null;
    }
  }

  /**
   * Gemini 备用API方法 (使用不同的端点)
   */
  private async generateWithGeminiV2(request: ImageRequest): Promise<ImageResult | null> {
    try {
      if (!this.geminiKey) return null;

      const stylePrompt = this.getStylePrompt(request.style);
      const fullPrompt = `${request.prompt}, ${stylePrompt}, high quality, vibrant colors, social media ready`;

      // 使用 Gemini 文本到图片 API
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${this.geminiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Generate an image: ${fullPrompt}`
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024
          }
        })
      });

      const data = await response.json() as any;

      if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        // 这个API可能返回图片描述而不是图片，我们用描述去Unsplash搜索
        const description = data.candidates[0].content.parts[0].text;
        return await this.getFromUnsplash({ ...request, prompt: description });
      }

      return null;

    } catch (error) {
      console.error('Gemini V2 API 失败:', error);
      return null;
    }
  }

  /**
   * 从 Unsplash 获取图片
   */
  private async getFromUnsplash(request: ImageRequest): Promise<ImageResult | null> {
    try {
      if (!this.unsplashKey) return null;

      // 从prompt提取关键词
      const keywords = this.extractKeywords(request.prompt);
      const query = keywords.join(' ');

      const orientation = this.getUnsplashOrientation(request.aspectRatio);

      const response = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=10&orientation=${orientation}`,
        {
          headers: {
            'Authorization': `Client-ID ${this.unsplashKey}`
          }
        }
      );

      const data = await response.json() as any;

      if (!data.results || data.results.length === 0) {
        return null;
      }

      // 选择第一张图片
      const photo = data.results[0];
      const imageUrl = photo.urls.regular;

      // Unsplash 直接返回 URL，不需要下载
      // MCP Router 会自动下载这个 URL
      return {
        url: imageUrl,
        source: 'unsplash',
        cost: 0 // Unsplash 免费
      };

    } catch (error) {
      console.error('Unsplash 获取失败:', error);
      return null;
    }
  }

  /**
   * 获取占位图片
   * 【修复】使用data URI而非外部URL，避免生产环境访问失败
   */
  private getPlaceholderImage(request: ImageRequest): ImageResult {
    // 返回简单的1x1透明PNG的data URI
    // 实际应用中，前端会显示一个本地的占位图标
    return {
      url: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTA4MCIgaGVpZ2h0PSIxMDgwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDgwIiBoZWlnaHQ9IjEwODAiIGZpbGw9IiNlZWYyZmYiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjQ4IiBmaWxsPSIjNjY3ZWVhIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+8J+OqCBJbWFnZTwvdGV4dD48L3N2Zz4=',
      source: 'placeholder',
      cost: 0
    };
  }

  /**
   * 上传图片到 Supabase Storage
   */
  private async uploadToSupabase(
    base64Data: string,
    userId: string,
    source: string,
    mimeType: string
  ): Promise<{ url: string, storageKey: string }> {
    if (!this.supabase) {
      throw new Error('Supabase 未初始化');
    }

    try {
      // 根据mimeType确定扩展名
      const extension = mimeType.includes('png') ? '.png' :
                       mimeType.includes('jpeg') || mimeType.includes('jpg') ? '.jpg' :
                       '.png';

      // 生成文件名和存储路径
      const timestamp = Date.now();
      const filename = `${source}_${timestamp}${extension}`;
      const storageKey = `users/${userId}/images/${filename}`;

      // 转换 base64 为 Buffer
      const buffer = Buffer.from(base64Data, 'base64');

      console.log(`📤 [Supabase] 开始上传图片: ${storageKey}`);

      // 上传到 Supabase Storage
      const { data, error } = await this.supabase.storage
        .from('images')
        .upload(storageKey, buffer, {
          contentType: mimeType,
          upsert: false
        });

      if (error) {
        console.error('❌ [Supabase] 上传失败:', error);
        throw new Error(`Supabase上传失败: ${error.message}`);
      }

      // 获取公网 URL
      const { data: { publicUrl } } = this.supabase.storage
        .from('images')
        .getPublicUrl(storageKey);

      console.log('✅ [Supabase] 图片上传成功:', publicUrl);

      return { url: publicUrl, storageKey };
    } catch (error: any) {
      console.error('❌ [Supabase] 上传异常:', error.message);
      throw error;
    }
  }

  /**
   * 保存base64图片到本地（备用方案，当Supabase不可用时使用）
   */
  private async saveBase64Image(base64Data: string, source: string, mimeType: string): Promise<string> {
    try {
      // 创建下载目录
      const downloadDir = path.join(process.cwd(), 'downloads', 'images');
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
      }

      // 根据mimeType确定扩展名
      const extension = mimeType.includes('png') ? '.png' :
                       mimeType.includes('jpeg') || mimeType.includes('jpg') ? '.jpg' :
                       '.png';

      // 生成文件名
      const timestamp = Date.now();
      const filename = `${source}_${timestamp}${extension}`;
      const filepath = path.join(downloadDir, filename);

      // 将base64转换为buffer并保存
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(filepath, buffer);

      console.log(`📁 [Gemini] 图片已保存: ${filepath}`);
      return filepath;

    } catch (error) {
      console.error('📁 [Gemini] 保存图片失败:', error);
      throw error;
    }
  }

  /**
   * 下载图片到本地
   */
  private async downloadImage(url: string, source: string): Promise<string> {
    try {
      const response = await fetch(url);
      const buffer = await response.buffer();

      // 创建下载目录
      const downloadDir = path.join(process.cwd(), 'downloads', 'images');
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
      }

      // 生成文件名
      const timestamp = Date.now();
      const extension = this.getImageExtension(url);
      const filename = `${source}_${timestamp}${extension}`;
      const filepath = path.join(downloadDir, filename);

      // 保存文件
      fs.writeFileSync(filepath, buffer);

      console.log(`📁 图片已保存: ${filepath}`);
      return filepath;

    } catch (error) {
      console.error('下载图片失败:', error);
      throw error;
    }
  }

  /**
   * 获取风格提示词
   */
  private getStylePrompt(style?: string): string {
    switch (style) {
      case 'realistic':
        return 'photorealistic, detailed, professional photography, natural lighting';
      case 'cartoon':
        return 'cartoon style, colorful, friendly, cute illustration, anime style';
      case 'painting':
        return 'digital painting, artistic, beautiful colors, brush strokes';
      case 'sketch':
        return 'pencil sketch, hand-drawn, artistic, line art';
      default:
        return 'modern, clean, vibrant colors, professional, aesthetic';
    }
  }

  /**
   * 从提示词中提取关键词
   */
  private extractKeywords(prompt: string): string[] {
    // 简单的关键词提取逻辑
    const keywords = prompt
      .toLowerCase()
      .replace(/[，。！？；：""''（）【】]/g, ' ') // 移除中文标点
      .replace(/[,.!?;:""''()\[\]]/g, ' ') // 移除英文标点
      .split(/\s+/)
      .filter(word => word.length > 1)
      .slice(0, 5); // 只取前5个关键词

    return keywords.length > 0 ? keywords : ['lifestyle', 'modern'];
  }

  /**
   * 获取图片扩展名
   */
  private getImageExtension(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const ext = path.extname(pathname);
      return ext || '.jpg';
    } catch {
      return '.jpg';
    }
  }

  /**
   * 获取Unsplash图片方向
   */
  private getUnsplashOrientation(aspectRatio?: string): string {
    switch (aspectRatio) {
      case '9:16':
        return 'portrait';
      case '16:9':
        return 'landscape';
      case '1:1':
      default:
        return 'squarish';
    }
  }

  /**
   * 获取占位图尺寸
   */
  private getPlaceholderDimensions(aspectRatio?: string): string {
    switch (aspectRatio) {
      case '9:16':
        return '720x1280';
      case '16:9':
        return '1280x720';
      case '1:1':
      default:
        return '1080x1080';
    }
  }

  /**
   * 计算 Gemini 成本
   */
  private calculateGeminiCost(aspectRatio?: string): number {
    // Gemini Imagen 的大概成本 (需要根据实际定价调整)
    const basePrice = 0.02; // 假设每张图片 $0.02

    switch (aspectRatio) {
      case '9:16':
      case '16:9':
        return basePrice * 1.5; // 非正方形稍贵
      case '1:1':
      default:
        return basePrice;
    }
  }

  /**
   * 批量生成图片
   */
  async generateBatchImages(requests: ImageRequest[]): Promise<ImageResult[]> {
    const results: ImageResult[] = [];

    for (const request of requests) {
      try {
        const result = await this.generateImage(request);
        results.push(result);

        // 避免API限制，每次生成后等待2秒
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error('批量生成失败:', error);
        results.push(this.getPlaceholderImage(request));
      }
    }

    return results;
  }

  /**
   * 获取使用统计
   */
  getUsageStats() {
    // 这里可以实现使用统计逻辑
    return {
      totalGenerated: 0,
      totalCost: 0,
      averageCost: 0,
      sourceBreakdown: {
        gemini: 0,
        unsplash: 0,
        placeholder: 0
      }
    };
  }

  /**
   * 根据内容类型智能选择图片风格
   */
  getRecommendedStyle(contentType: string, topic: string): string {
    const content = `${contentType} ${topic}`.toLowerCase();

    if (content.includes('美食') || content.includes('咖啡') || content.includes('餐厅')) {
      return 'realistic';
    }

    if (content.includes('可爱') || content.includes('萌宠') || content.includes('儿童')) {
      return 'cartoon';
    }

    if (content.includes('艺术') || content.includes('设计') || content.includes('创意')) {
      return 'painting';
    }

    if (content.includes('教程') || content.includes('步骤') || content.includes('说明')) {
      return 'sketch';
    }

    return 'realistic'; // 默认使用真实风格
  }
}

export default ImageGenerationService;