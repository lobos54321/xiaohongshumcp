/**
 * 端到端内容管道测试
 * 
 * 测试流程:
 * 1. Dify 生成文案 (title, text, emotion, hashtags)
 * 2. Index TTS 生成语音
 * 3. RunningHub 生成数字人视频
 * 
 * 运行: npx ts-node --esm src/test-e2e-pipeline.ts
 */

// ============ 配置 ============

const CONFIG = {
    // Dify 配置
    DIFY_API_KEY: 'app-fOxdNQgAutGXS3CThzoNUdfI',
    DIFY_API_URL: 'https://api.dify.ai/v1',

    // RunningHub 配置
    RUNNINGHUB_API_KEY: '1f57cb4a52d244da9a43e07b065d3bf7',
    RUNNINGHUB_BASE_URL: 'https://www.runninghub.cn',

    // 工作流 ID
    INDEX_TTS_WEBAPP_ID: '1965684535247650818',
    AVATAR_VIDEO_WEBAPP_ID: '1958162038503649281',

    // 测试用资源 URL (需要替换为实际的)
    TEST_VOICE_SAMPLE_URL: '', // 用户语音样本 URL - 需要您提供
    TEST_AVATAR_PHOTO_URL: '', // 数字人照片 URL - 需要您提供
};

// ============ 类型定义 ============

interface DifyResult {
    title: string;
    text: string;
    emotion: string;
    hashtags: string[];
}

interface RunningHubTaskResponse {
    code: number;
    msg: string;
    data: {
        taskId: string;
        taskStatus: string;
    };
}

interface RunningHubTaskResult {
    code: number;
    msg: string;
    data: {
        taskId: string;
        taskStatus: string;
        outputs?: Array<{
            nodeId: string;
            fileName: string;
            fileUrl: string;
            fileType: string;
        }>;
    };
}

// ============ 测试函数 ============

/**
 * 阶段 1: 测试 Dify 文案生成
 */
