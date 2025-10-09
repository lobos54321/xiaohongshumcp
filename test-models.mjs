#!/usr/bin/env node

import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';

dotenv.config();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

console.log('🔍 测试不同的 Claude 模型...');
console.log(`API Key: ${ANTHROPIC_API_KEY ? '✅ 已设置 (' + ANTHROPIC_API_KEY.length + ' 字符)' : '❌ 未设置'}`);

const models = [
  'claude-3-5-sonnet-20241022',
  'claude-3-5-sonnet-20240620',
  'claude-3-haiku-20240307',
  'claude-3-opus-20240229',
  'claude-3-sonnet-20240229'
];

async function testModels() {
  const anthropic = new Anthropic({
    apiKey: ANTHROPIC_API_KEY
  });

  for (const model of models) {
    try {
      console.log(`\n📡 测试模型: ${model}`);

      const response = await anthropic.messages.create({
        model: model,
        max_tokens: 10,
        messages: [{
          role: 'user',
          content: 'Hi'
        }]
      });

      const reply = response.content[0].type === 'text' ? response.content[0].text : '';
      console.log(`✅ 模型 ${model} 可用!`);
      console.log(`📝 回复: ${reply}`);
      return model; // 返回第一个可用的模型

    } catch (error) {
      console.log(`❌ 模型 ${model} 不可用: ${error.message}`);
    }
  }

  return null;
}

testModels().then(workingModel => {
  if (workingModel) {
    console.log(`\n🎉 找到可用模型: ${workingModel}`);
  } else {
    console.log('\n❌ 没有找到可用的模型');
  }
  process.exit(workingModel ? 0 : 1);
});