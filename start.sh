#!/bin/bash

echo "🚀 Starting Xiaohongshu AI Automation System v2.1.1 (binary-included)..."

# 🔥 强制Playwright使用headless模式（Zeabur容器没有GUI）
export PLAYWRIGHT_HEADLESS=true
export DISPLAY=:99
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
echo "✅ Playwright环境变量已设置（headless模式）"

# 首先加载环境变量
if [ -f ".env" ]; then
    echo "📋 Loading environment variables from .env..."
    export $(cat .env | grep -v '^#' | xargs)
    echo "✅ Environment variables loaded"
else
    echo "⚠️  No .env file found, using system environment variables"
fi

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
    (cd playwright-service/claude-agent-service && npm install && npm run build)
fi

# 检查二进制文件
echo "🔍 [start.sh] Checking for MCP binary..."
echo "📂 [start.sh] Current directory: $(pwd)"
echo "📋 [start.sh] Listing playwright-service/mcp-router/:"
ls -lah playwright-service/mcp-router/ 2>&1 | head -20 || echo "Directory does not exist"

if [ -f "playwright-service/mcp-router/xiaohongshu-mcp" ]; then
    BINARY_SIZE=$(stat -c%s "playwright-service/mcp-router/xiaohongshu-mcp" 2>/dev/null || stat -f%z "playwright-service/mcp-router/xiaohongshu-mcp" 2>/dev/null)
    echo "✅ [start.sh] Found binary from repository"
    echo "📏 [start.sh] Binary size: $BINARY_SIZE bytes"

    if [ "$BINARY_SIZE" -lt 1000 ]; then
        echo "⚠️ [start.sh] WARNING: Binary is suspiciously small ($BINARY_SIZE bytes)!"
        echo "🔍 [start.sh] Binary content preview:"
        head -5 playwright-service/mcp-router/xiaohongshu-mcp
        echo "❌ [start.sh] This appears to be a mock script, not the real binary!"
    fi

    chmod +x playwright-service/mcp-router/xiaohongshu-mcp
elif [ -f "playwright-service/mcp-router/bin/xiaohongshu-mcp" ]; then
    echo "✅ [start.sh] Found binary in bin/"
    cp playwright-service/mcp-router/bin/xiaohongshu-mcp playwright-service/mcp-router/xiaohongshu-mcp
    chmod +x playwright-service/mcp-router/xiaohongshu-mcp
else
    echo "❌ [start.sh] Binary not found at expected locations!"
    echo "🔍 [start.sh] Searching for any xiaohongshu binaries..."
    find . -name "*xiaohongshu*" -type f 2>/dev/null | head -20 || echo "No binaries found"

    echo "🔽 [start.sh] Attempting runtime download as fallback..."
    if command -v wget >/dev/null 2>&1 || command -v curl >/dev/null 2>&1; then
        echo "📦 [start.sh] Downloading MCP binary at runtime..."
        mkdir -p /tmp/mcp-download

        if command -v wget >/dev/null 2>&1; then
            wget -q -O /tmp/mcp-download/binary.tar.gz https://github.com/xpzouying/xiaohongshu-mcp/releases/download/v2025.10.04.1522-d84bf2e/xiaohongshu-mcp-linux-amd64.tar.gz
        else
            curl -sL -o /tmp/mcp-download/binary.tar.gz https://github.com/xpzouying/xiaohongshu-mcp/releases/download/v2025.10.04.1522-d84bf2e/xiaohongshu-mcp-linux-amd64.tar.gz
        fi

        if [ -f /tmp/mcp-download/binary.tar.gz ]; then
            echo "📦 [start.sh] Downloaded $(ls -lh /tmp/mcp-download/binary.tar.gz | awk '{print $5}')"
            tar -xzf /tmp/mcp-download/binary.tar.gz -C /tmp/mcp-download/

            if [ -f /tmp/mcp-download/xiaohongshu-mcp-linux-amd64 ]; then
                cp /tmp/mcp-download/xiaohongshu-mcp-linux-amd64 playwright-service/mcp-router/xiaohongshu-mcp
                chmod +x playwright-service/mcp-router/xiaohongshu-mcp
                RUNTIME_SIZE=$(stat -c%s "playwright-service/mcp-router/xiaohongshu-mcp" 2>/dev/null || stat -f%z "playwright-service/mcp-router/xiaohongshu-mcp" 2>/dev/null)
                echo "✅ [start.sh] Runtime download successful! Binary size: $RUNTIME_SIZE bytes"
                rm -rf /tmp/mcp-download
            else
                echo "❌ [start.sh] Binary not found in downloaded archive!"
                echo "📋 [start.sh] Archive contents:"
                tar -tzf /tmp/mcp-download/binary.tar.gz
                echo "⚠️ [start.sh] Falling back to mock mode"
                rm -rf /tmp/mcp-download
                mkdir -p playwright-service/mcp-router
                cat > playwright-service/mcp-router/xiaohongshu-mcp <<'BIN'
#!/bin/bash
echo "MCP binary not available"
exit 1
BIN
                chmod +x playwright-service/mcp-router/xiaohongshu-mcp
            fi
        else
            echo "❌ [start.sh] Download failed!"
            echo "⚠️ [start.sh] MCP Router will run in mock mode"
            mkdir -p playwright-service/mcp-router
            cat > playwright-service/mcp-router/xiaohongshu-mcp <<'BIN'
