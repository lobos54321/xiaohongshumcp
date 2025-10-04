#!/bin/bash

echo "🚀 启动小红书全自动运营系统"
echo "================================"

# 检查端口占用
echo "📋 检查端口占用..."
if lsof -i:4000 >/dev/null 2>&1; then
  echo "⚠️  端口4000被占用，正在清理..."
  lsof -ti:4000 | xargs kill -9 2>/dev/null || true
fi

if lsof -i:3000 >/dev/null 2>&1; then
  echo "⚠️  端口3000被占用，正在清理..."
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
fi

echo "✅ 端口清理完成"

# 启动MCP Router (后台)
echo "🔧 启动MCP Router..."
cd playwright-service/mcp-router
if [ ! -f "dist/httpServer.js" ]; then
  echo "❌ MCP Router未编译，正在编译..."
  npm run build
fi

# 启动HTTP服务器版本而不是stdio版本
echo "📡 启动MCP Router HTTP服务器..."
node dist/httpServer.js &
MCP_PID=$!
echo "✅ MCP Router已启动 (PID: $MCP_PID)"

cd ../..

# 等待MCP Router启动
echo "⏳ 等待MCP Router准备就绪..."
sleep 3

# 测试MCP Router
echo "🧪 测试MCP Router连接..."
curl -s http://localhost:3000/health >/dev/null 2>&1 && echo "✅ MCP Router运行正常" || echo "❌ MCP Router未响应"

# 启动Claude Agent Service
echo "🤖 启动Claude Agent Service..."
cd playwright-service/claude-agent-service

if [ ! -f "dist/server.js" ]; then
  echo "❌ Claude Agent未编译，正在编译..."
  npm run build
fi

# 检查环境变量
if [ ! -f ".env" ]; then
  echo "⚠️  未找到.env文件，创建默认配置..."
  cp .env.example .env
fi

echo "🔑 检查API Keys..."
if grep -q "your_api_key_here" .env; then
  echo "⚠️  检测到默认API Key，某些功能可能无法正常工作"
  echo "📝 请在 .env 文件中配置真实的 ANTHROPIC_API_KEY"
fi

echo "🚀 启动Claude Agent Service..."
node dist/server.js

# 清理函数
cleanup() {
  echo "🧹 正在清理..."
  kill $MCP_PID 2>/dev/null || true
  exit 0
}

trap cleanup EXIT INT TERM