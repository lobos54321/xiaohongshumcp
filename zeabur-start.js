#!/usr/bin/env node

// Zeabur 专用启动脚本 - 解决模块路径问题
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 Starting Xiaohongshu AI Automation System for Zeabur...');

// 设置模块路径
const modulePaths = [
  path.join(process.cwd(), 'node_modules'),
  path.join(process.cwd(), 'playwright-service/mcp-router/node_modules'),
  path.join(process.cwd(), 'playwright-service/claude-agent-service/node_modules')
];

// 设置环境变量
process.env.NODE_PATH = modulePaths.join(':');
process.env.NODE_ENV = 'production';
process.env.PORT = '8080';

console.log('🔧 Environment Variables:');
console.log('- NODE_ENV:', process.env.NODE_ENV);
console.log('- PORT:', process.env.PORT);
console.log('- NODE_PATH:', process.env.NODE_PATH);

// 检查必需的文件
const requiredFiles = [
  'playwright-service/mcp-router/dist/httpServer.js',
  'playwright-service/mcp-router/xiaohongshu-mcp'
];

console.log('📦 Checking required files...');
for (const file of requiredFiles) {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file} exists`);
  } else {
    console.log(`❌ ${file} missing`);
  }
}

// 检查 express 模块
console.log('🔍 Checking express module...');
try {
  require.resolve('express');
  console.log('✅ express module found in root');
} catch (e) {
  console.log('❌ express not found in root, checking subdirectories...');

  for (const modulePath of modulePaths) {
    try {
      require.resolve(path.join(modulePath, 'express'));
      console.log(`✅ express found in ${modulePath}`);
      break;
    } catch (e) {
      console.log(`❌ express not found in ${modulePath}`);
    }
  }
}

// 启动 MCP Router HTTP 服务器（生产模式）
console.log('🌐 Starting MCP Router HTTP Server on port 8080...');

const serverScript = path.join(process.cwd(), 'playwright-service/mcp-router/dist/httpServer.js');

const child = spawn('node', [serverScript], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_PATH: modulePaths.join(':')
  },
  cwd: process.cwd()
});

child.on('error', (error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

child.on('exit', (code) => {
  console.log(`Server exited with code ${code}`);
  process.exit(code);
});

// 优雅关闭处理
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  child.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  child.kill('SIGINT');
});