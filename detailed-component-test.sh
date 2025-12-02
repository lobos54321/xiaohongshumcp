#!/bin/bash

echo "🔍 小红书智能自动化系统 - 详细组件测试脚本"
echo "=================================================="
echo "本脚本将逐个测试系统的核心组件"
echo ""

# 配置变量
BACKEND_URL="https://xiaohongshu-automation-ai.zeabur.app"
TEST_USER_ID="component-test-$(date +%s)"
MCP_ROUTER_URL="http://localhost:3000"

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

# 测试函数
test_api_endpoint() {
    local url=$1
    local method=${2:-GET}
    local data=$3
    local name=$4
    
    log_info "测试 $name..."
    
    local response
    local http_code
    
    if [[ "$method" == "GET" ]]; then
        response=$(curl -s -w "%{http_code}" "$url" -o /tmp/response.txt)
        http_code=$response
        response=$(cat /tmp/response.txt)
    else
        if [[ -n "$data" ]]; then
            response=$(curl -s -w "%{http_code}" -X "$method" "$url" \
                -H "Content-Type: application/json" \
                -d "$data" -o /tmp/response.txt)
        else
            response=$(curl -s -w "%{http_code}" -X "$method" "$url" \
                -H "Content-Type: application/json" -o /tmp/response.txt)
        fi
        http_code=$(tail -c 3 /tmp/response.txt)
        response=$(head -c -3 /tmp/response.txt)
    fi
    
    if [[ "$http_code" == "200" ]]; then
        log_success "✅ $name 测试通过 (HTTP $http_code)"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
        return 0
    else
        log_error "❌ $name 测试失败 (HTTP $http_code)"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
        return 1
    fi
}

# 测试健康检查端点
test_health_endpoints() {
    log_info "=== 测试健康检查端点 ==="
    
    test_api_endpoint "${BACKEND_URL}/health" "GET" "" "Claude Agent Service 健康检查"
    test_api_endpoint "${MCP_ROUTER_URL}/health" "GET" "" "MCP Router 健康检查" 2>/dev/null || \
        log_warning "MCP Router 健康检查失败（可能未在本地运行）"
}

# 测试用户管理端点
test_user_management_endpoints() {
    log_info "=== 测试用户管理端点 ==="
    
    # 初始化用户
    test_api_endpoint "${BACKEND_URL}/api/user/initialize" "POST" \
        "{\"userId\":\"${TEST_USER_ID}\"}" "用户初始化"
    
    # 获取用户状态
    test_api_endpoint "${BACKEND_URL}/api/user/status/${TEST_USER_ID}" "GET" "" "用户状态查询"
}

# 测试登录相关端点
test_login_endpoints() {
    log_info "=== 测试登录相关端点 ==="
    
    # 检查登录状态
    test_api_endpoint "${BACKEND_URL}/agent/xiaohongshu/login/status?userId=${TEST_USER_ID}" \
        "GET" "" "登录状态检查"
    
    # 获取登录二维码
    test_api_endpoint "${BACKEND_URL}/agent/xiaohongshu/login/qrcode?userId=${TEST_USER_ID}" \
        "GET" "" "登录二维码获取"
}

# 测试内容相关端点
test_content_endpoints() {
    log_info "=== 测试内容相关端点 ==="
    
    # 智能对话
    test_api_endpoint "${BACKEND_URL}/agent/chat" "POST" \
        "{\"userId\":\"${TEST_USER_ID}\",\"message\":\"你好\"}" "智能对话"
    
    # 内容创作
    test_api_endpoint "${BACKEND_URL}/agent/xiaohongshu/create-post" "POST" \
        "{\"userId\":\"${TEST_USER_ID}\",\"topic\":\"测试主题\"}" "内容创作"
    
    # 内容研究
    test_api_endpoint "${BACKEND_URL}/agent/xiaohongshu/research" "POST" \
        "{\"userId\":\"${TEST_USER_ID}\",\"keyword\":\"测试\"}" "内容研究"
}

