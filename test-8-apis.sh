#!/bin/bash
# 小红书 MCP 系统 8 大核心功能测试脚本
# 版本: 2.0 - 修复端口和API路径配置错误
# 更新日期: 2025-01-15

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ====================
# 配置区域
# ====================
MCP_ROUTER_BASE_URL="${MCP_ROUTER_URL:-http://localhost:3000}"
TEST_USER_ID="${TEST_USER_ID:-test_user}"
API_TIMEOUT="${API_TIMEOUT:-30}"

echo "${BLUE}========================================${NC}"
echo "${BLUE}🎯 小红书MCP系统8大核心功能测试${NC}"
echo "${BLUE}========================================${NC}"
echo ""
echo "配置信息:"
echo "  • MCP Router URL: $MCP_ROUTER_BASE_URL"
echo "  • 测试用户ID: $TEST_USER_ID"
echo "  • 超时时间: ${API_TIMEOUT}秒"
echo ""
echo "${YELLOW}重要：所有API调用通过 MCP Router (:3000) 统一入口${NC}"
echo ""

# 测试结果计数器
PASS_COUNT=0
FAIL_COUNT=0

# ====================
# 工具函数
# ====================
log_test() {
    echo "${BLUE}$1${NC}"
}

log_pass() {
    echo "${GREEN}✅ $1${NC}"
    ((PASS_COUNT++))
}

log_fail() {
    echo "${RED}❌ $1${NC}"
    ((FAIL_COUNT++))
}

# 通用API调用函数
call_mcp_tool() {
    local tool_name=$1
    local arguments=$2
    local description=$3
    
    log_test "$description"
    
    local response=$(curl -s -w "\n%{http_code}" \
        -X POST "$MCP_ROUTER_BASE_URL/mcp/call" \
        -H "Content-Type: application/json" \
        -d "{\"userId\":\"$TEST_USER_ID\",\"toolName\":\"$tool_name\",\"arguments\":$arguments}" \
        --max-time $API_TIMEOUT 2>&1)
    
    local http_code=$(echo "$response" | tail -n 1)
    local body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        log_pass "测试通过 (HTTP 200)"
        echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body"
    else
        log_fail "测试失败 (HTTP $http_code)"
        echo "  响应: $body"
    fi
    echo ""
}

# ====================
# 前置检查
# ====================
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

# ====================
# 8大核心API测试
# ====================
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "${BLUE}📦 开始执行8大核心功能测试${NC}"
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# 1. 登录状态检查
echo "${BLUE}1️⃣  测试登录管理 (check_login_status)${NC}"
log_test "调用: $MCP_ROUTER_BASE_URL/api/xiaohongshu/login/status"
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" \
    "$MCP_ROUTER_BASE_URL/api/xiaohongshu/login/status?userId=$TEST_USER_ID" \
    --max-time $API_TIMEOUT 2>&1)
LOGIN_CODE=$(echo "$LOGIN_RESPONSE" | tail -n 1)
LOGIN_BODY=$(echo "$LOGIN_RESPONSE" | sed '$d')

if [ "$LOGIN_CODE" = "200" ]; then
    log_pass "登录状态检查成功"
    echo "$LOGIN_BODY" | python3 -m json.tool 2>/dev/null || echo "$LOGIN_BODY"
else
    log_fail "登录状态检查失败 (HTTP $LOGIN_CODE)"
    echo "  响应: $LOGIN_BODY"
fi
echo ""

# 2. 推荐获取
call_mcp_tool "xiaohongshu_list_feeds" '{"limit":3}' "2️⃣  测试推荐获取 (list_feeds)"

# 3. 内容搜索
call_mcp_tool "xiaohongshu_search_feeds" '{"keyword":"美食","limit":3}' "3️⃣  测试内容搜索 (search_feeds)"

# 4. 详情获取
call_mcp_tool "xiaohongshu_get_feed_detail" '{"feed_id":"example_id"}' "4️⃣  测试详情获取 (get_feed_detail)"

# 5. 用户主页
call_mcp_tool "xiaohongshu_user_profile" '{"user_id":"example_user"}' "5️⃣  测试用户主页 (user_profile)"

# 6. 图文发布
echo "${BLUE}6️⃣  测试图文发布 (publish_content)${NC}"
log_test "调用: $MCP_ROUTER_BASE_URL/api/xiaohongshu/publish"
PUBLISH_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "$MCP_ROUTER_BASE_URL/api/xiaohongshu/publish" \
    -H "Content-Type: application/json" \
    -d "{\"userId\":\"$TEST_USER_ID\",\"content\":"测试发布内容 #测试\",\"images\":[],\"privacy\":\"private\"}" \
    --max-time $API_TIMEOUT 2>&1)
PUBLISH_CODE=$(echo "$PUBLISH_RESPONSE" | tail -n 1)
PUBLISH_BODY=$(echo "$PUBLISH_RESPONSE" | sed '$d')

if [ "$PUBLISH_CODE" = "200" ]; then
    log_pass "图文发布成功"
    echo "$PUBLISH_BODY" | python3 -m json.tool 2>/dev/null || echo "$PUBLISH_BODY"
else
    log_fail "图文发布失败 (HTTP $PUBLISH_CODE)"
    echo "  响应: $PUBLISH_BODY"
fi
echo ""

# 7. 视频发布
call_mcp_tool "xiaohongshu_publish_video" '{"content":"测试视频发布 #视频测试","video_path":"/path/to/test/video.mp4","privacy":"private"}' "7️⃣  测试视频发布 (publish_with_video)"

# 8. 评论发布
call_mcp_tool "xiaohongshu_post_comment" '{"feed_id":"example_feed_id","content":"这是一条测试评论","reply_to":null}' "8️⃣  测试评论发布 (post_comment_to_feed)"

# ====================
# 测试总结
# ====================
echo ""
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "${BLUE}🎯 测试总结${NC}"
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "通过: ${GREEN}$PASS_COUNT${NC}/8 | 失败: ${RED}$FAIL_COUNT${NC}/8"
echo ""

if [ "$FAIL_COUNT" -eq 0 ]; then
    echo "${GREEN}✅ 所有测试通过！${NC}"
    exit 0
else
    echo "${RED}❌ 有 $FAIL_COUNT 个测试失败${NC}"
    echo ""
    echo "${YELLOW}💡 故障排查建议:${NC}"
    echo "  1. 检查 MCP Router 服务状态: ./diagnose-mcp-router.sh"
    echo "  2. 确认用户已登录: curl $MCP_ROUTER_BASE_URL/api/xiaohongshu/login/status?userId=$TEST_USER_ID"
    echo "  3. 查看详细日志: tail -100 /tmp/mcp-router.log"
    echo "  4. 检查网络连接: curl -v $MCP_ROUTER_BASE_URL/health"
    exit 1
fi