#!/bin/bash
echo "MCP binary not available"
exit 1
BIN
            chmod +x playwright-service/mcp-router/xiaohongshu-mcp
        fi
    else
        echo "❌ [start.sh] No download tools available (wget/curl)"
        echo "⚠️ [start.sh] MCP Router will run in mock mode"
        mkdir -p playwright-service/mcp-router
        cat > playwright-service/mcp-router/xiaohongshu-mcp <<'BIN'
#!/bin/bash
echo "MCP binary not available"
exit 1
BIN
        chmod +x playwright-service/mcp-router/xiaohongshu-mcp
    fi
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

APP_PORT_RAW="${PORT:-${WEB_PORT:-}}"
MCP_HTTP_PORT_RAW="${HTTP_PORT:-${WEB_PORT:-}}"

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
    echo "⚠️  MCP HTTP port conflicts with app port ($APP_PORT). Adjusting MCP port to 3001."
    MCP_HTTP_PORT=3001
    if [ "$MCP_HTTP_PORT" = "$APP_PORT" ]; then
        MCP_HTTP_PORT=$((APP_PORT + 1))
        echo "ℹ️  Using fallback MCP port: $MCP_HTTP_PORT"
    fi
fi

export PORT="$APP_PORT"
export HTTP_PORT="$MCP_HTTP_PORT"

MCP_ROUTER_URL_EFFECTIVE="${MCP_ROUTER_URL:-http://127.0.0.1:${MCP_HTTP_PORT}}"

# 🔥 设置PUBLIC_URL用于生成完整的图片URL（MCP binary需要）
if [ -z "$PUBLIC_URL" ]; then
    # 检测环境：生产环境使用固定域名，本地开发使用localhost
    if [ "$NODE_ENV" = "production" ]; then
        export PUBLIC_URL="https://xiaohongshu-automation-ai.zeabur.app"
    else
        export PUBLIC_URL="http://localhost:${APP_PORT}"
    fi
fi

echo "🌐 Network configuration:"
echo "  • APP_PORT: $APP_PORT"
echo "  • MCP_HTTP_PORT: $MCP_HTTP_PORT"
echo "  • MCP_ROUTER_URL: $MCP_ROUTER_URL_EFFECTIVE"
echo "  • PUBLIC_URL: $PUBLIC_URL"

# 清理旧的MCP进程（防止端口冲突）
echo "🧹 Cleaning up old MCP processes..."
pkill -f "httpServer.js" 2>/dev/null || true
pkill -f "xiaohongshu-mcp" 2>/dev/null || true
pkill -f "Xvfb" 2>/dev/null || true
sleep 2

# 🔥 启动虚拟显示服务器（用于Playwright headless浏览器）
echo "🖥️  Starting virtual display server (Xvfb)..."
if command -v Xvfb >/dev/null 2>&1; then
    Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp -nolisten unix > /dev/null 2>&1 &
    XVFB_PID=$!
    export DISPLAY=:99
    echo "✅ Xvfb started on display :99 (PID: $XVFB_PID)"
    sleep 1
else
    echo "⚠️  Xvfb not found, relying on PLAYWRIGHT_HEADLESS=true"
fi

# 🔥 创建 Chromium 符号链接（go-rod 需要 /usr/bin/chromium）
echo "🔧 Creating Chromium symlink for go-rod..."
CHROMIUM_PATH=$(find /root/.cache/ms-playwright -name chrome -type f | grep "chrome-linux/chrome" | head -1)
if [ -n "$CHROMIUM_PATH" ]; then
    # 确保/usr/bin目录存在
    mkdir -p /usr/bin
    # 创建或更新符号链接
    ln -sf "$CHROMIUM_PATH" /usr/bin/chromium
    echo "✅ Created symlink: /usr/bin/chromium -> $CHROMIUM_PATH"
    # 验证符号链接
    if [ -L /usr/bin/chromium ]; then
        echo "✅ Symlink verified: $(ls -lh /usr/bin/chromium)"
    else
        echo "❌ Symlink creation failed!"
    fi
else
    echo "⚠️  Chromium not found in Playwright cache, searching alternative locations..."
    # 尝试查找系统安装的Chromium
    if command -v chromium-browser >/dev/null 2>&1; then
        CHROMIUM_PATH=$(which chromium-browser)
        ln -sf "$CHROMIUM_PATH" /usr/bin/chromium
        echo "✅ Using system Chromium: $CHROMIUM_PATH"
    else
        echo "❌ ERROR: No Chromium found! MCP Router may fail to start."
    fi
fi

# 启动MCP Router
echo "🔧 Starting MCP Router..."
cd playwright-service/mcp-router
echo "📂 Current directory: $(pwd)"
echo "📦 Binary exists: $(test -f xiaohongshu-mcp && echo 'YES' || echo 'NO')"
echo "🔑 Binary permissions: $(ls -la xiaohongshu-mcp 2>&1 | head -1 || echo 'N/A')"

# 🔥 启动MCP Router进程（简化版本，避免PID问题）
MCP_BINARY_PATH=./xiaohongshu-mcp HTTP_PORT="$MCP_HTTP_PORT" COOKIE_DIR=./cookies \
  node dist/httpServer.js > /tmp/mcp-router.log 2>&1 &
MCP_PID=$!
echo "📍 MCP Router started with PID: $MCP_PID"

# 启动日志跟踪进程（在后台显示日志）
tail -f /tmp/mcp-router.log 2>/dev/null | sed 's/^/[MCP-Router] /' &
TAIL_PID=$!
cd ../..

echo "📍 MCP Router PID: $MCP_PID (log tailer PID: $TAIL_PID)"
echo "📄 Logs will be in /tmp/mcp-router.log"

trap "kill $MCP_PID $TAIL_PID 2>/dev/null" EXIT

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
