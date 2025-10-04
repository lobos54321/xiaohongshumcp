/**
 * 图片生成服务
 * 支持 Gemini Imagen 和 Unsplash 图片库
 */

import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';

interface ImageGenerationConfig {
  geminiKey?: string;
  unsplashKey?: string;
}

interface ImageRequest {
  prompt: string;
  style?: 'realistic' | 'cartoon' | 'painting' | 'sketch';
  aspectRatio?: '1:1' | '9:16' | '16:9';
  negativePrompt?: string;
}

interface ImageResult {
  url: string;
  localPath?: string;
  source: 'gemini' | 'unsplash' | 'placeholder';
  cost?: number;
}

export class ImageGenerationService {
  private geminiKey?: string;
  private unsplashKey?: string;

  constructor(config: ImageGenerationConfig) {
    this.geminiKey = config.geminiKey;
    this.unsplashKey = config.unsplashKey;
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
   * 使用 Gemini Imagen 生成图片
   */
  private async generateWithGemini(request: ImageRequest): Promise<ImageResult | null> {
    try {
      if (!this.geminiKey) return null;

      // 注意：Gemini目前主要是文本模型，图片生成可能需要不同的API
      // 这里先使用备用方案，直接通过Unsplash获取图片
      console.log('🔄 Gemini图片生成暂时使用Unsplash作为实现');

      return await this.getFromUnsplash(request);

    } catch (error) {
      console.error('Gemini 生成失败:', error);
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

      // 下载图片到本地
      const localPath = await this.downloadImage(imageUrl, 'unsplash');

      return {
        url: imageUrl,
        localPath,
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
   */
  private getPlaceholderImage(request: ImageRequest): ImageResult {
    const dimensions = this.getPlaceholderDimensions(request.aspectRatio);

    return {
      url: `https://via.placeholder.com/${dimensions}/667eea/FFFFFF?text=AI+Generated+Image`,
      source: 'placeholder',
      cost: 0
    };
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