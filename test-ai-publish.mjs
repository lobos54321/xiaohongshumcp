/**
 * 测试AI增强发布功能
 */

import { EnhancedPublishService } from './playwright-service/claude-agent-service/src/enhancedPublishService.js';

async function testAIPublish() {
  console.log('🎯 开始测试AI增强发布功能\n');

  const publishService = new EnhancedPublishService('http://localhost:18062');

  try {
    // 测试1: AI图文发布
    console.log('1️⃣ 测试AI图文发布...');
    const imagePublishResult = await publishService.testPublish();

    if (imagePublishResult.success) {
      console.log('✅ AI图文发布测试成功!');
      console.log('生成的图片:', imagePublishResult.generatedImages);
    } else {
      console.log('❌ AI图文发布测试失败:', imagePublishResult.error);
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // 测试2: 视频发布
    console.log('2️⃣ 测试视频发布...');
    const videoPublishResult = await publishService.testVideoPublish();

    if (videoPublishResult.success) {
      console.log('✅ 视频发布测试成功!');
      console.log('生成的封面:', videoPublishResult.generatedCover);
    } else {
      console.log('❌ 视频发布测试失败:', videoPublishResult.error);
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // 测试3: 手动指定图片的发布
    console.log('3️⃣ 测试手动指定图片发布...');
    const manualPublishResult = await publishService.publishWithAutoImage({
      title: '手动图片测试',
      content: '📸 这是一个手动指定图片的测试发布 #测试',
      images: ['https://picsum.photos/800/800?random=1'],
      auto_generate_image: false,
      privacy: 'draft',
      userId: 'test-user'
    });

    if (manualPublishResult.success) {
      console.log('✅ 手动图片发布测试成功!');
    } else {
      console.log('❌ 手动图片发布测试失败:', manualPublishResult.error);
    }

    console.log('\n📊 测试结果总结:');
    console.log('- AI图文发布:', imagePublishResult.success ? '✅ 成功' : '❌ 失败');
    console.log('- 视频发布:', videoPublishResult.success ? '✅ 成功' : '❌ 失败');
    console.log('- 手动图片发布:', manualPublishResult.success ? '✅ 成功' : '❌ 失败');

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message);
  }
}

// 执行测试
testAIPublish();