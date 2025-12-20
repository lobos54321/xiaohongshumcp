/**
 * UGC_VIDEO 模式端到端测试
 * 
 * 测试流程：
 * 1. 调用 VideoGenerationService.generateVideo(UGC_VIDEO)
 * 2. 验证 N8n 工作流触发
 * 3. 模拟回调接收
 * 4. 验证 video_url 获取
 * 
 * 运行: npx ts-node --esm src/test-ugc-video-pipeline.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { videoGenerationService, VideoGenerationRequest } from './services/VideoGenerationService.js';
import { n8nUgcClient, UgcVideoRequest } from './services/N8nUgcClient.js';

// ============ 测试配置 ============

const TEST_CONFIG = {
    supabaseUuid: 'test-user-uuid-123',
    taskId: `test-ugc-${Date.now()}`,

    // 产品描述 (会传给 N8n)
    productDescription: `
今天我们艺站lobos老师带我们在公园上了一节户外写生课，阳光特别好，大家都很兴奋。
老师让我们画身边的植物，我第一次发现原来光影变化这么有趣。
刚开始我还担心我是零基础，但是lobos老师的色彩教学真的很用心，我能感受平时看不到的色彩。
而且感觉时间过得很快，整个过程真的很放松，感觉自己像个真正的艺术家。
    `.trim(),

    // 产品图片 URL
    productImageUrl: 'https://youke1.picui.cn/s1/2025/09/16/68c8ecdec39b3.jpg',

    // UGC 参数
    ugcParams: {
        gender: 'female' as const,
        duration: 16,  // 秒
        language: 'zh-CN' as const,
    },
};

// ============ 测试函数 ============

/**
 * 测试 1: 仅触发工作流 (不等待结果)
 */
async function testTriggerOnly() {
    console.log('='.repeat(60));
    console.log('🎬 UGC_VIDEO 触发测试 (不等待结果)');
    console.log('='.repeat(60));
    console.log();

    console.log('📋 测试配置:');
    console.log(`  Task ID: ${TEST_CONFIG.taskId}`);
    console.log(`  图片: ${TEST_CONFIG.productImageUrl}`);
    console.log(`  性别: ${TEST_CONFIG.ugcParams.gender}`);
    console.log(`  时长: ${TEST_CONFIG.ugcParams.duration}秒`);
    console.log(`  语言: ${TEST_CONFIG.ugcParams.language}`);
    console.log();

    const request: UgcVideoRequest = {
        taskId: TEST_CONFIG.taskId,
        productDescription: TEST_CONFIG.productDescription,
        productImageUrl: TEST_CONFIG.productImageUrl,
        gender: TEST_CONFIG.ugcParams.gender,
        duration: TEST_CONFIG.ugcParams.duration,
        language: TEST_CONFIG.ugcParams.language,
    };

    console.log('🚀 触发 N8n 工作流...');
    const startTime = Date.now();

    try {
        const result = await n8nUgcClient.triggerOnly(request);
        const duration = Date.now() - startTime;

        console.log();
        console.log(`✅ 触发完成 (耗时: ${duration}ms)`);
        console.log(`  Success: ${result.success}`);
        console.log(`  Session ID: ${result.sessionId}`);

        if (result.error) {
            console.log(`  Error: ${result.error}`);
        }

        console.log();
        console.log('📝 后续步骤:');
        console.log('  1. N8n 工作流将在后台处理');
        console.log('  2. 完成后会回调 /api/ugc-video-callback');
        console.log('  3. 可以通过轮询 n8n_ugc_callbacks 表查询结果');

    } catch (error) {
        console.error('❌ 触发失败:', error);
    }
}

/**
 * 测试 2: 通过 VideoGenerationService 调用 (完整流程)
 */
async function testFullVideoGeneration() {
    console.log('='.repeat(60));
    console.log('🎬 UGC_VIDEO 完整测试 (通过 VideoGenerationService)');
    console.log('='.repeat(60));
    console.log();

    console.log('⚠️ 注意: 此测试会等待 N8n 工作流完成，可能需要 5-15 分钟');
    console.log();

    const request: VideoGenerationRequest = {
        supabaseUuid: TEST_CONFIG.supabaseUuid,
        taskId: TEST_CONFIG.taskId,
        contentMode: 'UGC_VIDEO',
        script: TEST_CONFIG.productDescription,
        productImages: [TEST_CONFIG.productImageUrl],
        ugcParams: TEST_CONFIG.ugcParams,
    };

    console.log('🚀 开始视频生成...');
    const startTime = Date.now();

    try {
        const result = await videoGenerationService.generateVideo(request);
        const duration = Date.now() - startTime;

        console.log();
        console.log(`${result.success ? '✅' : '❌'} 视频生成${result.success ? '完成' : '失败'} (耗时: ${(duration / 1000 / 60).toFixed(1)}分钟)`);
        console.log();

        if (result.success) {
            console.log('🎥 视频结果:');
            console.log(`  Video URL: ${result.videoUrl}`);
            console.log(`  Task ID: ${result.taskId}`);
        } else {
            console.log('❌ 错误:', result.error);
        }

    } catch (error) {
        console.error('❌ 测试失败:', error);
    }
}

/**
 * 测试 3: 模拟回调处理
 */
async function testCallbackHandling() {
    console.log('='.repeat(60));
    console.log('📥 回调处理测试');
    console.log('='.repeat(60));
    console.log();

    const mockSessionId = `agent_test_${Date.now()}`;
    const mockVideoUrl = 'https://v3.fal.media/files/test/mock_video.mp4';

    console.log('📋 模拟回调数据:');
    console.log(`  Session ID: ${mockSessionId}`);
    console.log(`  Video URL: ${mockVideoUrl}`);
    console.log();

    try {
        console.log('📥 处理回调...');
        await n8nUgcClient.handleCallback({
            sessionId: mockSessionId,
            finalvideourl: mockVideoUrl,
        });

        console.log('✅ 回调处理成功');
        console.log('  (注意: 此测试需要 n8n_ugc_callbacks 表存在对应记录)');

    } catch (error) {
        console.error('❌ 回调处理失败:', error);
        console.log('  提示: 请确保已执行 SQL 迁移创建 n8n_ugc_callbacks 表');
    }
}

// ============ 运行测试 ============

async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--trigger-only')) {
        await testTriggerOnly();
    } else if (args.includes('--full')) {
        await testFullVideoGeneration();
    } else if (args.includes('--callback')) {
        await testCallbackHandling();
    } else {
        console.log('UGC_VIDEO 测试脚本');
        console.log();
        console.log('用法:');
        console.log('  --trigger-only  仅触发工作流 (不等待结果)');
        console.log('  --full          完整测试 (等待视频生成完成)');
        console.log('  --callback      测试回调处理');
        console.log();
        console.log('示例:');
        console.log('  npx ts-node --esm src/test-ugc-video-pipeline.ts --trigger-only');
        console.log();

        // 默认运行触发测试
        await testTriggerOnly();
    }
}

main().catch(console.error);
