#!/bin/bash

echo "🔐 小红书登录助手"
echo "================================"

# 获取用户ID
read -p "请输入用户ID（例如：demo-user）: " USER_ID

if [ -z "$USER_ID" ]; then
    echo "❌ 用户ID不能为空"
    exit 1
fi

# Cookie目录
COOKIE_DIR="/Users/boliu/xiaohongshumcp/playwright-service/mcp-router/cookies/$USER_ID"
MCP_BINARY="/Users/boliu/xiaohongshumcp/playwright-service/mcp-router/xiaohongshu-mcp"

# 创建Cookie目录
mkdir -p "$COOKIE_DIR"

echo "📁 Cookie目录: $COOKIE_DIR"
echo "🚀 启动xiaohongshu-mcp浏览器..."
echo ""
echo "⏰ 请在打开的浏览器窗口中："
echo "   1. 扫描二维码登录"
echo "   2. 登录成功后关闭浏览器"
echo "   3. Cookie会自动保存"
echo ""

# 在Cookie目录中运行xiaohongshu-mcp
cd "$COOKIE_DIR"
"$MCP_BINARY"

echo ""
echo "✅ 登录流程完成！"
echo "📝 检查Cookie文件..."

if [ -f "$COOKIE_DIR/cookies.json" ]; then
    echo "✅ Cookie已保存：$COOKIE_DIR/cookies.json"
    ls -lh "$COOKIE_DIR/cookies.json"
else
    echo "❌ 未找到Cookie文件"
    echo "💡 请确保在浏览器中成功登录了小红书"
fi
