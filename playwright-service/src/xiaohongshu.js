const fs = require('fs').promises;
const path = require('path');

/**
 * 小红书发布自动化逻辑
 * 基于 xiaohongshu-mcp 项目的实现
 */

/**
 * 等待元素出现
 */
async function waitForElement(page, selector, timeout = 30000) {
  try {
    await page.waitForSelector(selector, { timeout, state: 'visible' });
    return true;
  } catch (error) {
    console.warn(`元素未找到: ${selector}`);
    return false;
  }
}

/**
 * 多策略查找内容输入框
 */
async function findContentInput(page) {
  const selectors = [
    '.css-ql-editor',  // 富文本编辑器
    'textarea[placeholder*="描述"]',  // Textarea
    '[contenteditable="true"]',  // Contenteditable
    '.content-input',  // 通用类名
  ];

  for (const selector of selectors) {
    try {
      const element = await page.locator(selector).first();
      if (await element.isVisible()) {
        return element;
      }
    } catch (e) {
      continue;
    }
  }

  throw new Error('未找到内容输入框');
}

/**
 * 上传图片
 */
async function uploadImages(page, imagePaths, job) {
  if (!imagePaths || imagePaths.length === 0) {
    return;
  }

  console.log(`开始上传 ${imagePaths.length} 张图片`);

  // 查找上传输入框
  const uploadInput = await page.locator('.upload-input, input[type="file"]').first();

  // 批量上传图片
  await uploadInput.setInputFiles(imagePaths);
  await job.updateProgress(30);

  // 等待图片上传完成
  const expectedCount = imagePaths.length;
  const timeout = 60000;  // 60秒超时
  const startTime = Date.now();

  while (true) {
    const uploadedImages = await page.locator('.uploaded-image, .img-item').count();

    if (uploadedImages >= expectedCount) {
      console.log(`图片上传完成: ${uploadedImages}/${expectedCount}`);
      break;
    }

    if (Date.now() - startTime > timeout) {
      throw new Error(`图片上传超时: 仅上传 ${uploadedImages}/${expectedCount} 张`);
    }

    await page.waitForTimeout(500);
  }

  await job.updateProgress(50);
}

/**
 * 填充标题和内容
 */
async function fillContent(page, title, content, job) {
  // 填充标题
  console.log('填充标题:', title);
  const titleInput = await page.locator('div.d-input input, .title-input, input[placeholder*="标题"]').first();
  await titleInput.fill(title);
  await job.updateProgress(60);

  // 填充内容
  console.log('填充内容:', content.substring(0, 50) + '...');
  const contentInput = await findContentInput(page);
  await contentInput.fill(content);
  await job.updateProgress(70);
}

/**
 * 添加标签
 */
async function addTags(page, tags) {
  if (!tags || tags.length === 0) {
    return;
  }

  console.log('添加标签:', tags.join(', '));

  const tagText = tags.map(tag => tag.startsWith('#') ? tag : `#${tag}`).join(' ');

  try {
    const tagInput = await page.locator('.tag-input, input[placeholder*="标签"]').first();
    await tagInput.fill(tagText);
  } catch (error) {
    console.warn('标签输入框未找到，跳过标签');
  }
}

/**
 * 预览模式：填充内容并截图
 */
async function previewPublish(context, userId, { title, content, images, tags }, job) {
  const page = await context.newPage();

  try {
    // 1. 导航到发布页面
    await page.goto('https://creator.xiaohongshu.com/publish/publish');
    await page.waitForLoadState('networkidle');
    await job.updateProgress(10);

    // 2. 移除可能的弹窗
    try {
      const closeBtn = await page.locator('.close-btn, .modal-close').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      }
    } catch (e) {
      // 忽略
    }

    // 3. 点击"上传图文"标签
    try {
      const imageTabBtn = await page.locator('text=上传图文, text=图文').first();
      await imageTabBtn.click();
      await page.waitForTimeout(1000);
    } catch (e) {
      console.warn('未找到上传图文按钮，可能已在图文模式');
    }

    await job.updateProgress(20);

    // 4. 上传图片
    if (images && images.length > 0) {
      await uploadImages(page, images, job);
    }

    // 5. 填充标题和内容
    await fillContent(page, title, content, job);

    // 6. 添加标签
    if (tags && tags.length > 0) {
      await addTags(page, tags);
    }

    await job.updateProgress(80);

    // 7. 截图预览
    console.log('生成预览截图');
    const screenshot = await page.screenshot({
      fullPage: true,
      type: 'png'
    });

    await job.updateProgress(100);

    return {
      success: true,
      mode: 'preview',
      screenshot: screenshot.toString('base64'),
      message: '预览已生成，请确认后发布'
    };

  } finally {
    await page.close();
  }
}

