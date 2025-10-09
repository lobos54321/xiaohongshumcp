#!/usr/bin/env node

// 简单的HTTP请求测试，不使用SDK
import https from 'https';
import * as dotenv from 'dotenv';

dotenv.config();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

console.log('🔍 直接 HTTP API 测试...');
console.log(`API Key: ${ANTHROPIC_API_KEY ? '✅ 已设置' : '❌ 未设置'}`);

const data = JSON.stringify({
  model: 'claude-3-haiku-20240307',
  max_tokens: 10,
  messages: [{
    role: 'user',
    content: 'Hi'
  }]
});

const options = {
  hostname: 'api.anthropic.com',
  port: 443,
  path: '/v1/messages',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
    'Content-Length': data.length
  }
};

console.log('📡 发送请求到 api.anthropic.com...');

const req = https.request(options, (res) => {
  console.log(`状态码: ${res.statusCode}`);
  console.log(`响应头:`, res.headers);

  let responseData = '';
  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    console.log('\n📄 响应内容:');
    try {
      const parsed = JSON.parse(responseData);
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log('原始响应:', responseData);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ 请求错误:', error);
});

req.write(data);
req.end();