async function testDifyGeneration(): Promise<DifyResult | null> {
    console.log('\n📝 阶段 1: 测试 Dify 文案生成');
    console.log('='.repeat(50));

    const testQuery = `什么产品？尽可能详细描述，解决问题的方法与众不同的地方，取得过什么成功案例或结果？或者有什么经验？
我们是一家专注于户外美术教育的机构。与传统室内临摹教学不同的是：
1. 带孩子在大自然中观察真实的光影和色彩
2. 8年教学经验，教过近千名零基础学员
3. 独创"光影决策法"三步走

你的目标用户是？你想要提高用户认知，还是解决疑惑（说服），还是直接销售？
目标用户：焦虑型家长
营销目标：说服，引导咨询

想发在哪个平台？想要多少字的文案？
平台：小红书
字数：300字`;

    const requestBody = {
        inputs: {},
        query: testQuery,
        response_mode: 'streaming',
        conversation_id: '',
        user: 'e2e-test-' + Date.now(),
    };

    try {
        console.log('📤 发送请求到 Dify...');
        const startTime = Date.now();

        const response = await fetch(`${CONFIG.DIFY_API_URL}/chat-messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CONFIG.DIFY_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            console.error('❌ Dify 请求失败:', response.status);
            return null;
        }

        // 处理 SSE 流
        const reader = response.body?.getReader();
        if (!reader) {
            console.error('❌ 无法获取响应流');
            return null;
        }

        const decoder = new TextDecoder();
        let fullAnswer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.slice(6);
                    try {
                        const event = JSON.parse(jsonStr);
                        if (event.answer) {
                            fullAnswer += event.answer;
                        }
                    } catch (e) {
                        // 忽略
                    }
                }
            }
        }

        reader.releaseLock();

        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`✅ Dify 响应完成，耗时 ${elapsed} 秒`);

        // 解析 JSON
        try {
            const jsonMatch = fullAnswer.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]) as DifyResult;
                console.log('📌 标题:', parsed.title);
                console.log('📝 文案长度:', parsed.text.length, '字符');
                console.log('😊 情感:', parsed.emotion);
                console.log('🏷️  话题:', parsed.hashtags.join(', '));
                return parsed;
            }
        } catch (e) {
            console.error('❌ JSON 解析失败');
        }

        return null;

    } catch (error) {
        console.error('❌ Dify 测试失败:', error);
        return null;
    }
}

/**
 * 阶段 2: 测试 Index TTS 语音生成
 */
async function testIndexTTS(text: string, emotion: string): Promise<string | null> {
    console.log('\n🎙️ 阶段 2: 测试 Index TTS 语音生成');
    console.log('='.repeat(50));

    if (!CONFIG.TEST_VOICE_SAMPLE_URL) {
        console.log('⚠️  未配置 TEST_VOICE_SAMPLE_URL，跳过 TTS 测试');
        console.log('   请在 CONFIG 中设置语音样本 URL');
        return null;
    }

    // 提取文件名
    const audioFileName = CONFIG.TEST_VOICE_SAMPLE_URL.split('/').pop() || 'voice_sample.mp3';

    const nodeInfoList = [
        {
            nodeId: '9',
            fieldName: 'audio',
            fieldValue: audioFileName,
        },
        {
            nodeId: '6',
            fieldName: 'text',
            fieldValue: text.substring(0, 500), // 限制长度
        },
        {
            nodeId: '17',
            fieldName: 'text',
            fieldValue: emotion,
        }
    ];

    try {
        console.log('📤 发送 TTS 任务到 RunningHub...');
        console.log('   文本长度:', text.length);
        console.log('   情感:', emotion);

        const response = await fetch(`${CONFIG.RUNNINGHUB_BASE_URL}/task/openapi/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                webappId: CONFIG.INDEX_TTS_WEBAPP_ID,
                apiKey: CONFIG.RUNNINGHUB_API_KEY,
                nodeInfoList,
            }),
        });

        const result = await response.json() as RunningHubTaskResponse;

        if (result.code !== 0) {
            console.error('❌ TTS 任务创建失败:', result.msg);
            return null;
        }

        console.log('✅ TTS 任务已创建:', result.data.taskId);

        // 轮询等待完成
        const audioUrl = await waitForTaskCompletion(result.data.taskId, 'audio');
        if (audioUrl) {
            console.log('✅ TTS 生成成功:', audioUrl);
        }
        return audioUrl;

    } catch (error) {
        console.error('❌ TTS 测试失败:', error);
        return null;
    }
}

/**
 * 阶段 3: 测试数字人视频生成
 */
