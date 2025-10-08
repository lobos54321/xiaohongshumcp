#!/usr/bin/env node

// Zeabur 专用启动脚本 - 解决模块路径问题
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Starting Xiaohongshu AI Automation System via start.sh...');

const startScript = path.join(process.cwd(), 'start.sh');

if (!fs.existsSync(startScript)) {
  console.error('❌ start.sh not found. Please ensure the file exists in the project root.');
  process.exit(1);
}

const child = spawn('bash', [startScript], {
  stdio: 'inherit',
  env: process.env,
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
