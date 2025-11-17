#!/bin/bash
# MCP Router 增强诊断脚本
# 版本: 2.0
# 用途: 全面诊断 MCP Router 服务状态，包括连接、进程、配置等

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
MCP_ROUTER_URL="${MCP_ROUTER_URL:-http://localhost:3000}"
TEST_USER_ID="${TEST_USER_ID:-test_user}"
API_TIMEOUT="${API_TIMEOUT:-10}"

echo "${BLUE}========================================${NC}"
echo "${BLUE}🔍 MCP Router 增强诊断脚本 v2.0${NC}"
echo "${BLUE}========================================${NC}"
echo ""
echo "配置信息:"
echo "  • MCP Router URL: $MCP_ROUTER_URL"
echo "  • 测试用户ID: $TEST_USER_ID"
echo "  • 超时时间: ${API_TIMEOUT}秒"
echo ""

# 诊断结果计数器
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# 记录诊断结果
log_pass() {
    echo "${GREEN}✅ $1${NC}"
    ((PASS_COUNT++))
}

log_fail() {
    echo "${RED}❌ $1${NC}"
    ((FAIL_COUNT++))
}

log_warn() {
    echo "${YELLOW}⚠️  $1${NC}"
    ((WARN_COUNT++))
}

log_info() {
    echo "${BLUE}ℹ️  $1${NC}"
}

# 1. 检查进程
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "${BLUE}1️⃣  进程状态检查${NC}"
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
MCP_PROCESSES=$(ps aux | grep -E "httpServer.js|mcp-router" | grep -v grep | wc -l)
XHS_PROCESSES=$(ps aux | grep "xiaohongshu-mcp" | grep -v grep | wc -l)

if [ "$MCP_PROCESSES" -gt 0 ]; then
    log_pass "MCP Router 进程运行中 ($MCP_PROCESSES 个)"
    ps aux | grep -E "httpServer.js|mcp-router" | grep -v grep | head -3
else
    log_fail "MCP Router 进程未运行"
fi

if [ "$XHS_PROCESSES" -gt 0 ]; then
    log_pass "xiaohongshu-mcp 进程运行中 ($XHS_PROCESSES 个)"
else
    log_warn "xiaohongshu-mcp 进程未运行（可能按需启动）"
fi
echo ""

# 2. 检查端口监听
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "${BLUE}2️⃣  端口监听检查${NC}"
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
for port in 3000 3001 8080; do
    if netstat -tlnp 2>/dev/null | grep -q ":$port " || lsof -i :$port 2>/dev/null | grep -q LISTEN; then
        log_pass "端口 $port 正在监听"
        netstat -tlnp 2>/dev/null | grep ":$port " || lsof -i :$port 2>/dev/null | grep LISTEN
    else
        if [ "$port" = "3000" ]; then
            log_fail "关键端口 $port 未监听 - MCP Router 可能未启动"
        else
            log_warn "端口 $port 未监听"
        fi
    fi
done
echo ""

# 3. 检查环境变量
echo "3️⃣ 检查环境变量："
echo "  • HTTP_PORT: ${HTTP_PORT:-未设置}"
echo "  • MCP_ROUTER_URL: ${MCP_ROUTER_URL:-未设置}"
echo "  • APP_PORT: ${APP_PORT:-未设置}"
echo ""

# 4. 检查 Chromium 符号链接
echo "4️⃣ 检查 Chromium 符号链接："
if [ -L /usr/bin/chromium ]; then
    echo "  ✅ 符号链接存在: $(ls -lh /usr/bin/chromium)"
else
    echo "  ❌ 符号链接不存在"
    echo "  🔍 查找 Playwright Chromium："
    find /root/.cache/ms-playwright -name chrome -type f 2>/dev/null | grep "chrome-linux/chrome" || echo "    ❌ 未找到"
fi
echo ""

# 5. 测试 MCP Router 健康检查（核心功能）
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "${BLUE}5️⃣  MCP Router 健康检查（关键）${NC}"
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
log_info "测试健康检查端点: $MCP_ROUTER_URL/health"
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" -m $API_TIMEOUT "$MCP_ROUTER_URL/health" 2>&1 | tail -n 1)
if [ "$HEALTH_RESPONSE" = "200" ]; then
    log_pass "健康检查通过 (HTTP 200)"
    curl -s -m $API_TIMEOUT "$MCP_ROUTER_URL/health" | python3 -m json.tool 2>/dev/null || echo "  响应: $HEALTH_RESPONSE"
else
    log_fail "健康检查失败 (HTTP $HEALTH_RESPONSE)"
    echo "  ${RED}错误详情: 无法连接到 MCP Router${NC}"
    echo "  ${YELLOW}诊断建议:${NC}"
    echo "    1. 检查 MCP Router 服务是否启动"
    echo "    2. 验证端口 3000 是否可访问"
    echo "    3. 检查防火墙设置"
