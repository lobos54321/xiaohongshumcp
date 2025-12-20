/**
 * IMAGE_TEXT 模式端到端测试
 * 
 * 测试完整流程：
 * 1. Dify 母文案生成
 * 2. CopyAnalyzer 分析 + 金句提取
 * 3. 变体/拆分生成
 * 4. ImageAdaptationBrain 图片评估
 * 5. GeminiImageClient 图片生成 (如需要)
 * 
 * 运行: npx ts-node --esm src/test-image-text-pipeline.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { contentPipelineService, ContentPipelineRequest, ContentPipelineResult } from './services/ContentPipelineService.js';
import { copyAnalyzer } from './services/CopyAnalyzer.js';
import { imageAdaptationBrain, ImageAnalysis } from './services/ImageAdaptationBrain.js';

// ============ 测试配置 ============

const TEST_CONFIG = {
    supabaseUuid: 'test-user-uuid-123',
    taskId: `test-task-${Date.now()}`,

    // 产品信息 (用于 Dify)
    productInfo: `
【艺站 ArtZ 户外写生课】

🎨 课程特色:
- 专业老师带队，走出画室，在大自然中感受光影变化
- 零基础友好，老师会一对一指导
- 小班制教学（6-8人），确保每位学员都能得到充分关注

📍 上课地点: 深圳湾公园、大梅沙、东湖公园等户外场地

⏰ 课程时长: 3小时/节

💰 价格: 298元/节

🎁 报名即送: 专业写生工具包（价值128元）

适合人群: 想要放松心情、体验艺术创作的成年人
    `.trim(),

    targetAudience: '25-45岁都市白领，追求生活品质，想要减压放松',
    marketingGoal: '引导用户私信咨询户外写生课程',

    // 测试图片 (模拟用户上传的素材图)
    testImages: [
        'https://youke1.picui.cn/s1/2025/09/16/68c8ecdec39b3.jpg',
    ],

    // 图片分析结果 (模拟 AI 预分析)
    imageAnalyses: [
        {
            imageUrl: 'https://youke1.picui.cn/s1/2025/09/16/68c8ecdec39b3.jpg',
            description: '户外写生场景，公园环境，有画架和画具，阳光明媚',
            mainElements: ['画架', '画具', '公园', '树木', '阳光'],
            hasProduct: true,
            hasPerson: false,
            sceneType: 'outdoor' as const,
        },
    ] as ImageAnalysis[],
};

// ============ 测试函数 ============

async function testFullPipeline() {
    console.log('='.repeat(60));
    console.log('📝 IMAGE_TEXT 模式端到端测试');
    console.log('='.repeat(60));
    console.log();

    const request: ContentPipelineRequest = {
        supabaseUuid: TEST_CONFIG.supabaseUuid,
        taskId: TEST_CONFIG.taskId,
        contentMode: 'IMAGE_TEXT',
        productInfo: TEST_CONFIG.productInfo,
        targetAudience: TEST_CONFIG.targetAudience,
        marketingGoal: TEST_CONFIG.marketingGoal,
        productImages: TEST_CONFIG.testImages,
        imageAnalyses: TEST_CONFIG.imageAnalyses,
    };

    console.log('🚀 开始测试...');
    console.log(`  Task ID: ${TEST_CONFIG.taskId}`);
    console.log(`  产品信息长度: ${TEST_CONFIG.productInfo.length} 字符`);
    console.log();

    try {
        const startTime = Date.now();
        const result = await contentPipelineService.generateContent(request);
        const duration = Date.now() - startTime;

        printResult(result, duration);

    } catch (error) {
        console.error('❌ 测试失败:', error);
    }
}

async function testCopyAnalyzerOnly() {
    console.log('='.repeat(60));
    console.log('📊 CopyAnalyzer 单独测试');
    console.log('='.repeat(60));
    console.log();

    // 模拟母文案
    const motherCopy = {
        title: '8年教了近千名零基础学员走出"标准色"牢笼',
        text: `
今天我们艺站lobos老师带我们在公园上了一节户外写生课，阳光特别好，大家都很兴奋。

老师让我们画身边的植物，我第一次发现原来光影变化这么有趣。

刚开始我还担心我是零基础，但是lobos老师的色彩教学真的很用心，我能感受平时看不到的色彩。

而且感觉时间过得很快，整个过程真的很放松，感觉自己像个真正的艺术家。

核心是要打开你的眼睛，去观察真实的世界，而不是复制标准答案。

如果你也想体验这种在大自然中创作的感觉，可以私信我了解我们的户外写生课程。
        `.trim(),
    };

    console.log('📄 母文案:');
    console.log(`  标题: ${motherCopy.title}`);
    console.log(`  正文长度: ${motherCopy.text.length} 字符`);
    console.log();

    // 分析
    const analysis = await copyAnalyzer.analyze(motherCopy);

    console.log('📊 分析结果:');
    console.log(`  字数: ${analysis.wordCount}`);
    console.log(`  结构类型: ${analysis.structureType}`);
    console.log(`  策略: ${analysis.strategy}`);
    console.log(`  策略原因: ${analysis.strategyReason}`);
    console.log();

    console.log('💎 金句:');
    analysis.goldenQuotes.forEach((quote, i) => {
        console.log(`  ${i + 1}. ${quote}`);
    });
    console.log();

    console.log('🎯 核心论点:');
    analysis.coreArguments.forEach((arg, i) => {
        console.log(`  ${i + 1}. ${arg}`);
    });
    console.log();

    // 生成变体
    if (analysis.strategy === 'variant') {
        const variants = await copyAnalyzer.generateVariants(motherCopy, analysis);
        console.log('📝 变体:');
        variants.variants.forEach((v, i) => {
            console.log(`  ${i + 1}. [${v.type}] ${v.title?.substring(0, 30)}...`);
        });
    } else {
        const splits = await copyAnalyzer.split(motherCopy, analysis);
        console.log('📝 拆分:');
        splits.segments.forEach((s, i) => {
            console.log(`  ${i + 1}. [${s.type}] ${s.title?.substring(0, 30)}... (${s.estimatedWords}字)`);
        });
    }
}

async function testImageBrainOnly() {
    console.log('='.repeat(60));
    console.log('🧠 ImageAdaptationBrain 单独测试');
    console.log('='.repeat(60));
    console.log();

    // 测试有图片场景
    console.log('📸 测试 1: 有图片场景');
    const decision1 = await imageAdaptationBrain.analyze({
        images: TEST_CONFIG.imageAnalyses,
        copyTitle: '户外写生课，让你找回内心的宁静',
        copyText: '在大自然中画画，感受光影变化，体验艺术创作的乐趣',
        productInfo: TEST_CONFIG.productInfo,
    });

    console.log(`  决策摘要: ${decision1.summary}`);
    console.log(`  可用图片: ${decision1.usableImages.length}`);
    console.log(`  需替换: ${decision1.imagesToReplace.length}`);
    console.log(`  需生成: ${decision1.generationRequests.length}`);
    console.log();

    // 测试无图片场景
    console.log('📸 测试 2: 无图片场景');
    const decision2 = await imageAdaptationBrain.analyze({
        images: [],
        copyTitle: '户外写生课，让你找回内心的宁静',
        copyText: '在大自然中画画，感受光影变化，体验艺术创作的乐趣',
        productInfo: TEST_CONFIG.productInfo,
    });

    console.log(`  决策摘要: ${decision2.summary}`);
    console.log(`  需生成: ${decision2.generationRequests.length}`);
    decision2.generationRequests.forEach((req, i) => {
        console.log(`    ${i + 1}. [${req.type}] ${req.reason}`);
    });
}

function printResult(result: ContentPipelineResult, duration: number) {
    console.log('='.repeat(60));
    console.log(`✅ 测试完成 (耗时: ${(duration / 1000).toFixed(2)}s)`);
    console.log('='.repeat(60));
    console.log();

    if (!result.success) {
        console.log('❌ 失败:', result.error);
        return;
    }

    // 母文案
    if (result.content) {
        console.log('📄 母文案:');
        console.log(`  标题: ${result.content.title}`);
        console.log(`  正文: ${result.content.text.substring(0, 100)}...`);
        console.log(`  情感: ${result.content.emotion}`);
        console.log(`  话题: ${result.content.hashtags.join(', ')}`);
        console.log();
    }

    // 分析结果
    if (result.copyAnalysis) {
        console.log('📊 文案分析:');
        console.log(`  字数: ${result.copyAnalysis.wordCount}`);
        console.log(`  策略: ${result.copyAnalysis.strategy}`);
        console.log(`  金句数: ${result.copyAnalysis.goldenQuotes.length}`);
        console.log();
    }

    // 变体/拆分
    if (result.copyVariants) {
        console.log('📝 变体/拆分:');
        if ('variants' in result.copyVariants) {
            console.log(`  变体数: ${result.copyVariants.variants.length}`);
        } else if ('segments' in result.copyVariants) {
            console.log(`  片段数: ${result.copyVariants.segments.length}`);
        }
        console.log();
    }

    // 图片决策
    if (result.imageDecision) {
        console.log('🖼️ 图片决策:');
        console.log(`  摘要: ${result.imageDecision.summary}`);
        console.log(`  可用: ${result.imageDecision.usableImages.length}`);
        console.log(`  需生成: ${result.imageDecision.generationRequests.length}`);
        console.log();
    }

    // 最终图片
    if (result.finalImages && result.finalImages.length > 0) {
        console.log('📸 最终图片:');
        result.finalImages.forEach((url, i) => {
            console.log(`  ${i + 1}. ${url.substring(0, 50)}...`);
        });
        console.log();
    }
}

// ============ 运行测试 ============

async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--copy-only')) {
        await testCopyAnalyzerOnly();
    } else if (args.includes('--image-only')) {
        await testImageBrainOnly();
    } else {
        // 默认运行完整测试
        await testFullPipeline();
    }
}

main().catch(console.error);