# 测试自动运营端点
test_auto_operation_endpoints() {
    log_info "=== 测试自动运营端点 ==="
    
    # 启动自动运营
    test_api_endpoint "${BACKEND_URL}/agent/auto/start" "POST" \
        "{\"userId\":\"${TEST_USER_ID}\"}" "启动自动运营"
    
    # 获取AI策略
    test_api_endpoint "${BACKEND_URL}/agent/auto/strategy/${TEST_USER_ID}" "GET" "" "获取AI策略"
    
    # 获取今日计划
    test_api_endpoint "${BACKEND_URL}/agent/auto/plan/${TEST_USER_ID}" "GET" "" "获取今日计划"
    
    # 获取运营数据
    test_api_endpoint "${BACKEND_URL}/agent/auto/stats/${TEST_USER_ID}" "GET" "" "获取运营数据"
}

# 测试图片相关端点
test_image_endpoints() {
    log_info "=== 测试图片相关端点 ==="
    
    # 生成图片
    test_api_endpoint "${BACKEND_URL}/agent/image/generate" "POST" \
        "{\"userId\":\"${TEST_USER_ID}\",\"prompt\":\"测试图片\"}" "生成图片"
    
    # 智能登录检测
    test_api_endpoint "${BACKEND_URL}/agent/xiaohongshu/auto-login" "POST" \
        "{\"userId\":\"${TEST_USER_ID}\"}" "智能登录检测"
}

# 测试MCP Router工具调用
test_mcp_router_tools() {
    log_info "=== 测试MCP Router工具调用 ==="
    
    # 检查登录状态工具
    test_api_endpoint "${MCP_ROUTER_URL}/mcp/call" "POST" \
        "{\"userId\":\"${TEST_USER_ID}\",\"toolName\":\"xiaohongshu_check_login\",\"arguments\":{}}" \
        "MCP工具 - 检查登录状态" 2>/dev/null || \
        log_warning "MCP工具调用失败（可能未在本地运行）"
    
    # 获取登录二维码工具
    test_api_endpoint "${MCP_ROUTER_URL}/mcp/call" "POST" \
        "{\"userId\":\"${TEST_USER_ID}\",\"toolName\":\"xiaohongshu_get_login_qrcode\",\"arguments\":{}}" \
        "MCP工具 - 获取登录二维码" 2>/dev/null || \
        log_warning "MCP工具调用失败（可能未在本地运行）"
}

# 测试发布功能
test_publish_functionality() {
    log_info "=== 测试发布功能 ==="
    
    # 图文发布
    test_api_endpoint "${BACKEND_URL}/agent/xiaohongshu/publish" "POST" \
        "{\"userId\":\"${TEST_USER_ID}\",\"title\":\"测试标题\",\"content\":\"测试内容\",\"tags\":[\"测试\"]}" \
        "图文发布"
    
    # 视频发布
    test_api_endpoint "${BACKEND_URL}/agent/xiaohongshu/publish-video" "POST" \
        "{\"userId\":\"${TEST_USER_ID}\",\"title\":\"测试视频标题\",\"content\":\"测试视频内容\",\"video\":\"/path/to/video.mp4\",\"tags\":[\"测试\"]}" \
        "视频发布"
    
    # 批量发布
    test_api_endpoint "${BACKEND_URL}/agent/xiaohongshu/batch-publish" "POST" \
        "{\"userId\":\"${TEST_USER_ID}\",\"posts\":[{\"title\":\"批量测试1\",\"content\":\"内容1\"},{\"title\":\"批量测试2\",\"content\":\"内容2\"}]}" \
        "批量发布"
}

