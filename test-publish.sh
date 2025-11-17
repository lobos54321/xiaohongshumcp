#!/bin/bash
# 小红书发布功能测试脚本
# 版本: 2.0 - 修复端口和API路径配置
# 更新日期: 2025-01-15

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置
MCP_ROUTER_BASE_URL="${MCP_ROUTER_URL:-http://localhost:3000}"
TEST_USER_ID="${TEST_USER_ID:-demo-user}"
API_TIMEOUT="${API_TIMEOUT:-30}"

echo "${BLUE}========================================${NC}"
echo "${BLUE}🧪 小红书发布功能测试${NC}"
echo "${BLUE}========================================${NC}"
echo ""
echo "配置信息:"
echo "  • MCP Router URL: $MCP_ROUTER_BASE_URL"
echo "  • 测试用户ID: $TEST_USER_ID"
echo "  • 超时时间: ${API_TIMEOUT}秒"
echo ""

# 前置检查
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "${BLUE}🔍 前置环境检查${NC}"
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# 检查 MCP Router 健康状态
HEALTH_CHECK=$(curl -s -w "%{http_code}" -m 5 "$MCP_ROUTER_BASE_URL/health" -o /dev/null)
if [ "$HEALTH_CHECK" = "200" ]; then
    echo "${GREEN}✅ MCP Router 健康检查通过${NC}"
else
    echo "${RED}❌ MCP Router 健康检查失败 (HTTP $HEALTH_CHECK)${NC}"
    echo "${YELLOW}请先运行: ./diagnose-mcp-router.sh 进行诊断${NC}"
    exit 1
fi
echo ""

# 测试 1: 检查登录状态
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "${BLUE}1️⃣  检查登录状态${NC}"
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "调用: $MCP_ROUTER_BASE_URL/api/xiaohongshu/login/status"
echo ""

LOGIN_RESPONSE=$(curl -s "$MCP_ROUTER_BASE_URL/api/xiaohongshu/login/status?userId=$TEST_USER_ID" \
  --max-time $API_TIMEOUT)

echo "$LOGIN_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$LOGIN_RESPONSE"

# 检查是否已登录
if echo "$LOGIN_RESPONSE" | grep -q '"isLoggedIn":true\|"logged_in":true\|"status":"logged_in"'; then
    echo ""
    echo "${GREEN}✅ 用户已登录，可以进行发布测试${NC}"
else
    echo ""
    echo "${YELLOW}⚠️  用户未登录，发布测试可能失败${NC}"
    echo "${YELLOW}请先执行登录流程:${NC}"
    echo "  curl $MCP_ROUTER_BASE_URL/api/xiaohongshu/login/qrcode?userId=$TEST_USER_ID"
fi
echo ""

# 测试 2: 测试简单发布（无图片）
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "${BLUE}2️⃣  测试简单发布（无图片）${NC}"
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "调用: $MCP_ROUTER_BASE_URL/api/xiaohongshu/publish"
echo ""

PUBLISH_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "$MCP_ROUTER_BASE_URL/api/xiaohongshu/publish" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"$TEST_USER_ID\",
    \"title\": \"测试标题 - $(date +%H:%M:%S)\",
    \"content\": \"这是一条自动化测试内容\\n\\n发布时间: $(date '+%Y-%m-%d %H:%M:%S')\\n#自动化测试 #系统测试\",
    \"images\": [],
    \"tags\": [\"测试\", \"自动化\"],
    \"privacy\": \"private\"
  }" \
  --max-time $API_TIMEOUT 2>&1)

PUBLISH_CODE=$(echo "$PUBLISH_RESPONSE" | tail -n 1)
PUBLISH_BODY=$(echo "$PUBLISH_RESPONSE" | sed '$d')

echo "HTTP 状态码: $PUBLISH_CODE"
echo "响应内容:"
echo "$PUBLISH_BODY" | python3 -m json.tool 2>/dev/null || echo "$PUBLISH_BODY"
echo ""

if [ "$PUBLISH_CODE" = "200" ]; then
    echo "${GREEN}✅ 发布测试成功！${NC}"
    
    # 提取发布ID（如果有）
    NOTE_ID=$(echo "$PUBLISH_BODY" | grep -o '"note_id":"[^"]*"\|"noteId":"[^"]*"\|"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ -n "$NOTE_ID" ]; then
        echo "${BLUE}发布ID: $NOTE_ID${NC}"
    fi
    EXIT_CODE=0
else
    echo "${RED}❌ 发布测试失败${NC}"
    echo ""
    echo "${YELLOW}💡 常见错误原因:${NC}"
    echo "  1. 用户未登录 - 需要先扫码登录"
    echo "  2. Cookie 过期 - 需要重新登录"
    echo "  3. 内容验证失败 - 检查内容格式"
    echo "  4. 网络超时 - 增加 API_TIMEOUT 参数"
    echo ""
    echo "${YELLOW}🔧 故障排查:${NC}"
    echo "  ./diagnose-mcp-router.sh"
    EXIT_CODE=1
fi
echo ""

# 测试总结
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [ $EXIT_CODE -eq 0 ]; then
    echo "${GREEN}✅ 测试完成 - 所有测试通过${NC}"
else
    echo "${RED}❌ 测试失败 - 请检查上述错误${NC}"
fi
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

exit $EXIT_CODE
