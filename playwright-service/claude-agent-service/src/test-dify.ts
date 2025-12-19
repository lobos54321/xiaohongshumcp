/**
 * Dify API Streaming 模式测试
 * 
 * 运行方式: npx ts-node --esm src/test-dify.ts
 */

const DIFY_API_KEY = 'app-fOxdNQgAutGXS3CThzoNUdfI';
const DIFY_API_URL = 'https://api.dify.ai/v1';

async function testDifyStreamingAPI() {
    console.log('======================================');
    console.log('🧪 Dify API Streaming 模式测试');
    console.log('⏱️  工作流可能需要 5-10 分钟完成');
    console.log('======================================\n');

    // 完整的产品信息输入 - 按照工作流要求的格式
    const testQuery = `什么产品？尽可能详细描述，解决问题的方法与众不同的地方，取得过什么成功案例或结果？或者有什么经验？
我们是一家专注于户外美术教育的机构。与传统室内临摹教学不同的是：
1. 我们带孩子在大自然中观察真实的光影和色彩，而不是对着色卡背"标准绿"
2. 8年教学经验，教过近千名零基础学员
3. 独创"光影决策法"三步走：先教"怎么看"，再教"怎么想"，最后才教"怎么画"
4. 成功案例：很多学了3-4年还依赖老师的孩子，经过我们6个月的训练后能独立创作
5. 核心理念：画画的本质是观察和思考，不是复制

你的目标用户是？你想要提高用户认知，还是解决疑惑（说服），还是直接销售？
目标用户：焦虑型家长，他们的孩子学画多年却依然离不开老师，无法独立创作。
营销目标：说服，解决家长的疑惑，让他们意识到传统美术教育的问题，引导咨询。

想发在哪个平台？想要多少字的文案？
平台：小红书
字数：800字`;

    const requestBody = {
        inputs: {},
        query: testQuery,
        response_mode: 'streaming',  // 使用 streaming 模式
        conversation_id: '',
        user: 'test-user-' + Date.now(),
    };

    console.log('📤 发送 Streaming 请求...');
    console.log('URL:', DIFY_API_URL + '/chat-messages');
    console.log('Query 长度:', testQuery.length, '字符\n');

    const startTime = Date.now();
    let lastProgressTime = startTime;

    try {
        const response = await fetch(`${DIFY_API_URL}/chat-messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DIFY_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API 请求失败!');
            console.error('Status:', response.status, response.statusText);
            console.error('Error:', errorText.substring(0, 500));
            return;
        }

        console.log('✅ 连接成功，开始接收 streaming 数据...\n');

        // 处理 SSE 流
        const reader = response.body?.getReader();
        if (!reader) {
            console.error('无法获取响应流');
            return;
        }

        const decoder = new TextDecoder();
        let fullAnswer = '';
        let messageId = '';
        let conversationId = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.slice(6);
                    if (jsonStr === '[DONE]') continue;

                    try {
                        const event = JSON.parse(jsonStr);

                        // 保存 ID
                        if (event.message_id) messageId = event.message_id;
                        if (event.conversation_id) conversationId = event.conversation_id;

                        // 处理不同类型的事件
                        if (event.event === 'message' || event.event === 'agent_message') {
                            if (event.answer) {
                                fullAnswer += event.answer;

                                // 每 30 秒输出一次进度
                                const now = Date.now();
                                if (now - lastProgressTime > 30000) {
                                    const elapsed = Math.round((now - startTime) / 1000);
                                    console.log(`⏳ [${elapsed}s] 生成中...当前长度: ${fullAnswer.length} 字符`);
                                    lastProgressTime = now;
                                }
                            }
                        } else if (event.event === 'message_end') {
                            console.log('\n✅ 收到 message_end 事件');
                        } else if (event.event === 'error') {
                            console.error('❌ Dify 错误:', event.message || JSON.stringify(event));
                        }
                    } catch (parseError) {
                        // 忽略非 JSON 行
                    }
                }
            }
        }

        reader.releaseLock();

        const elapsed = Date.now() - startTime;
        console.log('\n======================================');
        console.log('✅ Streaming 完成!');
        console.log('--------------------------------------');
        console.log('⏱️  总耗时:', Math.round(elapsed / 1000), '秒');
        console.log('📝 Message ID:', messageId);
        console.log('💬 Conversation ID:', conversationId);
        console.log('📊 响应总长度:', fullAnswer.length, '字符');
        console.log('--------------------------------------\n');

        // 尝试解析 JSON
        console.log('🔍 尝试解析 JSON...');
        try {
            let jsonStr = fullAnswer;

            // 提取 JSON 块（可能被 markdown 代码块包裹）
            const jsonMatch = fullAnswer.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1].trim();
                console.log('   从 markdown 代码块中提取 JSON');
            }

            // 找 JSON 对象
            const jsonObjectMatch = jsonStr.match(/\{[\s\S]*\}/);
            if (jsonObjectMatch) {
                jsonStr = jsonObjectMatch[0];
            }

            const parsed = JSON.parse(jsonStr);

            console.log('\n✅ JSON 解析成功!');
            console.log('--------------------------------------');
            console.log('📌 标题:', parsed.title);
            console.log('📝 文案长度:', parsed.text?.length || 0, '字符');
            console.log('😊 情感:', parsed.emotion);
            console.log('🏷️  话题:', parsed.hashtags?.join(', '));
            console.log('--------------------------------------\n');

            console.log('📝 完整文案内容:');
            console.log('======================================');
            console.log(parsed.text);
            console.log('======================================');

        } catch (parseError) {
            console.log('\n⚠️  JSON 解析失败');
            console.log('可能原因: 工作流尚未输出最终 JSON 格式');
            console.log('\n📄 原始响应 (前 2000 字符):');
            console.log('--------------------------------------');
            console.log(fullAnswer.substring(0, 2000));
            console.log('--------------------------------------');
        }

    } catch (error) {
        console.error('❌ 请求失败:', error);
    }
}

// 运行测试
console.log('开始时间:', new Date().toLocaleTimeString());
testDifyStreamingAPI()
    .then(() => console.log('\n结束时间:', new Date().toLocaleTimeString()))
    .catch(console.error);
