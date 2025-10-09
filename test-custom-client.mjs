#!/usr/bin/env node

import { CustomAnthropicClient } from './custom-anthropic.mjs';
import * as dotenv from 'dotenv';

dotenv.config();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

console.log('🔍 测试自定义 Anthropic 客户端...');
console.log(`API Key: ${ANTHROPIC_API_KEY ? '✅ 已设置 (' + ANTHROPIC_API_KEY.length + ' 字符)' : '❌ 未设置'}`);

async function testCustomClient() {
  try {
    const client = new CustomAnthropicClient(ANTHROPIC_API_KEY);

    console.log('📡 发送测试请求...');

    const response = await client.createMessage({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 20,
      messages: [{
        role: 'user',
        content: 'Hi'
      }]
    });

    const reply = response.content[0]?.text || '';

    console.log('✅ 自定义客户端测试成功!');
    console.log(`📝 Claude 回复: ${reply}`);
    console.log(`🏷️  模型: ${response.model}`);
    console.log(`🔢 使用 tokens: ${response.usage?.input_tokens}(输入) + ${response.usage?.output_tokens}(输出)`);

    return true;
  } catch (error) {
    console.error('❌ 自定义客户端测试失败:', error.message);
    console.error('错误详情:', error);
    return false;
  }
}

testCustomClient().then(success => {
  process.exit(success ? 0 : 1);
});