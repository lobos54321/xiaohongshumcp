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

# 检查二进制文件（Dockerfile应该已经下载了）
if [ -f "playwright-service/mcp-router/xiaohongshu-mcp" ]; then
    echo "✅ Found binary from Dockerfile"
    chmod +x playwright-service/mcp-router/xiaohongshu-mcp
elif [ -f "playwright-service/mcp-router/bin/xiaohongshu-mcp" ]; then
    echo "✅ Found binary in bin/"
    cp playwright-service/mcp-router/bin/xiaohongshu-mcp playwright-service/mcp-router/xiaohongshu-mcp
    chmod +x playwright-service/mcp-router/xiaohongshu-mcp
else
    echo "❌ Binary not found and download not supported in this environment"
    echo "⚠️  MCP Router will not be available, but Claude Agent will still work in demo mode"
    # Create a dummy binary to prevent errors
    mkdir -p playwright-service/mcp-router
    echo '#!/bin/bash\necho "MCP binary not available"\nexit 1' > playwright-service/mcp-router/xiaohongshu-mcp
    chmod +x playwright-service/mcp-router/xiaohongshu-mcp
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

# 启动MCP Router
echo "🔧 Starting MCP Router..."
cd playwright-service/mcp-router
echo "📂 Current directory: $(pwd)"
echo "📦 Binary exists: $(test -f xiaohongshu-mcp && echo 'YES' || echo 'NO')"
echo "🔑 Binary permissions: $(ls -la xiaohongshu-mcp 2>&1 | head -1 || echo 'N/A')"

# 检查是否是Zeabur环境（生产环境且PORT=8080）
if [ "$NODE_ENV" = "production" ] && [ "$PORT" = "8080" ]; then
    echo "🌐 Zeabur部署模式 - 启动HTTP服务在端口8080"
    MCP_BINARY_PATH=./xiaohongshu-mcp HTTP_PORT=8080 COOKIE_DIR=./cookies node dist/httpServer.js
else
    echo "🔧 开发模式 - 启动完整系统"
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
fi
