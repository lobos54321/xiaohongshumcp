/**
 * 增强的发布服务 - 集成AI图片生成
 * 解决图文发布需要图片的问题
 */

import ImageGenerationService from './imageGenerationService.js';
import * as dotenv from 'dotenv';

dotenv.config();

interface EnhancedPublishRequest {
  title: string;
  content: string;
  images?: string[];
  auto_generate_image?: boolean;
  image_prompt?: string;
  style?: 'realistic' | 'cartoon' | 'painting' | 'sketch';
  aspectRatio?: '1:1' | '9:16' | '16:9';
  privacy?: string;
  userId: string;
}

interface VideoPublishRequest {
  title: string;
  content: string;
  video: string; // 视频URL或路径
  cover?: string; // 封面图片
  auto_generate_cover?: boolean;
  privacy?: string;
  userId: string;
}

export class EnhancedPublishService {
  private imageService: ImageGenerationService;
  private mcpBaseUrl: string;

  constructor(mcpBaseUrl: string = 'http://localhost:18062') {
    this.mcpBaseUrl = mcpBaseUrl;
    this.imageService = new ImageGenerationService({
      geminiKey: process.env.GEMINI_API_KEY,
      unsplashKey: process.env.UNSPLASH_API_KEY
    });
  }

  /**
   * 智能图文发布 - 自动生成图片
   */
  async publishWithAutoImage(request: EnhancedPublishRequest) {
    try {
      console.log('🚀 开始智能图文发布...');

      let finalImages = request.images || [];

      // 如果没有图片且开启了自动生成
      if ((!finalImages || finalImages.length === 0) && request.auto_generate_image !== false) {
        console.log('🎨 开始生成AI图片...');

        // 从内容中提取图片提示词
        const imagePrompt = request.image_prompt || this.extractImagePrompt(request.content);

        // 智能选择风格
        const style = request.style || this.imageService.getRecommendedStyle('post', request.content) as 'realistic' | 'cartoon' | 'painting' | 'sketch';

        console.log(`📝 图片提示词: ${imagePrompt}`);
        console.log(`🎭 选择风格: ${style}`);

        // 生成图片
        const imageResult = await this.imageService.generateImage({
          prompt: imagePrompt,
          userId: request.userId,  // 添加 userId
          style: style,
          aspectRatio: request.aspectRatio || '1:1'
        });

        if (imageResult.url) {
          finalImages = [imageResult.url];
          console.log(`✅ 图片生成成功: ${imageResult.source} - ${imageResult.url}`);
        } else {
          throw new Error('图片生成失败');
        }
      }

      // 验证必需的图片
      if (!finalImages || finalImages.length === 0) {
        // 使用占位图片作为最后手段
        console.log('⚠️ 使用占位图片');
        finalImages = ['https://via.placeholder.com/1080x1080/667eea/FFFFFF?text=AI+Generated+Content'];
      }

      // 构建发布请求
      // 🔥 CRITICAL FIX: 必须包含userId，MCP Router需要它来为每个用户创建独立进程
      const publishData = {
        userId: request.userId,  // ← 添加userId字段
        title: request.title,
        content: request.content,
        images: finalImages,
        privacy: request.privacy || 'public'
      };

      console.log('📤 向小红书发布内容...');
      console.log('发布数据:', JSON.stringify(publishData, null, 2));

      // 调用小红书MCP API
      const response = await fetch(`${this.mcpBaseUrl}/api/v1/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(publishData)
      });

      const result = await response.json() as any;

      if (!response.ok) {
        throw new Error(`发布失败: ${result?.error || response.statusText}`);
      }

      console.log('🎉 图文发布成功!');
      return {
        success: true,
        data: result,
        generatedImages: finalImages,
        message: '图文发布成功'
      };

    } catch (error) {
      console.error('❌ 图文发布失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: '图文发布失败'
      };
    }
  }

  /**
   * 视频发布 - 自动生成封面
   */
  async publishVideo(request: VideoPublishRequest) {
    try {
      console.log('🎬 开始视频发布...');

      let coverImage = request.cover;

      // 如果没有封面且开启了自动生成
      if (!coverImage && request.auto_generate_cover !== false) {
        console.log('🖼️ 开始生成视频封面...');

        // 从标题和内容生成封面图片
        const coverPrompt = `视频封面，${request.title}，${request.content}`;

        const imageResult = await this.imageService.generateImage({
          prompt: coverPrompt,
          userId: request.userId,  // 添加 userId
          style: 'realistic',
          aspectRatio: '16:9' // 视频封面通常是横向的
        });

        if (imageResult.url) {
          coverImage = imageResult.url;
          console.log(`✅ 封面生成成功: ${imageResult.source} - ${imageResult.url}`);
        }
      }

      // 构建视频发布请求
      const videoData = {
        title: request.title,
        content: request.content,
        video: request.video, // 注意：这里是video字段，不是video_path
        cover: coverImage,
        privacy: request.privacy || 'public'
      };

      console.log('📤 向小红书发布视频...');
      console.log('视频数据:', JSON.stringify(videoData, null, 2));

      // 调用小红书MCP API
      const response = await fetch(`${this.mcpBaseUrl}/api/v1/publish_video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(videoData)
      });

      const result = await response.json() as any;

      if (!response.ok) {
        throw new Error(`视频发布失败: ${result?.error || response.statusText}`);
      }

      console.log('🎉 视频发布成功!');
      return {
        success: true,
        data: result,
        generatedCover: coverImage,
        message: '视频发布成功'
      };

    } catch (error) {
      console.error('❌ 视频发布失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: '视频发布失败'
      };
    }
  }

  /**
   * 从内容中提取图片提示词
   */
  private extractImagePrompt(content: string): string {
    // 简单的关键词提取逻辑
    const keywords = content
      .replace(/[#@]/g, ' ') // 移除话题标签
      .replace(/[^\u4e00-\u9fa5\w\s]/g, ' ') // 保留中文和英文
      .split(/\s+/)
      .filter(word => word.length > 1)
      .slice(0, 10) // 取前10个关键词
      .join(' ');

    return keywords || '生活方式，现代简约，美好时光';
  }

  /**
   * 批量发布内容
   */
  async batchPublish(requests: EnhancedPublishRequest[]) {
    const results = [];

    for (const request of requests) {
      try {
        const result = await this.publishWithAutoImage(request);
        results.push(result);

        // 避免API限制，每次发布后等待3秒
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          originalRequest: request
        });
      }
    }

    return results;
  }

  /**
   * 测试发布功能
   */
  async testPublish() {
    console.log('🧪 测试AI增强发布功能...');

    const testRequest: EnhancedPublishRequest = {
      title: 'AI测试发布',
      content: '🤖 这是一个AI自动化测试发布，展示了自动图片生成功能 #AI #测试 #自动化',
      auto_generate_image: true,
      image_prompt: '科技感AI机器人，现代办公环境',
      style: 'realistic',
      privacy: 'draft',
      userId: 'test-user'
    };

    return await this.publishWithAutoImage(testRequest);
  }

  /**
   * 测试视频发布功能
   */
  async testVideoPublish() {
    console.log('🧪 测试视频发布功能...');

    const testRequest: VideoPublishRequest = {
      title: 'AI视频测试',
      content: '🎬 这是一个AI视频发布测试 #视频 #AI',
      video: 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4', // 示例视频
      auto_generate_cover: true,
      privacy: 'draft',
      userId: 'test-user'
    };

    return await this.publishVideo(testRequest);
  }
}

export default EnhancedPublishService;