# 测试小红书MCP功能
test_xiaohongshu_mcp_features() {
    log_info "=== 测试小红书MCP功能 ==="
    
    # 获取推荐内容
    test_api_endpoint "${BACKEND_URL}/agent/xiaohongshu/list-feeds" "POST" \
        "{\"userId\":\"${TEST_USER_ID}\"}" "获取推荐内容"
    
    # 搜索内容
    test_api_endpoint "${BACKEND_URL}/agent/xiaohongshu/search" "POST" \
        "{\"userId\":\"${TEST_USER_ID}\",\"keyword\":\"测试\"}" "搜索内容"
    
    # 获取内容详情
    test_api_endpoint "${BACKEND_URL}/agent/xiaohongshu/feed-detail" "POST" \
        "{\"userId\":\"${TEST_USER_ID}\",\"feedId\":\"test_feed_id\"}" "获取内容详情"
    
    # 点赞内容
    test_api_endpoint "${BACKEND_URL}/agent/xiaohongshu/like" "POST" \
        "{\"userId\":\"${TEST_USER_ID}\",\"feedId\":\"test_feed_id\"}" "点赞内容"
    
    # 收藏内容
    test_api_endpoint "${BACKEND_URL}/agent/xiaohongshu/favorite" "POST" \
        "{\"userId\":\"${TEST_USER_ID}\",\"feedId\":\"test_feed_id\"}" "收藏内容"
    
    # 发布评论
    test_api_endpoint "${BACKEND_URL}/agent/xiaohongshu/comment" "POST" \
        "{\"userId\":\"${TEST_USER_ID}\",\"feedId\":\"test_feed_id\",\"content\":\"测试评论\"}" "发布评论"
    
    # 获取用户资料
    test_api_endpoint "${BACKEND_URL}/agent/xiaohongshu/user-profile" "POST" \
        "{\"userId\":\"${TEST_USER_ID}\",\"targetUserId\":\"test_user_id\"}" "获取用户资料"
}

