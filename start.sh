#!/bin/bash

echo "🚀 Starting Xiaohongshu AI Automation System v2.1.1 (binary-included)..."

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

# 检查预包含的二进制文件
if [ -f "playwright-service/mcp-router/bin/xiaohongshu-mcp" ]; then
    echo "✅ Found pre-included Linux binary"
    cp playwright-service/mcp-router/bin/xiaohongshu-mcp playwright-service/mcp-router/xiaohongshu-mcp
    chmod +x playwright-service/mcp-router/xiaohongshu-mcp
else
    echo "🔧 Pre-included binary not found, downloading..."
    mkdir -p playwright-service/mcp-router
    cd /tmp

    echo "📥 Downloading from GitHub releases..."
    wget -q https://github.com/xpzouying/xiaohongshu-mcp/releases/download/v2025.10.04.1522-d84bf2e/xiaohongshu-mcp-linux-amd64.tar.gz

    if [ $? -eq 0 ]; then
        echo "📦 Extracting binary..."
        tar -xzf xiaohongshu-mcp-linux-amd64.tar.gz

        # 使用当前工作目录路径
        WORKING_DIR=$(pwd | sed 's|/tmp|/src|')
        cp xiaohongshu-mcp-linux-amd64 ${WORKING_DIR}/playwright-service/mcp-router/xiaohongshu-mcp
        chmod +x ${WORKING_DIR}/playwright-service/mcp-router/xiaohongshu-mcp

        echo "✅ Binary installed successfully"
        cd ${WORKING_DIR}
    else
        echo "❌ Failed to download binary"
        exit 1
    fi
fi

echo "✅ All files ready"

# 检查环境变量
echo "🔍 Checking environment variables..."
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "⚠️  ANTHROPIC_API_KEY not set - demo mode will be used"
else
    echo "✅ ANTHROPIC_API_KEY is set (${#ANTHROPIC_API_KEY} chars)"
fi

if [ -z "$GEMINI_API_KEY" ]; then
    echo "⚠️  GEMINI_API_KEY not set - image generation may fail"
else
    echo "✅ GEMINI_API_KEY is set (${#GEMINI_API_KEY} chars)"
fi

# 启动MCP Router (后台)
echo "🔧 Starting MCP Router..."
cd playwright-service/mcp-router
echo "📂 Current directory: $(pwd)"
echo "📦 Binary exists: $(test -f xiaohongshu-mcp && echo 'YES' || echo 'NO')"
echo "🔑 Binary permissions: $(ls -la xiaohongshu-mcp 2>&1 | head -1 || echo 'N/A')"

MCP_BINARY_PATH=./xiaohongshu-mcp HTTP_PORT=3000 COOKIE_DIR=./cookies node dist/httpServer.js > /tmp/mcp-router.log 2>&1 &
MCP_PID=$!
echo "📍 MCP Router PID: $MCP_PID"
echo "📄 Logs will be in /tmp/mcp-router.log"
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
        echo "⚠️  MCP Router health check failed, but continuing anyway..."
        echo "📋 MCP Router logs (last 20 lines):"
        tail -20 /tmp/mcp-router.log 2>&1 || echo "No logs available"
        echo "---"
    fi
done

# 启动Claude Agent Service
echo "🤖 Starting Claude Agent Service..."
cd playwright-service/claude-agent-service
echo "📂 Current directory: $(pwd)"
echo "📦 Server file exists: $(test -f dist/server.js && echo 'YES' || echo 'NO')"
echo "🌐 MCP_ROUTER_URL: http://localhost:3000"
echo "🔌 PORT: 4000"

MCP_ROUTER_URL=http://localhost:3000 PORT=4000 node dist/server.js 2>&1 | tee /tmp/claude-agent.log

# 清理
trap "kill $MCP_PID 2>/dev/null" EXIT