fi
echo ""

# 5.1 测试统计信息端点
log_info "测试统计信息端点: $MCP_ROUTER_URL/stats"
STATS_RESPONSE=$(curl -s -w "\n%{http_code}" -m $API_TIMEOUT "$MCP_ROUTER_URL/stats" 2>&1 | tail -n 1)
if [ "$STATS_RESPONSE" = "200" ]; then
    log_pass "统计信息获取成功"
    STATS_DATA=$(curl -s -m $API_TIMEOUT "$MCP_ROUTER_URL/stats")
    echo "$STATS_DATA" | python3 -m json.tool 2>/dev/null || echo "  $STATS_DATA"
    
    # 解析进程池信息
    TOTAL_PROCESSES=$(echo "$STATS_DATA" | grep -o '"totalProcesses":[0-9]*' | cut -d':' -f2)
    ACTIVE_PROCESSES=$(echo "$STATS_DATA" | grep -o '"activeProcesses":[0-9]*' | cut -d':' -f2)
    if [ -n "$TOTAL_PROCESSES" ]; then
        log_info "进程池状态: 总计 $TOTAL_PROCESSES 个进程, 活跃 $ACTIVE_PROCESSES 个"
    fi
else
    log_fail "统计信息获取失败 (HTTP $STATS_RESPONSE)"
fi
echo ""

# 5.2 测试登录状态检查（示例业务功能）
log_info "测试登录状态检查: $MCP_ROUTER_URL/api/xiaohongshu/login/status"
LOGIN_STATUS=$(curl -s -w "\n%{http_code}" -m $API_TIMEOUT "$MCP_ROUTER_URL/api/xiaohongshu/login/status?userId=$TEST_USER_ID" 2>&1 | tail -n 1)
if [ "$LOGIN_STATUS" = "200" ]; then
    log_pass "登录状态接口可访问"
else
    log_warn "登录状态接口响应异常 (HTTP $LOGIN_STATUS) - 可能需要先启动MCP进程"
fi
echo ""

# 6. 检查日志文件
echo "6️⃣ 检查最近的日志（最后20行）："
if [ -f /tmp/mcp-router.log ]; then
    echo "  📄 /tmp/mcp-router.log:"
    tail -20 /tmp/mcp-router.log
else
    echo "  ⚠️  /tmp/mcp-router.log 不存在"
fi
echo ""

if [ -f /tmp/claude-agent.log ]; then
    echo "  📄 /tmp/claude-agent.log (最后10行):"
    tail -10 /tmp/claude-agent.log | grep -E "MCP|error|Error|ECONNREFUSED" || echo "    无相关错误"
else
    echo "  ⚠️  /tmp/claude-agent.log 不存在"
fi
echo ""

# 诊断总结
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "${BLUE}📊 诊断总结${NC}"
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "通过: ${GREEN}$PASS_COUNT${NC} | 失败: ${RED}$FAIL_COUNT${NC} | 警告: ${YELLOW}$WARN_COUNT${NC}"
echo ""

if [ "$FAIL_COUNT" -eq 0 ]; then
    echo "${GREEN}✅ 所有关键检查通过，MCP Router 运行正常！${NC}"
else
    echo "${RED}❌ 发现 $FAIL_COUNT 个问题，需要修复${NC}"
fi
echo ""

echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "${BLUE}💡 常见问题解决方案${NC}"
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "${YELLOW}问题 1: MCP Router 进程未运行${NC}"
echo "  解决: cd /data/workspace/xiaohongshumcp && ./start.sh"
echo ""
echo "${YELLOW}问题 2: 端口 3000 未监听${NC}"
echo "  解决: 检查进程是否崩溃，查看日志文件"
echo "  日志: tail -100 /tmp/mcp-router.log"
echo ""
echo "${YELLOW}问题 3: 健康检查失败${NC}"
echo "  解决步骤:"
echo "    1. 检查 MCP Router 服务状态"
echo "    2. 验证环境变量 MCP_ROUTER_URL=$MCP_ROUTER_URL"
echo "    3. 检查防火墙和网络配置"
echo "    4. 查看详细错误日志"
echo ""
echo "${YELLOW}问题 4: Chromium 符号链接不存在${NC}"
echo "  解决: 运行 Chromium 符号链接创建脚本"
echo ""
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "${BLUE}🔗 相关命令${NC}"
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "  • 启动服务: ./start.sh"
echo "  • 查看日志: tail -f /tmp/mcp-router.log"
echo "  • 测试健康检查: curl $MCP_ROUTER_URL/health"
echo "  • 测试统计信息: curl $MCP_ROUTER_URL/stats"
echo "  • 停止所有进程: pkill -f 'httpServer.js|xiaohongshu-mcp'"
echo ""
echo "${GREEN}✅ 诊断完成 - $(date)${NC}"
echo ""