# 生成详细测试报告
generate_detailed_report() {
    log_info "生成详细测试报告..."
    
    local report_file="detailed-test-report-$(date +%Y%m%d-%H%M%S).md"
    
    cat > "$report_file" << EOF
# 小红书智能自动化系统详细测试报告

**生成时间**: $(date)

## 测试概述
本报告详细记录了小红书智能自动化系统的各个组件测试结果，包括健康检查、用户管理、登录功能、内容管理、自动运营、图片处理、MCP工具调用、发布功能和小红书MCP功能等模块。

## 测试环境
- 测试用户ID: ${TEST_USER_ID}
- 后端服务URL: ${BACKEND_URL}
- MCP Router URL: ${MCP_ROUTER_URL}

## 测试结果汇总

### 健康检查端点
\`\`\`
curl -s "${BACKEND_URL}/health"
$(curl -s "${BACKEND_URL}/health" | jq '.' 2>/dev/null || echo "测试失败")
\`\`\`

### 用户管理端点
\`\`\`
curl -s -X POST "${BACKEND_URL}/api/user/initialize" -H "Content-Type: application/json" -d "{\"userId\":\"${TEST_USER_ID}\"}"
$(curl -s -X POST "${BACKEND_URL}/api/user/initialize" -H "Content-Type: application/json" -d "{\"userId\":\"${TEST_USER_ID}\"}" | jq '.' 2>/dev/null || echo "测试失败")
\`\`\`

### 登录相关端点
\`\`\`
curl -s "${BACKEND_URL}/agent/xiaohongshu/login/status?userId=${TEST_USER_ID}"
$(curl -s "${BACKEND_URL}/agent/xiaohongshu/login/status?userId=${TEST_USER_ID}" | jq '.' 2>/dev/null || echo "测试失败")
\`\`\`

### 内容相关端点
\`\`\`
curl -s -X POST "${BACKEND_URL}/agent/chat" -H "Content-Type: application/json" -d "{\"userId\":\"${TEST_USER_ID}\",\"message\":\"你好\"}"
$(curl -s -X POST "${BACKEND_URL}/agent/chat" -H "Content-Type: application/json" -d "{\"userId\":\"${TEST_USER_ID}\",\"message\":\"你好\"}" | jq '.' 2>/dev/null || echo "测试失败")
\`\`\`

### 自动运营端点
\`\`\`
curl -s -X POST "${BACKEND_URL}/agent/auto/start" -H "Content-Type: application/json" -d "{\"userId\":\"${TEST_USER_ID}\"}"
$(curl -s -X POST "${BACKEND_URL}/agent/auto/start" -H "Content-Type: application/json" -d "{\"userId\":\"${TEST_USER_ID}\"}" | jq '.' 2>/dev/null || echo "测试失败")
\`\`\`

### 图片相关端点
\`\`\`
curl -s -X POST "${BACKEND_URL}/agent/image/generate" -H "Content-Type: application/json" -d "{\"userId\":\"${TEST_USER_ID}\",\"prompt\":\"测试图片\"}"
$(curl -s -X POST "${BACKEND_URL}/agent/image/generate" -H "Content-Type: application/json" -d "{\"userId\":\"${TEST_USER_ID}\",\"prompt\":\"测试图片\"}" | jq '.' 2>/dev/null || echo "测试失败")
\`\`\`

### 发布功能
\`\`\`
curl -s -X POST "${BACKEND_URL}/agent/xiaohongshu/publish" -H "Content-Type: application/json" -d "{\"userId\":\"${TEST_USER_ID}\",\"title\":\"测试标题\",\"content\":\"测试内容\",\"tags\":[\"测试\"]}"
$(curl -s -X POST "${BACKEND_URL}/agent/xiaohongshu/publish" -H "Content-Type: application/json" -d "{\"userId\":\"${TEST_USER_ID}\",\"title\":\"测试标题\",\"content\":\"测试内容\",\"tags\":[\"测试\"]}" | jq '.' 2>/dev/null || echo "测试失败")
\`\`\`

### 小红书MCP功能
\`\`\`
curl -s -X POST "${BACKEND_URL}/agent/xiaohongshu/list-feeds" -H "Content-Type: application/json" -d "{\"userId\":\"${TEST_USER_ID}\"}"
$(curl -s -X POST "${BACKEND_URL}/agent/xiaohongshu/list-feeds" -H "Content-Type: application/json" -d "{\"userId\":\"${TEST_USER_ID}\"}" | jq '.' 2>/dev/null || echo "测试失败")
\`\`\`

## 问题分析与建议

### 常见问题
1. **500错误**: 通常是由于MCP二进制文件问题、端口冲突或Cookie清理不完整导致
2. **发布功能报错**: 可能是用户未正确登录、Cookie失效或网络连接问题
3. **登录页面异常**: 可能是自动登录检测逻辑问题或Cookie管理机制缺陷

### 修复建议
1. 确保MCP二进制文件正确（Linux版本，非macOS版本）
2. 完善Cookie清理逻辑，包括文件系统和数据库中的Cookie
3. 验证端口分配机制，避免端口冲突
4. 检查自动登录检测逻辑，确保正确识别登录状态
5. 部署所有已修复的代码到生产环境

## 结论
本测试报告提供了系统各组件的详细测试结果。根据测试结果，可以定位具体问题并采取相应的修复措施。

EOF
    
    log_success "✅ 详细测试报告已生成: $report_file"
}

# 主函数
main() {
    log_info "开始执行详细组件测试..."
    
    # 检查必要命令
    if ! command -v curl &> /dev/null || ! command -v jq &> /dev/null; then
        log_error "缺少必要命令: curl 或 jq"
        log_info "请安装 curl 和 jq:"
        echo "  Ubuntu/Debian: sudo apt-get install curl jq"
        echo "  CentOS/RHEL: sudo yum install curl jq"
        echo "  macOS: brew install curl jq"
        return 1
    fi
    
    # 执行各项测试
    test_health_endpoints
    test_user_management_endpoints
    test_login_endpoints
    test_content_endpoints
    test_auto_operation_endpoints
    test_image_endpoints
    test_mcp_router_tools
    test_publish_functionality
    test_xiaohongshu_mcp_features
    generate_detailed_report
    
    log_success "🎉 详细组件测试完成！"
    log_info "请查看详细测试报告以获取完整的测试结果和分析"
    
    return 0
}

# 执行主函数
main "$@"