async function testAvatarVideo(audioUrl: string): Promise<string | null> {
    console.log('\n🎬 阶段 3: 测试数字人视频生成');
    console.log('='.repeat(50));

    if (!CONFIG.TEST_AVATAR_PHOTO_URL) {
        console.log('⚠️  未配置 TEST_AVATAR_PHOTO_URL，跳过视频测试');
        console.log('   请在 CONFIG 中设置数字人照片 URL');
        return null;
    }

    const imageFileName = CONFIG.TEST_AVATAR_PHOTO_URL.split('/').pop() || 'avatar.jpg';
    const audioFileName = audioUrl.split('/').pop() || 'audio.mp3';

    const nodeInfoList = [
        {
            nodeId: '133',
            fieldName: 'image',
            fieldValue: imageFileName,
        },
        {
            nodeId: '218',
            fieldName: 'audio',
            fieldValue: audioFileName,
        },
        {
            nodeId: '230',
            fieldName: 'value',
            fieldValue: '0',
        },
        {
            nodeId: '231',
            fieldName: 'value',
            fieldValue: '60',
        }
    ];

    try {
        console.log('📤 发送视频任务到 RunningHub...');
        console.log('   照片:', imageFileName);
        console.log('   音频:', audioFileName);

        const response = await fetch(`${CONFIG.RUNNINGHUB_BASE_URL}/task/openapi/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                webappId: CONFIG.AVATAR_VIDEO_WEBAPP_ID,
                apiKey: CONFIG.RUNNINGHUB_API_KEY,
                nodeInfoList,
            }),
        });

        const result = await response.json() as RunningHubTaskResponse;

        if (result.code !== 0) {
            console.error('❌ 视频任务创建失败:', result.msg);
            return null;
        }

        console.log('✅ 视频任务已创建:', result.data.taskId);

        // 轮询等待完成
        const videoUrl = await waitForTaskCompletion(result.data.taskId, 'video');
        if (videoUrl) {
            console.log('✅ 视频生成成功:', videoUrl);
        }
        return videoUrl;

    } catch (error) {
        console.error('❌ 视频测试失败:', error);
        return null;
    }
}

/**
 * 轮询等待任务完成
 */
async function waitForTaskCompletion(taskId: string, fileType: string): Promise<string | null> {
    const maxWaitMs = 10 * 60 * 1000; // 10 分钟
    const pollIntervalMs = 5000; // 5 秒
    const startTime = Date.now();

    console.log(`⏳ 等待任务完成 (最多 ${maxWaitMs / 60000} 分钟)...`);

    while (Date.now() - startTime < maxWaitMs) {
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

        const response = await fetch(`${CONFIG.RUNNINGHUB_BASE_URL}/task/openapi/status`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                taskId,
                apiKey: CONFIG.RUNNINGHUB_API_KEY,
            }),
        });

        const result = await response.json() as RunningHubTaskResult;
        const elapsed = Math.round((Date.now() - startTime) / 1000);

        if (result.data?.taskStatus === 'COMPLETED') {
            // 找到目标文件
            const output = result.data.outputs?.find(o =>
                o.fileType === fileType || o.fileName.includes(fileType)
            );
            if (output?.fileUrl) {
                return output.fileUrl;
            }
            console.error('❌ 任务完成但未找到输出文件');
            return null;
        } else if (result.data?.taskStatus === 'FAILED') {
            console.error('❌ 任务失败');
            return null;
        }

        console.log(`   [${elapsed}s] 状态: ${result.data?.taskStatus || 'UNKNOWN'}`);
    }

    console.error('❌ 任务超时');
    return null;
}

// ============ 主函数 ============

async function runE2ETest() {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 端到端内容管道测试');
    console.log('='.repeat(60));
    console.log('开始时间:', new Date().toLocaleTimeString());

    // 阶段 1: Dify 文案生成
    const difyResult = await testDifyGeneration();
    if (!difyResult) {
        console.log('\n❌ 阶段 1 失败，测试终止');
        return;
    }

    // 阶段 2: Index TTS
    const audioUrl = await testIndexTTS(difyResult.text, difyResult.emotion);
    if (!audioUrl) {
        console.log('\n⚠️  阶段 2 跳过或失败');
        console.log('   如果是跳过，请配置 TEST_VOICE_SAMPLE_URL 后重试');
    }

    // 阶段 3: 数字人视频
    if (audioUrl) {
        const videoUrl = await testAvatarVideo(audioUrl);
        if (!videoUrl) {
            console.log('\n⚠️  阶段 3 失败');
        }
    }

    // 总结
    console.log('\n' + '='.repeat(60));
    console.log('📊 测试总结');
    console.log('='.repeat(60));
    console.log('✅ Dify 文案生成:', difyResult ? '成功' : '失败');
    console.log('📝 生成的标题:', difyResult?.title);
    console.log('😊 生成的情感:', difyResult?.emotion);
    console.log('🎙️ TTS 语音:', audioUrl ? '成功' : '跳过/失败');
    console.log('🎬 数字人视频:', audioUrl ? '待确认' : '跳过');
    console.log('\n结束时间:', new Date().toLocaleTimeString());
}

// 运行测试
runE2ETest().catch(console.error);
