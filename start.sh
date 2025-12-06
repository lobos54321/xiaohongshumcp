#!/bin/bash

echo "🚀 Starting Claude Agent Service v3.0 (No MCP)..."

# Check environment variables
echo "🔍 Checking environment variables..."
echo "  ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:0:20}... (${#ANTHROPIC_API_KEY} chars)"
echo "  GEMINI_API_KEY: ${GEMINI_API_KEY:0:20}... (${#GEMINI_API_KEY} chars)"
echo "  NODE_ENV: $NODE_ENV"
echo "  PORT: $PORT"

# Force Playwright headless mode
export PLAYWRIGHT_HEADLESS=true
export DISPLAY=:99
echo "✅ Playwright headless mode enabled"

# Load .env file if exists
if [ -f ".env" ]; then
    echo "📋 Loading environment variables from .env..."
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check if dist files exist
echo "📦 Checking dist files..."
CLAUDE_DIST_DIR="playwright-service/claude-agent-service/dist"

if [ ! -f "$CLAUDE_DIST_DIR/server.js" ]; then
    echo "🔄 Building Claude Agent Service..."
    (cd playwright-service/claude-agent-service && npm install && npm run build)
fi

echo "✅ All files ready"

# Port configuration
APP_PORT="${PORT:-8080}"
export PORT="$APP_PORT"

echo "🌐 Server will run on port: $APP_PORT"

# Start virtual display (for Playwright)
echo "🖥️  Starting virtual display server (Xvfb)..."
if command -v Xvfb >/dev/null 2>&1; then
    Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp -nolisten unix > /dev/null 2>&1 &
    XVFB_PID=$!
    export DISPLAY=:99
    echo "✅ Xvfb started on display :99"
    sleep 1
else
    echo "⚠️  Xvfb not found, relying on PLAYWRIGHT_HEADLESS=true"
fi

# Start Claude Agent Service
echo "🚀 Starting Claude Agent Service..."
cd playwright-service/claude-agent-service

ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
GEMINI_API_KEY="$GEMINI_API_KEY" \
UNSPLASH_ACCESS_KEY="$UNSPLASH_ACCESS_KEY" \
VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
VITE_SUPABASE_ANON_KEY="$VITE_SUPABASE_ANON_KEY" \
PORT="$APP_PORT" \
node dist/server.js 2>&1 | tee /tmp/claude-agent.log
