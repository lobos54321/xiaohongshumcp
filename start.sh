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

# 检查二进制文件
if [ ! -f "playwright-service/mcp-router/xiaohongshu-mcp" ]; then
    echo "❌ xiaohongshu-mcp binary not found!"
    exit 1
fi

echo "✅ xiaohongshu-mcp binary found"
echo "✅ All dist files ready"

# 启动MCP Router (后台)
echo "🔧 Starting MCP Router..."
cd playwright-service/mcp-router
MCP_BINARY_PATH=./xiaohongshu-mcp HTTP_PORT=3000 COOKIE_DIR=./cookies node dist/httpServer.js &
MCP_PID=$!
echo "📍 MCP Router PID: $MCP_PID"
cd ../..

# 等待MCP Router启动并验证
echo "⏳ Waiting for MCP Router to start..."
sleep 5

# 检查MCP Router健康状态
echo "🔍 Checking MCP Router health..."
for i in {1..10}; do
    if curl -f http://localhost:3000/health >/dev/null 2>&1; then
        echo "✅ MCP Router is healthy"
        break
    else
        echo "⏳ Attempt $i: MCP Router not ready yet..."
        sleep 2
    fi

    if [ $i -eq 10 ]; then
        echo "❌ MCP Router failed to start after 20 seconds"
        kill $MCP_PID 2>/dev/null
        exit 1
    fi
done

# 启动Claude Agent Service
echo "🤖 Starting Claude Agent Service..."
cd playwright-service/claude-agent-service
MCP_ROUTER_URL=http://localhost:3000 PORT=4000 node dist/server.js

# 清理
trap "kill $MCP_PID 2>/dev/null" EXIT
