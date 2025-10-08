#!/bin/bash

echo "🚀 Starting Xiaohongshu AI Automation System v2.1.1 (binary-included)..."

# 检查必要的文件
echo "📦 Checking dist files..."
if [ ! -f "playwright-service/mcp-router/dist/httpServer.js" ]; then
    echo "❌ MCP Router dist not found, building..."
    (cd playwright-service/mcp-router && npm run build)
fi

# Ensure all Claude Agent build artifacts exist, not just server.js
CLAUDE_DIST_DIR="playwright-service/claude-agent-service/dist"
CLAUDE_REQUIRED_FILES=(
    "$CLAUDE_DIST_DIR/server.js"
    "$CLAUDE_DIST_DIR/autoContentManager.js"
    "$CLAUDE_DIST_DIR/imageGenerationService.js"
)

CLAUDE_BUILD_MISSING=false
for required in "${CLAUDE_REQUIRED_FILES[@]}"; do
    if [ ! -f "$required" ]; then
        echo "❌ Missing Claude Agent build artifact: $required"
        CLAUDE_BUILD_MISSING=true
    fi
done

if [ "$CLAUDE_BUILD_MISSING" = true ]; then
    echo "🔄 Rebuilding Claude Agent dist..."
    (cd playwright-service/claude-agent-service && npm run build)
fi

# 检查二进制文件
if [ -f "playwright-service/mcp-router/xiaohongshu-mcp" ]; then
    echo "✅ Found binary from repository"
    chmod +x playwright-service/mcp-router/xiaohongshu-mcp
elif [ -f "playwright-service/mcp-router/bin/xiaohongshu-mcp" ]; then
    echo "✅ Found binary in bin/"
    cp playwright-service/mcp-router/bin/xiaohongshu-mcp playwright-service/mcp-router/xiaohongshu-mcp
    chmod +x playwright-service/mcp-router/xiaohongshu-mcp
else
    echo "❌ Binary not found and download not supported in this environment"
    echo "⚠️  MCP Router will run in mock mode"
    mkdir -p playwright-service/mcp-router
    cat > playwright-service/mcp-router/xiaohongshu-mcp <<'BIN'
#!/bin/bash
echo "MCP binary not available"
exit 1
BIN
    chmod +x playwright-service/mcp-router/xiaohongshu-mcp
fi

echo "✅ All files ready"

# 环境变量检查
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

APP_PORT_RAW="${PORT:-}"
MCP_HTTP_PORT_RAW="${HTTP_PORT:-}"

if [[ "$APP_PORT_RAW" =~ ^[0-9]+$ ]]; then
    APP_PORT="$APP_PORT_RAW"
else
    APP_PORT="8080"
    echo "⚠️  Invalid or missing PORT ('$APP_PORT_RAW'), falling back to $APP_PORT"
fi

if [[ "$MCP_HTTP_PORT_RAW" =~ ^[0-9]+$ ]]; then
    MCP_HTTP_PORT="$MCP_HTTP_PORT_RAW"
else
    MCP_HTTP_PORT="3000"
    echo "⚠️  Invalid or missing HTTP_PORT ('$MCP_HTTP_PORT_RAW'), falling back to $MCP_HTTP_PORT"
fi

if [ "$MCP_HTTP_PORT" = "$APP_PORT" ]; then
    echo "⚠️  MCP HTTP port conflicts with app port ($APP_PORT). Adjusting MCP port to 3000."
    MCP_HTTP_PORT=3000
    if [ "$MCP_HTTP_PORT" = "$APP_PORT" ]; then
        MCP_HTTP_PORT=$((APP_PORT + 1))
        echo "ℹ️  Using fallback MCP port: $MCP_HTTP_PORT"
    fi
fi

export PORT="$APP_PORT"
export HTTP_PORT="$MCP_HTTP_PORT"

MCP_ROUTER_URL_EFFECTIVE="${MCP_ROUTER_URL:-http://127.0.0.1:${MCP_HTTP_PORT}}"

echo "🌐 Network configuration:"
echo "  • APP_PORT: $APP_PORT"
echo "  • MCP_HTTP_PORT: $MCP_HTTP_PORT"
echo "  • MCP_ROUTER_URL: $MCP_ROUTER_URL_EFFECTIVE"

# 启动MCP Router
echo "🔧 Starting MCP Router..."
cd playwright-service/mcp-router
echo "📂 Current directory: $(pwd)"
echo "📦 Binary exists: $(test -f xiaohongshu-mcp && echo 'YES' || echo 'NO')"
echo "🔑 Binary permissions: $(ls -la xiaohongshu-mcp 2>&1 | head -1 || echo 'N/A')"

MCP_BINARY_PATH=./xiaohongshu-mcp HTTP_PORT="$MCP_HTTP_PORT" COOKIE_DIR=./cookies node dist/httpServer.js > /tmp/mcp-router.log 2>&1 &
MCP_PID=$!
cd ../..

echo "📍 MCP Router PID: $MCP_PID"
echo "📄 Logs will be in /tmp/mcp-router.log"

trap "kill $MCP_PID 2>/dev/null" EXIT

echo "⏳ Waiting for MCP Router to start..."
sleep 5

echo "🔍 Checking MCP Router health..."
for i in {1..10}; do
    if curl -f "http://127.0.0.1:${MCP_HTTP_PORT}/health" >/dev/null 2>&1; then
        echo "✅ MCP Router is healthy"
        break
    fi
    echo "⏳ Attempt $i: MCP Router not ready yet..."
    sleep 2
    if [ $i -eq 10 ]; then
        echo "⚠️  MCP Router health check failed, showing logs..."
        tail -30 /tmp/mcp-router.log 2>&1 || echo "No logs available"
    fi
done

# 启动Claude Agent Service
echo "🤖 Starting Claude Agent Service..."
cd playwright-service/claude-agent-service
echo "📂 Current directory: $(pwd)"
echo "📦 Server file exists: $(test -f dist/server.js && echo 'YES' || echo 'NO')"
echo "🌐 MCP_ROUTER_URL: $MCP_ROUTER_URL_EFFECTIVE"
echo "🔌 PORT: $APP_PORT"

MCP_ROUTER_URL="$MCP_ROUTER_URL_EFFECTIVE" PORT="$APP_PORT" node dist/server.js 2>&1 | tee /tmp/claude-agent.log
