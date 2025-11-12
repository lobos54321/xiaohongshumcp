/**
 * 小红书发布服务
 * 支持图文和视频发布
 */
import { XiaohongshuBrowser } from './XiaohongshuBrowser.js';
import { Page } from 'playwright';
import * as path from 'path';

export interface PublishImageParams {
  title: string;
  content: string;
  images: string[];  // 图片文件路径（最多9张）
  hashtags?: string[];
  location?: string; // 位置信息（可选）
  visibility?: 'public' | 'private'; // 可见性
}

export interface PublishVideoParams {
  title: string;
  content: string;
  videoPath: string;
  coverPath?: string;  // 视频封面（可选）
  hashtags?: string[];
  location?: string;
  visibility?: 'public' | 'private';
}

export interface PublishResult {
  success: boolean;
  postUrl?: string;
  postId?: string;
  error?: string;
}

export class PublishService {
  private readonly PUBLISH_URL = 'https://creator.xiaohongshu.com/publish/publish';
  private readonly TIMEOUT = 300000; // 5分钟（发布可能很慢）

  constructor(private browser: XiaohongshuBrowser) {}

  /**
   * 发布图文内容
   */
  async publishImages(userId: string, params: PublishImageParams): Promise<PublishResult> {
    console.log(`[PublishService] 用户 ${userId} 开始发布图文`);
    console.log(`[PublishService] 标题: ${params.title}`);
    console.log(`[PublishService] 图片数量: ${params.images.length}`);

    const page = await this.browser.createPage(userId);

    try {
      // 1. 访问发布页面
      console.log('[PublishService] 1/6 访问发布页面...');
      await page.goto(this.PUBLISH_URL, { waitUntil: 'networkidle', timeout: this.TIMEOUT });

      // 检查是否需要登录
      const isLoginPage = await page.locator('text=登录').isVisible({ timeout: 3000 }).catch(() => false);
      if (isLoginPage) {
        throw new Error('用户未登录，请先登录');
      }

      // 2. 上传图片
      console.log('[PublishService] 2/6 上传图片...');
      await this.uploadImages(page, params.images);

      // 3. 填写标题
      console.log('[PublishService] 3/6 填写标题...');
      await this.fillTitle(page, params.title);

      // 4. 填写内容（包括话题标签）
      console.log('[PublishService] 4/6 填写内容和标签...');
      await this.fillContent(page, params.content, params.hashtags);

      // 5. 设置位置（如果提供）
      if (params.location) {
        console.log('[PublishService] 5/6 设置位置...');
        await this.setLocation(page, params.location);
      }

      // 6. 发布
      console.log('[PublishService] 6/6 点击发布...');
      const result = await this.clickPublish(page);

      // 保存 Cookie（发布后可能有新的会话信息）
      await this.browser.saveUserCookies(userId);

      await page.close();

      console.log(`[PublishService] ✅ 发布成功: ${result.postUrl}`);
      return result;

    } catch (error: any) {
      await page.close();
      console.error('[PublishService] ❌ 发布失败:', error);
      return {
        success: false,
        error: error.message || String(error),
      };
    }
  }

  /**
   * 上传图片
   */
  private async uploadImages(page: Page, imagePaths: string[]): Promise<void> {
    if (!imagePaths || imagePaths.length === 0) {
      throw new Error('至少需要1张图片');
    }

    if (imagePaths.length > 9) {
      throw new Error('最多支持9张图片');
    }

    // 查找文件上传输入框
    const fileInput = page.locator('input[type="file"]').first();

    // 上传所有图片
    await fileInput.setInputFiles(imagePaths);

    // 等待图片上传完成
    console.log(`[PublishService] 等待 ${imagePaths.length} 张图片上传...`);

    // 等待上传进度消失（根据实际页面调整选择器）
    await page.waitForSelector('.upload-progress, .uploading', {
      state: 'hidden',
      timeout: this.TIMEOUT
    }).catch(() => {
      console.warn('[PublishService] 上传进度元素未找到，继续...');
    });

    // 等待缩略图出现
    await page.waitForSelector('.image-item, .uploaded-image', {
      state: 'visible',
      timeout: this.TIMEOUT
    });

    console.log('[PublishService] ✅ 图片上传完成');
  }

  /**
   * 填写标题
   */
  private async fillTitle(page: Page, title: string): Promise<void> {
    // 根据实际页面调整选择器
    const titleInput = page.locator('input[placeholder*="标题"], .title-input, #post-title').first();

    await titleInput.waitFor({ state: 'visible', timeout: 10000 });
    await titleInput.fill(title);

    console.log(`[PublishService] ✅ 标题已填写: ${title}`);
  }

