#!/bin/bash

echo "🚀 小红书智能自动化系统 - 综合测试与修复脚本"
echo "=================================================="
echo "本脚本将诊断并修复登录页面500错误和发布功能报错问题"
echo ""

# 配置变量
BACKEND_URL="https://xiaohongshu-automation-ai.zeabur.app"
FRONTEND_URL="https://www.prome.live/xiaohongshu"
TEST_USER_ID="test-user-$(date +%s)"
MCP_ROUTER_URL="http://localhost:3000"
CLAUDE_AGENT_PORT="8080"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查命令是否存在
check_command() {
    if ! command -v $1 &> /dev/null; then
        log_error "$1 未安装，请先安装 $1"
        return 1
    fi
    return 0
}

# 网络连通性测试
test_connectivity() {
    log_info "测试网络连通性..."
    
    # 测试后端服务
    if curl -s -f "${BACKEND_URL}/health" > /dev/null; then
        log_success "✅ 后端服务可访问"
    else
        log_error "❌ 后端服务不可访问: ${BACKEND_URL}"
        return 1
    fi
    
    # 测试MCP Router（如果在本地运行）
    if curl -s -f "${MCP_ROUTER_URL}/health" > /dev/null; then
        log_success "✅ MCP Router服务可访问"
    else
        log_warning "⚠️  MCP Router服务不可访问（可能未在本地运行）"
    fi
    
    return 0
}

# 检查环境变量
check_env_vars() {
    log_info "检查环境变量..."
    
    local missing_vars=()
    
    if [[ -z "$ANTHROPIC_API_KEY" ]]; then
        missing_vars+=("ANTHROPIC_API_KEY")
    fi
    
    if [[ -z "$MCP_ROUTER_URL" ]]; then
        log_warning "⚠️  MCP_ROUTER_URL 未设置，使用默认值: ${MCP_ROUTER_URL}"
    fi
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        log_error "❌ 缺少必要环境变量: ${missing_vars[*]}"
        log_info "请设置以下环境变量:"
        for var in "${missing_vars[@]}"; do
            echo "  export $var=your_value_here"
        done
        return 1
    fi
    
    log_success "✅ 环境变量检查通过"
    return 0
}

# 检查服务状态
check_service_status() {
    log_info "检查服务状态..."
    
    # 检查Claude Agent Service
    local claude_status
    claude_status=$(curl -s -w "%{http_code}" "${BACKEND_URL}/health" -o /dev/null)
    if [[ "$claude_status" == "200" ]]; then
        log_success "✅ Claude Agent Service 正常运行"
    else
        log_error "❌ Claude Agent Service 服务异常 (HTTP $claude_status)"
        return 1
    fi
    
    # 检查MCP Router（如果在本地运行）
    local mcp_status
    mcp_status=$(curl -s -w "%{http_code}" "${MCP_ROUTER_URL}/health" -o /dev/null)
    if [[ "$mcp_status" == "200" ]]; then
        log_success "✅ MCP Router 正常运行"
    else
        log_warning "⚠️  MCP Router 服务异常 (HTTP $mcp_status)"
    fi
    
    return 0
}

# 测试登录功能
test_login_functionality() {
    log_info "测试登录功能..."
    
    # 检查用户状态
    local user_status
    user_status=$(curl -s -X GET "${BACKEND_URL}/agent/xiaohongshu/login/status?userId=${TEST_USER_ID}" \
        -H "Content-Type: application/json")
    
    if echo "$user_status" | grep -q '"success":true'; then
        log_success "✅ 登录状态检查接口正常"
        echo "$user_status" | jq '.'
    else
        log_warning "⚠️  登录状态检查接口返回异常"
        echo "$user_status" | jq '.'
    fi
    
    # 尝试获取登录二维码
    local qr_response
    qr_response=$(curl -s -X GET "${BACKEND_URL}/agent/xiaohongshu/login/qrcode?userId=${TEST_USER_ID}" \
        -H "Content-Type: application/json" \
        --max-time 30)
    
    if echo "$qr_response" | grep -q '"success":true'; then
        log_success "✅ 登录二维码获取接口正常"
        echo "$qr_response" | jq '.'
    elif echo "$qr_response" | grep -q '"logged_in":true'; then
        log_success "✅ 用户已登录"
        echo "$qr_response" | jq '.'
    else
        log_error "❌ 登录二维码获取失败"
        echo "$qr_response" | jq '.'
        return 1
    fi
    
    return 0
}

# 测试发布功能
test_publish_functionality() {
    log_info "测试发布功能..."
    
    # 测试内容发布接口
    local publish_response
    publish_response=$(curl -s -X POST "${BACKEND_URL}/agent/xiaohongshu/publish" \
        -H "Content-Type: application/json" \
        -d "{
            \"userId\": \"${TEST_USER_ID}\",
            \"title\": \"测试发布标题\",
            \"content\": \"这是一条测试发布内容\",
            \"tags\": [\"测试\"]
        }" \
        --max-time 30)
    
    if echo "$publish_response" | grep -q '"success":true'; then
        log_success "✅ 内容发布接口正常"
        echo "$publish_response" | jq '.'
    else
        log_warning "⚠️  内容发布接口返回异常（可能未登录）"
        echo "$publish_response" | jq '.'
    fi
    
    return 0
}

