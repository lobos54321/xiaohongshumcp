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
  geminiBaseUrl?: string;   // OpenAI 兼容 API 地址
  geminiModel?: string;     // 模型名称
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
  private geminiBaseUrl: string;
  private geminiModel: string;
  private unsplashKey?: string;
  private supabase?: SupabaseClient;

  constructor(config: ImageGenerationConfig) {
    this.geminiKey = config.geminiKey;
    this.geminiBaseUrl = (config.geminiBaseUrl || process.env.GEMINI_BASE_URL || 'http://bruder.yukinoapi.com/v1').replace(/\/$/, '');
    this.geminiModel = config.geminiModel || process.env.GEMINI_MODEL || 'gemini-3-pro-image-preview';
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
   * 使用 OpenAI 兼容 API 调用 Gemini 图片生成
   */
  private async generateWithGemini(request: ImageRequest): Promise<ImageResult | null> {
    try {
      if (!this.geminiKey) {
        console.log('⚠️ [Gemini] 未配置GEMINI_API_KEY');
        return null;
      }

      console.log(`🎨 [Gemini] 开始使用 ${this.geminiModel} 生成图片 (via ${this.geminiBaseUrl})`);
      const stylePrompt = this.getStylePrompt(request.style);
      const fullPrompt = `Generate a high-quality studio image for a social media post: ${request.prompt}.
      Style requirements: ${stylePrompt}.
      Technical requirements: high resolution, professional lighting, social media aesthetic, stunning composition.`;

      console.log('🎨 [Gemini] 提示词:', fullPrompt.substring(0, 100) + '...');

      const response = await fetch(`${this.geminiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.geminiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.geminiModel,
          messages: [{ role: 'user', content: fullPrompt }],
          max_tokens: 4096
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('🎨 [Gemini] API错误:', response.status, errorText.substring(0, 200));
        console.log('🎨 [Gemini] 自动切换到 Unsplash 备选方案');
        return await this.getFromUnsplash(request);
      }

      const data = await response.json() as any;
      const content = data.choices?.[0]?.message?.content || '';
      console.log('🎨 [Gemini] API响应状态:', response.status, '内容长度:', content.length);

      // 解析返回内容：支持 base64 data URI 和普通 URL
      let base64Data: string | null = null;
      let imageUrl: string | null = null;
      let mimeType = 'image/png';

      // 匹配 ![image](data:image/xxx;base64,...) 格式
      const base64Match = content.match(/!\[.*?\]\(data:(image\/[^;]+);base64,([^)]+)\)/);
      if (base64Match) {
        mimeType = base64Match[1];
        base64Data = base64Match[2];
        console.log('🎨 [Gemini] 提取到 base64 图片数据，mimeType:', mimeType);
      }

      // 匹配 ![image](https://...) 格式
      if (!base64Data) {
        const urlMatch = content.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/);
        if (urlMatch) {
          imageUrl = urlMatch[1];
          console.log('🎨 [Gemini] 提取到图片 URL:', imageUrl);
        }
      }

      // 处理 base64 数据
      if (base64Data) {
        if (this.supabase) {
          try {
            const { url, storageKey } = await this.uploadToSupabase(
              base64Data, request.userId, 'gemini', mimeType
            );
            console.log(`✅ [Gemini] Supabase上传成功: ${url}`);
            return { url, storageKey, source: 'gemini', cost: 0.03 };
          } catch (supabaseError: any) {
            console.warn(`⚠️ [Gemini] Supabase上传失败，fallback到本地存储: ${supabaseError.message}`);
          }
        }

        console.log('📁 [Gemini] 使用本地存储');
        const localPath = await this.saveBase64Image(base64Data, 'gemini', mimeType);
        const filename = path.basename(localPath);
        const baseUrl = process.env.PUBLIC_URL || 'http://localhost:8080';
        return { url: `${baseUrl}/images/${filename}`, storageKey: localPath, source: 'gemini', cost: 0.03 };
      }

      // 处理 URL 返回（下载后上传到 Supabase）
      if (imageUrl) {
        if (this.supabase) {
          try {
            const imgResp = await fetch(imageUrl);
            if (imgResp.ok) {
              const buffer = Buffer.from(await imgResp.arrayBuffer());
              const b64 = buffer.toString('base64');
              const ct = imgResp.headers.get('content-type') || 'image/png';
              const { url, storageKey } = await this.uploadToSupabase(b64, request.userId, 'gemini', ct);
              console.log(`✅ [Gemini] 下载并上传到Supabase成功: ${url}`);
              return { url, storageKey, source: 'gemini', cost: 0.03 };
            }
          } catch (dlError: any) {
            console.warn(`⚠️ [Gemini] 下载图片失败: ${dlError.message}`);
          }
        }
        // 直接返回外部 URL
        return { url: imageUrl, source: 'gemini', cost: 0.03 };
      }

      console.error('🎨 [Gemini] 响应中未找到图片数据！content:', content.substring(0, 200));
      return null;

    } catch (error: any) {
      console.error('🎨 [Gemini] 生成失败:', error.message);
      return null;
    }
  }

  /**
   * 从 Unsplash 获取图片
   */
  private async getFromUnsplash(request: ImageRequest): Promise<ImageResult | null> {
    try {
      if (!this.unsplashKey) return null;

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

      const photo = data.results[0];
      const imageUrl = photo.urls.regular;

      return {
        url: imageUrl,
        source: 'unsplash',
        cost: 0
      };
    } catch (error) {
      console.error('Unsplash 获取失败:', error);
      return null;
    }
  }

  /**
   * 获取占位图片
   */
  private getPlaceholderImage(request: ImageRequest): ImageResult {
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
      const extension = mimeType.includes('png') ? '.png' :
        mimeType.includes('jpeg') || mimeType.includes('jpg') ? '.jpg' : '.png';

      const timestamp = Date.now();
      const filename = `${source}_${timestamp}${extension}`;
      const storageKey = `users/${userId}/images/${filename}`;
      const buffer = Buffer.from(base64Data, 'base64');

      console.log(`📤 [Supabase] 开始上传图片: ${storageKey}`);

      const { data, error } = await this.supabase.storage
        .from('images')
        .upload(storageKey, buffer, {
          contentType: mimeType,
          upsert: false
        });

      if (error) {
        throw new Error(`Supabase上传失败: ${error.message}`);
      }

      const { data: { publicUrl } } = this.supabase.storage
        .from('images')
        .getPublicUrl(storageKey);

      return { url: publicUrl, storageKey };
    } catch (error: any) {
      console.error('❌ [Supabase] 上传异常:', error.message);
      throw error;
    }
  }

  /**
   * 保存base64图片到本地
   */
  private async saveBase64Image(base64Data: string, source: string, mimeType: string): Promise<string> {
    try {
      const downloadDir = path.join(process.cwd(), 'downloads', 'images');
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
      }

      const extension = mimeType.includes('png') ? '.png' :
        mimeType.includes('jpeg') || mimeType.includes('jpg') ? '.jpg' : '.png';

      const filename = `${source}_${Date.now()}${extension}`;
      const filepath = path.join(downloadDir, filename);
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(filepath, buffer);

      return filepath;
    } catch (error) {
      console.error('📁 [Gemini] 保存图片失败:', error);
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
        return 'cartoon style, colorful, friendly, cute illustration';
      case 'painting':
        return 'digital painting, artistic, beautiful colors';
      case 'sketch':
        return 'pencil sketch, hand-drawn, artistic';
      default:
        return 'modern, clean, vibrant colors, professional, aesthetic';
    }
  }

  /**
   * 从提示词中提取关键词
   */
  private extractKeywords(prompt: string): string[] {
    const keywordMappings: Record<string, string[]> = {
      'lifestyle': ['lifestyle', 'daily life'],
      'modern': ['modern', 'minimalist'],
      'aesthetic': ['aesthetic', 'beautiful'],
      'product': ['product photography', 'showcase'],
      'ai': ['artificial intelligence', 'technology'],
      '内容': ['content creation', 'digital'],
      '创作': ['creative', 'workspace'],
      '营销': ['marketing', 'business'],
      '科技': ['technology', 'innovation'],
      '创业': ['startup', 'entrepreneur'],
      '博主': ['influencer', 'social media'],
      '地产': ['real estate', 'architecture'],
    };

    const words = prompt.toLowerCase().replace(/[^\w\s\u4e00-\u9fa5]/g, ' ').split(/\s+/).filter(word => word.length > 1);
    const mappedKeywords: string[] = [];
    for (const word of words) {
      if (keywordMappings[word]) {
        mappedKeywords.push(...keywordMappings[word]);
      } else if (word.length > 2) {
        mappedKeywords.push(word);
      }
    }

    return [...new Set(mappedKeywords)].slice(0, 5);
  }

  /**
   * 获取Unsplash图片方向
   */
  private getUnsplashOrientation(aspectRatio?: string): string {
    switch (aspectRatio) {
      case '9:16': return 'portrait';
      case '16:9': return 'landscape';
      default: return 'squarish';
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
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        results.push(this.getPlaceholderImage(request));
      }
    }
    return results;
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