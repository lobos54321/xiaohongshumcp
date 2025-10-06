#!/bin/bash

echo "🚀 Starting Xiaohongshu AI Automation System v2.1.1 (build 2)..."

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
BINARY_PATHS=(
    "playwright-service/mcp-router/xiaohongshu-mcp"
    "/usr/local/bin/xiaohongshu-mcp"
    "./xiaohongshu-mcp"
    "playwright-service/claude-agent-service/bin/xiaohongshu-mcp-linux-amd64"
    "playwright-service/claude-agent-service/bin/bin/xiaohongshu-mcp-linux-amd64"
)

BINARY_FOUND=""
for path in "${BINARY_PATHS[@]}"; do
    if [ -f "$path" ]; then
        echo "✅ Found xiaohongshu-mcp binary at: $path"
        BINARY_FOUND="$path"
        break
    fi
done

if [ -z "$BINARY_FOUND" ]; then
    echo "❌ xiaohongshu-mcp binary not found in any of these locations:"
    for path in "${BINARY_PATHS[@]}"; do
        echo "   - $path"
    done
    echo "Current working directory: $(pwd)"
    echo "Directory contents:"
    find . -name "*xiaohongshu*" -type f 2>/dev/null || echo "No xiaohongshu files found"

    # 尝试手动下载
    echo "🔧 Attempting to download binary manually..."
    mkdir -p playwright-service/mcp-router
    cd /tmp
    wget -v https://github.com/xpzouying/xiaohongshu-mcp/releases/download/v2025.10.04.1522-d84bf2e/xiaohongshu-mcp-linux-amd64.tar.gz
    if [ $? -eq 0 ]; then
        tar -xzf xiaohongshu-mcp-linux-amd64.tar.gz
        cp xiaohongshu-mcp-linux-amd64 /src/playwright-service/mcp-router/xiaohongshu-mcp
        chmod +x /src/playwright-service/mcp-router/xiaohongshu-mcp
        BINARY_FOUND="playwright-service/mcp-router/xiaohongshu-mcp"
        echo "✅ Manual download successful"
        cd /src
    else
        echo "❌ Manual download failed"
        exit 1
    fi
fi

echo "✅ xiaohongshu-mcp binary found"
echo "✅ All dist files ready"

# 启动MCP Router (后台)
echo "🔧 Starting MCP Router..."
cd playwright-service/mcp-router

# 根据binary路径设置正确的MCP_BINARY_PATH
if [[ "$BINARY_FOUND" == /* ]]; then
    # 绝对路径
    MCP_BINARY_PATH="$BINARY_FOUND"
else
    # 相对路径，需要调整
    MCP_BINARY_PATH="../../$BINARY_FOUND"
fi

echo "📍 Using binary at: $MCP_BINARY_PATH"
MCP_BINARY_PATH="$MCP_BINARY_PATH" HTTP_PORT=3000 COOKIE_DIR=./cookies node dist/httpServer.js &
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