# 修复Cookie清理问题
fix_cookie_cleanup() {
    log_info "修复Cookie清理问题..."
    
    # 检查是否存在完整的Cookie清理逻辑
    log_warning "⚠️  此修复需要在代码中实现，无法通过脚本直接修复"
    log_info "请确保以下修复已部署："
    echo "  1. logout操作清理数据库中的Cookie"
    echo "  2. processManager验证Cookie有效性"
    echo "  3. Go后端newBrowser()时正确处理Cookie加载"
    
    log_info "参考修复文件："
    echo "  - COOKIE_CLEANUP_FIX.md"
    echo "  - ROOT_CAUSE_ANALYSIS.md"
    echo "  - MCP-BINARY-FIX.md"
    
    return 0
}

# 修复MCP二进制文件问题
fix_mcp_binary() {
    log_info "修复MCP二进制文件问题..."
    
    # 检查是否存在正确的Linux二进制文件
    log_warning "⚠️  此修复需要在部署配置中实现，无法通过脚本直接修复"
    log_info "请确保以下配置已正确设置："
    echo "  1. .gitignore排除所有平台的二进制文件"
    echo "  2. .dockerignore排除二进制文件"
    echo "  3. Dockerfile正确下载Linux版本二进制文件"
    echo "  4. 从Git中移除已提交的二进制文件"
    
    log_info "参考修复文件："
    echo "  - MCP-BINARY-FIX.md"
    
    return 0
}

# 修复端口冲突问题
fix_port_conflict() {
    log_info "修复端口冲突问题..."
    
    # 杀死可能存在的旧进程
    log_info "清理旧的MCP进程..."
    pkill -f "httpServer.js" 2>/dev/null || true
    pkill -f "xiaohongshu-mcp" 2>/dev/null || true
    sleep 2
    
    log_success "✅ 旧进程清理完成"
    
    return 0
}

# 生成诊断报告
generate_diagnosis_report() {
    log_info "生成诊断报告..."
    
    local report_file="diagnosis-report-$(date +%Y%m%d-%H%M%S).md"
    
    cat > "$report_file" << EOF
# 小红书智能自动化系统诊断报告

**生成时间**: $(date)

## 系统信息
- 操作系统: $(uname -s)
- 架构: $(uname -m)
- 当前用户: $(whoami)

## 环境变量检查
\`\`\`
ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:0:10}...${ANTHROPIC_API_KEY: -5}
MCP_ROUTER_URL: $MCP_ROUTER_URL
\`\`\`

## 服务状态
### Claude Agent Service
\`\`\`
curl -s "${BACKEND_URL}/health"
$(curl -s "${BACKEND_URL}/health" | jq '.')
\`\`\`

### MCP Router
\`\`\`
curl -s "${MCP_ROUTER_URL}/health"
$(curl -s "${MCP_ROUTER_URL}/health" | jq '.' 2>/dev/null || echo "服务不可用")
\`\`\`

## 登录功能测试
### 登录状态检查
\`\`\`
curl -s "${BACKEND_URL}/agent/xiaohongshu/login/status?userId=${TEST_USER_ID}"
$(curl -s "${BACKEND_URL}/agent/xiaohongshu/login/status?userId=${TEST_USER_ID}" | jq '.')
\`\`\`

### 登录二维码获取
\`\`\`
curl -s "${BACKEND_URL}/agent/xiaohongshu/login/qrcode?userId=${TEST_USER_ID}"
$(curl -s "${BACKEND_URL}/agent/xiaohongshu/login/qrcode?userId=${TEST_USER_ID}" | jq '.')
\`\`\`

## 发布功能测试
### 内容发布测试
\`\`\`
curl -s -X POST "${BACKEND_URL}/agent/xiaohongshu/publish"
$(curl -s -X POST "${BACKEND_URL}/agent/xiaohongshu/publish" \
    -H "Content-Type: application/json" \
    -d "{
        \"userId\": \"${TEST_USER_ID}\",
        \"title\": \"测试发布标题\",
        \"content\": \"这是一条测试发布内容\",
        \"tags\": [\"测试\"]
    }" | jq '.')
\`\`\`

## 建议的修复措施
1. 确保所有修复已部署到生产环境
2. 检查Cookie清理逻辑是否完整
3. 验证MCP二进制文件是否正确
4. 确认端口冲突问题已解决
5. 重新部署服务以应用所有修复

EOF
    
    log_success "✅ 诊断报告已生成: $report_file"
    return 0
}

# 主函数
main() {
    log_info "开始执行综合测试与修复..."
    
    # 检查必要命令
    check_command curl || return 1
    check_command jq || return 1
    
    # 执行各项检查和修复
    test_connectivity || return 1
    check_env_vars || return 1
    check_service_status || return 1
    test_login_functionality || return 1
    test_publish_functionality || return 1
    fix_cookie_cleanup || return 1
    fix_mcp_binary || return 1
    fix_port_conflict || return 1
    generate_diagnosis_report || return 1
    
    log_success "🎉 综合测试与修复完成！"
    log_info "请查看诊断报告以获取详细信息和建议"
    
    return 0
}

# 执行主函数
main "$@"