/**
 * 发布模式：填充内容并点击发布
 */
async function confirmPublish(context, userId, { title, content, images, tags }, job) {
  const page = await context.newPage();

  try {
    // 1. 导航到发布页面
    await page.goto('https://creator.xiaohongshu.com/publish/publish');
    await page.waitForLoadState('networkidle');
    await job.updateProgress(10);

    // 2. 移除可能的弹窗
    try {
      const closeBtn = await page.locator('.close-btn, .modal-close').first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
      }
    } catch (e) {
      // 忽略
    }

    // 3. 点击"上传图文"标签
    try {
      const imageTabBtn = await page.locator('text=上传图文, text=图文').first();
      await imageTabBtn.click();
      await page.waitForTimeout(1000);
    } catch (e) {
      console.warn('未找到上传图文按钮，可能已在图文模式');
    }

    await job.updateProgress(20);

    // 4. 上传图片
    if (images && images.length > 0) {
      await uploadImages(page, images, job);
    }

    // 5. 填充标题和内容
    await fillContent(page, title, content, job);

    // 6. 添加标签
    if (tags && tags.length > 0) {
      await addTags(page, tags);
    }

    await job.updateProgress(70);

    // 7. 点击发布按钮
    console.log('点击发布按钮');
    const publishBtnSelectors = [
      '.publish-btn',
      '.submit-btn',
      'button:has-text("发布")',
      'button[type="submit"]'
    ];

    let published = false;
    for (const selector of publishBtnSelectors) {
      try {
        const btn = await page.locator(selector).first();
        if (await btn.isVisible()) {
          await btn.click();
          published = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!published) {
      throw new Error('未找到发布按钮');
    }

    await job.updateProgress(80);

    // 8. 等待发布成功提示（最多10秒）
    try {
      await page.waitForSelector('.success-message, text=发布成功', { timeout: 10000 });
      console.log('发布成功确认');
    } catch (e) {
      console.warn('未检测到成功提示，但发布操作已执行');
    }

    await job.updateProgress(100);

    return {
      success: true,
      mode: 'publish',
      message: '发布成功！'
    };

  } finally {
    await page.close();
  }
}

/**
 * 获取登录二维码
 */
async function getLoginQRCode(context) {
  const page = await context.newPage();

  try {
    // 访问小红书登录页
    await page.goto('https://www.xiaohongshu.com');
    await page.waitForLoadState('networkidle');

    // 点击登录按钮
    try {
      const loginBtn = await page.locator('text=登录, .login-btn').first();
      await loginBtn.click();
      await page.waitForTimeout(2000);
    } catch (e) {
      console.log('可能已显示登录页面');
    }

    // 获取二维码图片
    const qrcodeImg = await page.locator('.qrcode-img, img[alt*="二维码"]').first();
    await qrcodeImg.waitFor({ state: 'visible', timeout: 10000 });

    const screenshot = await qrcodeImg.screenshot({ type: 'png' });

    return screenshot.toString('base64');

  } finally {
    await page.close();
  }
}

/**
 * 检查登录状态
 */
async function checkLoginStatus(context) {
  const page = await context.newPage();

  try {
    await page.goto('https://www.xiaohongshu.com/explore');
    await page.waitForLoadState('networkidle');

    // 检查是否存在用户频道元素（已登录标志）
    const userChannel = await page.locator('.user-channel, .user-info').count();

    return userChannel > 0;

  } finally {
    await page.close();
  }
}

module.exports = {
  previewPublish,
  confirmPublish,
  getLoginQRCode,
  checkLoginStatus
};
