#!/bin/bash

echo "🧪 测试小红书发布功能"
echo "================================"

USER_ID="demo-user"
MCP_PORT="18060"

echo "1️⃣ 检查登录状态..."
curl -s "http://localhost:3000/mcp/call" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$USER_ID\",
    \"toolName\": \"xiaohongshu_check_login\",
    \"arguments\": {}
  }" | python3 -m json.tool

echo -e "\n2️⃣ 测试简单发布（无图片）..."
curl -s "http://localhost:3000/mcp/call" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$USER_ID\",
    \"toolName\": \"xiaohongshu_publish_content\",
    \"arguments\": {
      \"title\": \"测试标题\",
      \"content\": \"这是一条测试内容\",
      \"tags\": [\"测试\"]
    }
  }" | python3 -m json.tool

echo -e "\n✅ 测试完成"
