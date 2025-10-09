#!/usr/bin/env node

import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

console.log('🔍 测试 Anthropic API 连接...');
console.log(`API Key: ${ANTHROPIC_API_KEY ? '✅ 已设置 (' + ANTHROPIC_API_KEY.length + ' 字符)' : '❌ 未设置'}`);

if (!ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY 未设置');
  process.exit(1);
}

async function testAPI() {
  try {
    const anthropic = new Anthropic({
      apiKey: ANTHROPIC_API_KEY
    });

    console.log('📡 发送测试请求到 Claude API...');

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 20,
      messages: [{
        role: 'user',
        content: '请回复"API连接成功"'
      }]
    });

    const reply = response.content[0].type === 'text' ? response.content[0].text : '';

    console.log('✅ API 测试成功!');
    console.log(`📝 Claude 回复: ${reply}`);
    console.log(`🏷️  模型: ${response.model}`);
    console.log(`🔢 使用 tokens: ${response.usage?.input_tokens}(输入) + ${response.usage?.output_tokens}(输出)`);

    return true;
  } catch (error) {
    console.error('❌ API 测试失败:', error.message);

    if (error.status === 401) {
      console.error('🔑 认证失败 - API 密钥无效');
    } else if (error.status === 403) {
      console.error('🚫 访问被拒绝 - 请检查API密钥权限或账户余额');
    } else if (error.status === 429) {
      console.error('⏰ 请求过于频繁 - 请稍后重试');
    } else {
      console.error('🔧 其他错误:', error);
    }

    return false;
  }
}

testAPI().then(success => {
  process.exit(success ? 0 : 1);
});