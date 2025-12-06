
import { chromium, BrowserContext, Page } from 'playwright';
import { CookieManager } from './cookieManager.js';
import { BrowserSessionManager } from './browserSessionManager.js';
import * as fs from 'fs';
import * as path from 'path';

export class PlaywrightPublisher {
    private cookieManager: CookieManager;
    private browserSessionManager: BrowserSessionManager;

    constructor(browserSessionManager: BrowserSessionManager) {
        this.cookieManager = new CookieManager();
        this.browserSessionManager = browserSessionManager;
    }

    async publishContent(userId: string, content: {
        title: string;
        content: string;
        images: string[];
        topics?: string[];
    }): Promise<void> {
        console.log(`[PlaywrightPublisher] 开始为用户 ${userId} 发布内容: ${content.title}`);

        const context = this.browserSessionManager.getSession(userId);
        if (!context) {
            throw new Error(`No active browser session for user ${userId}. Please login first via QR code.`);
        }

        console.log(`[PlaywrightPublisher] ✅ Using existing browser session for ${userId}`);
        this.browserSessionManager.updateActivity(userId);

        let page: Page | null = null;

        try {
            page = await context.newPage();

            // 1. 访问发布页面
            console.log('[PlaywrightPublisher] 正在访问发布页面...');
            await page.goto('https://creator.xiaohongshu.com/publish/publish?source=official', {
                waitUntil: 'networkidle',
                timeout: 60000
            });

            console.log('[PlaywrightPublisher] ⏳ Waiting for session validation...');
            await page.waitForTimeout(3000);

            // 检查登录状态
            if (page.url().includes('/login')) {
                throw new Error('Cookie已失效，需要重新登录');
            }

            // 2. 点击"上传图文" Tab (确保在正确的Tab)
            await this.ensurePublishTab(page, '上传图文');

            // 3. 上传图片
            console.log(`[PlaywrightPublisher] 正在上传 ${content.images.length} 张图片...`);
            const imagePaths: string[] = [];
            for (const imgUrl of content.images) {
                if (imgUrl.startsWith('http')) {
                    const imagePath = await this.downloadImage(imgUrl);
                    imagePaths.push(imagePath);
                } else {
                    imagePaths.push(imgUrl);
                }
            }

            // 使用参考实现的 .upload-input 选择器
            const uploadInput = page.locator('.upload-input');
            // 如果 .upload-input 不可见 (被样式隐藏), Playwright setInputFiles 仍然可以工作，但最好检查一下
            // 或者使用通用的 input[type="file"]
            if (await uploadInput.count() > 0) {
                await uploadInput.setInputFiles(imagePaths);
            } else {
                await page.locator('input[type="file"]').setInputFiles(imagePaths);
            }

            // 等待图片预览出现 (.img-preview-area .pr)
            try {
                await page.waitForSelector('.img-preview-area .pr', { timeout: 30000 });
                console.log('[PlaywrightPublisher] 图片上传完成');
            } catch (e) {
                console.warn('[PlaywrightPublisher] 未检测到图片预览，但继续尝试...');
            }

            // 4. 填写标题 (div.d-input input)
            console.log('[PlaywrightPublisher] 正在填写标题...');
            const titleInput = page.locator('div.d-input input');
            await titleInput.fill(content.title);
            await page.waitForTimeout(1000);

            // 5. 填写正文 (div.ql-editor)
            console.log('[PlaywrightPublisher] 正在填写正文...');
            const contentEditor = page.locator('div.ql-editor').first();
            if (await contentEditor.isVisible()) {
                await contentEditor.fill(content.content);
            } else {
                // Fallback: 尝试通过 placeholder 查找
                const placeholder = page.getByText('输入正文描述').first();
                if (await placeholder.isVisible()) {
                    await placeholder.click();
                    await page.keyboard.type(content.content);
                } else {
                    throw new Error('无法找到正文输入框');
                }
            }

            // 6. 添加话题 (Tags)
            if (content.topics && content.topics.length > 0) {
                console.log('[PlaywrightPublisher] 正在添加话题...');
                await this.inputTags(page, contentEditor, content.topics);
            }

            // 7. 点击发布 (div.submit div.d-button-content)
            console.log('[PlaywrightPublisher] 点击发布按钮...');
            const submitButton = page.locator('div.submit div.d-button-content');
            await submitButton.click();

            // 8. 等待发布成功
            try {
                // 这里的成功提示可能需要根据实际页面调整
                await page.waitForSelector('text=发布成功', { timeout: 15000 });
                console.log('[PlaywrightPublisher] ✅ 发布成功！');
            } catch (e) {
                console.warn('[PlaywrightPublisher] 未检测到明确的发布成功提示，可能已发布或需要人工确认');
            }

            // 清理临时图片
            for (const p of imagePaths) {
                if (p.startsWith('/tmp/')) {
                    try { fs.unlinkSync(p); } catch (e) { }
                }
            }

        } catch (error) {
            console.error('[PlaywrightPublisher] 发布失败:', error);
            if (page) {
                try {
                    await page.screenshot({ path: path.join(process.cwd(), `error-publish-${Date.now()}.png`), fullPage: true });
                } catch (e) { }
            }
            throw error;
        } finally {
            if (page) {
                await page.close().catch(() => { });
            }
        }
    }

    private async ensurePublishTab(page: Page, tabName: string): Promise<void> {
        try {
            const tab = page.locator(`div.creator-tab:has-text("${tabName}")`);
            if (await tab.count() > 0) {
                await this.removePopCover(page); // 移除可能的遮挡
                await tab.click();
                await page.waitForTimeout(1000);
            }
        } catch (e) {
            console.warn(`[PlaywrightPublisher] 切换Tab "${tabName}" 失败:`, e);
        }
    }

    private async removePopCover(page: Page): Promise<void> {
        try {
            const popover = page.locator('div.d-popover');
            if (await popover.count() > 0 && await popover.isVisible()) {
                console.log('[PlaywrightPublisher] 移除遮挡弹窗');
                await popover.evaluate((el: any) => el.remove());
            }
            // 点击空白处以关闭可能的下拉框
            await page.mouse.click(10, 10);
        } catch (e) { }
    }

    private async inputTags(page: Page, editor: any, tags: string[]): Promise<void> {
        // 换行
        await editor.press('Enter');
        await editor.press('Enter');
        await page.waitForTimeout(500);

        for (const tag of tags) {
            const cleanTag = tag.replace(/^#/, '');
            await editor.type('#');
            await page.waitForTimeout(200);
            await editor.type(cleanTag);
            await page.waitForTimeout(500);

            // 等待联想列表
            try {
                const topicContainer = page.locator('#creator-editor-topic-container .item').first();
                if (await topicContainer.isVisible({ timeout: 2000 })) {
                    await topicContainer.click();
                    console.log(`[PlaywrightPublisher] 已添加话题: #${cleanTag}`);
                } else {
                    // 如果没有联想，输入空格结束
                    await editor.type(' ');
                    console.log(`[PlaywrightPublisher] 未找到话题联想，直接输入: #${cleanTag}`);
                }
            } catch (e) {
                await editor.type(' ');
            }
            await page.waitForTimeout(500);
        }
    }

    private async downloadImage(url: string): Promise<string> {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        const tempPath = `/tmp/image-${Date.now()}-${Math.random().toString(36).substr(2, 5)}.jpg`;
        fs.writeFileSync(tempPath, Buffer.from(buffer));
        return tempPath;
    }
}
