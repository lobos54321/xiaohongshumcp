#!/usr/bin/env node

/**
 * Anthropic API 诊断工具
 * 用于测试 API Key 和模型可用性
 */

const https = require('https');

const API_KEY = process.env.ANTHROPIC_API_KEY;
const API_VERSION = '2023-06-01';

// 测试的模型列表（从旧到新）
const MODELS_TO_TEST = [
  'claude-3-haiku-20240307',
  'claude-3-5-haiku-20241022',
  'claude-3-5-sonnet-20241022',
  'claude-3-opus-20240229'
];

console.log('🔍 Anthropic API 诊断工具\n');
console.log('=' .repeat(60));

if (!API_KEY) {
  console.error('❌ 错误: ANTHROPIC_API_KEY 环境变量未设置');
  console.error('请运行: export ANTHROPIC_API_KEY=your-api-key');
  process.exit(1);
}

console.log('✅ API Key 已找到');
console.log(`   长度: ${API_KEY.length} 字符`);
console.log(`   前缀: ${API_KEY.substring(0, 15)}...`);
console.log('');

async function testModel(model) {
  return new Promise((resolve) => {
    const data = JSON.stringify({
      model: model,
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Hi' }]
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': API_VERSION,
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          resolve({
            model,
            status: res.statusCode,
            success: res.statusCode === 200,
            response: response
          });
        } catch (error) {
          resolve({
            model,
            status: res.statusCode,
            success: false,
            error: body
          });
        }
      });
    });

    req.on('error', (error) => {
      resolve({
        model,
        status: 0,
        success: false,
        error: error.message
      });
    });

    req.setTimeout(10000, () => {
      req.destroy();
      resolve({
        model,
        status: 0,
        success: false,
        error: 'Request timeout'
      });
    });

    req.write(data);
    req.end();
  });
}

async function diagnose() {
  console.log('🧪 测试模型可用性...\n');

  for (const model of MODELS_TO_TEST) {
    process.stdout.write(`   测试 ${model.padEnd(35)} ... `);
    const result = await testModel(model);

    if (result.success) {
      console.log('✅ 成功');
    } else {
      console.log(`❌ 失败 (${result.status})`);
      if (result.response?.error) {
        console.log(`      错误: ${result.response.error.type || result.response.error.message}`);
      } else if (result.error) {
        console.log(`      错误: ${result.error}`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n📊 诊断建议:\n');

  // 测试最新的 Haiku 模型
  const latestHaiku = await testModel('claude-3-5-haiku-20241022');
  const oldHaiku = await testModel('claude-3-haiku-20240307');

  if (oldHaiku.status === 403 || oldHaiku.status === 404) {
    console.log('⚠️  旧版 claude-3-haiku-20240307 模型不可用');
    if (latestHaiku.success) {
      console.log('✅ 建议使用: claude-3-5-haiku-20241022');
      console.log('\n修复方法:');
      console.log('   1. 在 Zeabur 设置环境变量:');
      console.log('      CLAUDE_MODEL=claude-3-5-haiku-20241022');
      console.log('   2. 或在 .env 文件中添加:');
      console.log('      CLAUDE_MODEL=claude-3-5-haiku-20241022');
    }
  }

  if (oldHaiku.status === 401) {
    console.log('❌ API Key 无效');
    console.log('   请检查 ANTHROPIC_API_KEY 是否正确');
  }

  if (oldHaiku.status === 429) {
    console.log('⚠️  API 速率限制');
    console.log('   请稍后重试或升级账号');
  }

  if (!latestHaiku.success && !oldHaiku.success) {
    console.log('❌ 所有模型均不可用');
    console.log('\n可能的原因:');
    console.log('   1. API Key 无效或已过期');
    console.log('   2. 账号余额不足');
    console.log('   3. 网络连接问题');
    console.log('   4. 区域限制（当前从 JP 访问）');
    console.log('\n建议:');
    console.log('   - 访问 https://console.anthropic.com/settings/keys');
    console.log('   - 检查 API Key 是否有效');
    console.log('   - 检查账号余额');
  }

  console.log('');
}

diagnose().catch(console.error);
