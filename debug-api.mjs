#!/usr/bin/env node

import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';

dotenv.config();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

console.log('🔍 基础 API 连接测试...');
console.log(`API Key 前缀: ${ANTHROPIC_API_KEY ? ANTHROPIC_API_KEY.substring(0, 20) + '...' : '❌ 未设置'}`);
console.log(`API Key 长度: ${ANTHROPIC_API_KEY ? ANTHROPIC_API_KEY.length : 0} 字符`);

async function basicTest() {
  try {
    console.log('\n📡 尝试连接 Anthropic API...');

    const anthropic = new Anthropic({
      apiKey: ANTHROPIC_API_KEY
    });

    // 不指定模型，让API告诉我们可用的模型
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022', // 尝试最新的
      max_tokens: 5,
      messages: [{
        role: 'user',
        content: 'test'
      }]
    });

    console.log('✅ API 连接成功!');
    console.log('模型响应:', response);
    return true;

  } catch (error) {
    console.error('❌ API 连接失败:');
    console.error('错误状态码:', error.status);
    console.error('错误消息:', error.message);
    console.error('完整错误:', JSON.stringify(error.error || error, null, 2));

    // 检查是否是认证问题
    if (error.status === 401) {
      console.log('\n🔑 这是认证错误 - API 密钥可能无效');
    } else if (error.status === 403) {
      console.log('\n🚫 这是权限错误 - API 密钥可能没有访问权限');
    } else if (error.status === 400) {
      console.log('\n📝 这是请求错误 - 可能是模型名称或参数问题');
    }

    return false;
  }
}

basicTest();