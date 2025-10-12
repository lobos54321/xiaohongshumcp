#!/usr/bin/env node

/**
 * 403 错误诊断工具
 * 专门用于诊断 Claude API 403 问题
 */

import { readFileSync } from 'fs';
import https from 'https';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('🔍 Claude API 403 错误诊断工具\n');
console.log('='.repeat(60));

// 读取 API Key (优先环境变量，然后 .env 文件)
let API_KEY = process.env.ANTHROPIC_API_KEY;

if (!API_KEY) {
  try {
    const envPath = join(__dirname, '.env');
    const envContent = readFileSync(envPath, 'utf8');
    const match = envContent.match(/ANTHROPIC_API_KEY\s*=\s*(.+)/);
    if (match) {
      API_KEY = match[1].trim().replace(/^["']|["']$/g, '');
    }
  } catch (error) {
    console.error('⚠️  无法读取 .env 文件');
  }
}

if (!API_KEY) {
  console.error('\n❌ 错误: 未找到 ANTHROPIC_API_KEY');
  console.error('请设置环境变量或在 .env 文件中配置');
  process.exit(1);
}

console.log('\n✅ API Key 已找到');
console.log(`   长度: ${API_KEY.length} 字符`);
console.log(`   前缀: ${API_KEY.substring(0, 20)}...`);
console.log('');

// 要测试的模型列表
const MODELS_TO_TEST = [
  { name: 'claude-3-haiku-20240307', note: '旧版 Haiku (你当前使用)' },
  { name: 'claude-3-5-haiku-20241022', note: '最新 Haiku (推荐)' },
  { name: 'claude-3-5-sonnet-20241022', note: '最新 Sonnet' },
  { name: 'claude-3-opus-20240229', note: 'Opus (最强)' }
];

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
        'anthropic-version': '2023-06-01',
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
            error: body,
            rawBody: body
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

  const results = [];

  for (const modelInfo of MODELS_TO_TEST) {
    const modelName = modelInfo.name.padEnd(35);
    process.stdout.write(`   测试 ${modelName} ... `);
    const result = await testModel(modelInfo.name);
    results.push({ ...result, note: modelInfo.note });

    if (result.success) {
      console.log('✅ 成功');
    } else {
      console.log(`❌ 失败 (HTTP ${result.status})`);
      if (result.response?.error) {
        const errorType = result.response.error.type || 'unknown';
        const errorMsg = result.response.error.message || 'No message';
        console.log(`      错误类型: ${errorType}`);
        console.log(`      错误信息: ${errorMsg}`);
      } else if (result.error) {
        console.log(`      错误: ${result.error}`);
      }
    }

    // 延迟避免速率限制
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n' + '='.repeat(60));
  console.log('\n📊 诊断结果分析:\n');

  // 分析结果
  const oldHaiku = results.find(r => r.model === 'claude-3-haiku-20240307');
  const newHaiku = results.find(r => r.model === 'claude-3-5-haiku-20241022');
  const successModels = results.filter(r => r.success);

  if (oldHaiku && oldHaiku.status === 403) {
    console.log('🎯 **确诊问题**: 旧版 claude-3-haiku-20240307 返回 403');
    console.log('');
    console.log('   原因: 该模型版本已被 Anthropic 禁用或限制访问');
    console.log('');

    if (newHaiku && newHaiku.success) {
      console.log('✅ **解决方案**: 使用最新版本 claude-3-5-haiku-20241022');
      console.log('');
      console.log('   立即修复步骤:');
      console.log('');
      console.log('   1. 在 Zeabur 控制台设置环境变量:');
      console.log('      变量名: CLAUDE_MODEL');
      console.log('      变量值: claude-3-5-haiku-20241022');
      console.log('');
      console.log('   2. 或在本地 .env 文件添加:');
      console.log('      CLAUDE_MODEL=claude-3-5-haiku-20241022');
      console.log('');
      console.log('   3. 重启服务');
      console.log('');
    } else {
      console.log('⚠️  新版 Haiku 也无法使用，继续检查...');
    }
  }

  if (oldHaiku && oldHaiku.status === 401) {
    console.log('❌ **API Key 无效**');
    console.log('');
    console.log('   可能原因:');
    console.log('   - API Key 格式错误');
    console.log('   - API Key 已过期');
    console.log('   - API Key 已被删除');
    console.log('');
    console.log('   解决方案:');
    console.log('   1. 访问 https://console.anthropic.com/settings/keys');
    console.log('   2. 创建新的 API Key');
    console.log('   3. 更新 .env 文件和 Zeabur 环境变量');
    console.log('');
  }

  if (oldHaiku && oldHaiku.status === 429) {
    console.log('⚠️  **速率限制**');
    console.log('');
    console.log('   当前账号已达到API调用限制');
    console.log('');
    console.log('   解决方案:');
    console.log('   - 等待一段时间后重试');
    console.log('   - 升级账号等级');
    console.log('   - 联系 Anthropic 支持');
    console.log('');
  }

  if (successModels.length === 0) {
    console.log('❌ **所有模型均不可用**');
    console.log('');
    console.log('   可能原因:');
    console.log('   1. API Key 无效或已过期');
    console.log('   2. 账号余额不足 (需要充值)');
    console.log('   3. 网络连接问题');
    console.log('   4. 账号被暂停');
    console.log('');
    console.log('   诊断步骤:');
    console.log('   1. 访问 https://console.anthropic.com/account/billing');
    console.log('      检查账号余额和状态');
    console.log('   2. 访问 https://console.anthropic.com/settings/keys');
    console.log('      验证 API Key 是否有效');
    console.log('   3. 尝试从本地网络测试（排除区域限制）');
    console.log('');
  } else {
    console.log(`✅ 找到 ${successModels.length} 个可用模型:\n`);
    successModels.forEach(m => {
      const note = results.find(r => r.model === m.model)?.note || '';
      console.log(`   • ${m.model}`);
      console.log(`     ${note}`);
    });
    console.log('');
  }

  // 生成配置建议
  if (successModels.length > 0) {
    const recommended = successModels[0].model;
    console.log('🎯 **推荐配置**:\n');
    console.log('   更新 Zeabur 环境变量:');
    console.log(`   CLAUDE_MODEL=${recommended}`);
    console.log('');
    console.log('   或更新 .env 文件:');
    console.log(`   CLAUDE_MODEL=${recommended}`);
    console.log('');
  }

  console.log('='.repeat(60));
  console.log('');
}

diagnose().catch(console.error);