  /**
   * 填写内容和话题标签
   */
  private async fillContent(page: Page, content: string, hashtags?: string[]): Promise<void> {
    // 组合内容和标签
    let fullContent = content;

    if (hashtags && hashtags.length > 0) {
      const tags = hashtags.map(tag => tag.startsWith('#') ? tag : `#${tag}`).join(' ');
      fullContent = `${content}\n\n${tags}`;
    }

    // 查找内容输入框（可能是 textarea 或 contenteditable div）
    const contentInput = page.locator(
      'textarea[placeholder*="正文"], .content-input, .ql-editor, [contenteditable="true"]'
    ).first();

    await contentInput.waitFor({ state: 'visible', timeout: 10000 });

    // 尝试填写（处理不同类型的输入框）
    const tagName = await contentInput.evaluate((el) => el.tagName);

    if (tagName === 'TEXTAREA' || tagName === 'INPUT') {
      await contentInput.fill(fullContent);
    } else {
      // contenteditable div
      await contentInput.click();
      await page.keyboard.type(fullContent, { delay: 50 });
    }

    console.log(`[PublishService] ✅ 内容已填写 (${fullContent.length} 字符)`);
  }

  /**
   * 设置位置
   */
  private async setLocation(page: Page, location: string): Promise<void> {
    try {
      // 查找位置按钮/输入框
      const locationButton = page.locator('text=添加地点, .location-btn, .add-location').first();

      if (await locationButton.isVisible({ timeout: 3000 })) {
        await locationButton.click();

        // 等待位置搜索框
        const locationSearch = page.locator('input[placeholder*="搜索地点"], .location-search').first();
        await locationSearch.fill(location);

        // 等待搜索结果并选择第一个
        await page.waitForTimeout(1000);
        const firstResult = page.locator('.location-result-item, .poi-item').first();
        await firstResult.click();

        console.log(`[PublishService] ✅ 位置已设置: ${location}`);
      }
    } catch (error) {
      console.warn('[PublishService] ⚠️ 设置位置失败，跳过:', error);
    }
  }

  /**
   * 点击发布按钮
   */
  private async clickPublish(page: Page): Promise<PublishResult> {
    // 查找发布按钮
    const publishButton = page.locator(
      'button:has-text("发布"), button.publish-btn, .submit-btn'
    ).first();

    await publishButton.waitFor({ state: 'visible', timeout: 10000 });

    // 检查按钮是否可点击（可能被禁用）
    const isEnabled = await publishButton.isEnabled();
    if (!isEnabled) {
      throw new Error('发布按钮被禁用，请检查必填项');
    }

    // 点击发布
    await publishButton.click();

    // 等待发布成功提示或跳转
    try {
      // 方式1: 等待成功提示
      await page.waitForSelector(
        'text=发布成功, .success-toast, .publish-success',
        { timeout: 30000 }
      );

      console.log('[PublishService] ✅ 检测到发布成功提示');

      // 尝试获取发布链接
      const postUrl = await this.extractPostUrl(page);

      return {
        success: true,
        postUrl,
      };

    } catch (error) {
      // 方式2: 检查URL是否跳转到作品详情页
      await page.waitForTimeout(5000);
      const currentUrl = page.url();

      if (currentUrl.includes('/publish/success') || currentUrl.includes('/user/')) {
        console.log('[PublishService] ✅ 检测到页面跳转，发布可能成功');

        return {
          success: true,
          postUrl: currentUrl,
        };
      }

      throw new Error('发布超时或失败，未检测到成功标志');
    }
  }

  /**
   * 提取发布后的帖子 URL
   */
  private async extractPostUrl(page: Page): Promise<string | undefined> {
    try {
      // 方式1: 从成功页面的链接提取
      const linkLocator = page.locator('a[href*="/explore/"]').first();
      const href = await linkLocator.getAttribute('href', { timeout: 5000 });

      if (href) {
        return href.startsWith('http') ? href : `https://www.xiaohongshu.com${href}`;
      }

      // 方式2: 从当前URL提取
      const currentUrl = page.url();
      if (currentUrl.includes('/explore/') || currentUrl.includes('/item/')) {
        return currentUrl;
      }

    } catch (error) {
      console.warn('[PublishService] ⚠️ 无法提取帖子链接:', error);
    }

    return undefined;
  }

  /**
   * 发布视频（简化版本，可扩展）
   */
  async publishVideo(userId: string, params: PublishVideoParams): Promise<PublishResult> {
    console.log(`[PublishService] 用户 ${userId} 开始发布视频`);

    // TODO: 实现视频发布逻辑
    // 与图文类似，但需要处理视频上传、封面选择等

    return {
      success: false,
      error: '视频发布功能待实现',
    };
  }
}
