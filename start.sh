#!/bin/bash

echo "🚀 Starting Xiaohongshu AI Automation System..."

# 检查必要的文件
echo "📦 Checking dist files..."
if [ ! -f "playwright-service/mcp-router/dist/httpServer.js" ]; then
    echo "❌ MCP Router dist not found, building..."
    cd playwright-service/mcp-router && npm run build && cd ../..
fi

if [ ! -f "playwright-service/claude-agent-service/dist/server.js" ]; then
    echo "❌ Claude Agent dist not found, building..."
    cd playwright-service/claude-agent-service && npm run build && cd ../..
fi

# 启动MCP Router (后台)
echo "🔧 Starting MCP Router..."
cd playwright-service/mcp-router
node dist/httpServer.js &
MCP_PID=$!
cd ../..

# 等待MCP Router启动
echo "⏳ Waiting for MCP Router to start..."
sleep 3

# 启动Claude Agent Service
echo "🤖 Starting Claude Agent Service..."
cd playwright-service/claude-agent-service
node dist/server.js

# 清理
trap "kill $MCP_PID 2>/dev/null" EXIT
