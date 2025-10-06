#!/bin/bash

echo "🔐 打开小红书登录窗口"
echo "================================"

USER_ID="demo-user"
COOKIE_DIR="/Users/boliu/xiaohongshumcp/playwright-service/mcp-router/cookies/$USER_ID"
MCP_BINARY="/Users/boliu/xiaohongshumcp/playwright-service/mcp-router/xiaohongshu-mcp"

# 确保Cookie目录存在
mkdir -p "$COOKIE_DIR"

echo "📁 Cookie目录: $COOKIE_DIR"
echo "🚀 启动xiaohongshu-mcp浏览器..."
echo ""
echo "⏰ 请在打开的浏览器窗口中："
echo "   1. 扫描二维码登录"
echo "   2. 登录成功后按 Ctrl+C 停止程序"
echo "   3. Cookie会自动保存"
echo ""

# 切换到Cookie目录并运行
cd "$COOKIE_DIR"
"$MCP_BINARY"
