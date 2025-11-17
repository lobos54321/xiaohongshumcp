#!/bin/bash
# 端到端测试 - 第三层：核心功能测试（基础版）

set -e

# 配置
BASE_URL="https://xiaohongshu-automation-ai.zeabur.app"
REPORT_DIR="e2e-test-reports"
TIMESTAMP=$(date +%s)
TEST_USER="e2e-test-${TIMESTAMP}-$(head -c 8 /dev/urandom | base64 | tr -dc 'a-z0-9' | head -c 6)"
REPORT_FILE="${REPORT_DIR}/core-functions-test-${TIMESTAMP}.txt"

mkdir -p ${REPORT_DIR}

echo "================================" | tee ${REPORT_FILE}
echo "  核心功能测试" | tee -a ${REPORT_FILE}
echo "  测试时间: $(date)" | tee -a ${REPORT_FILE}
echo "  测试用户: ${TEST_USER}" | tee -a ${REPORT_FILE}
echo "================================" | tee -a ${REPORT_FILE}
echo "" | tee -a ${REPORT_FILE}

PASS_COUNT=0
FAIL_COUNT=0

# 测试函数
test_api() {
    local test_name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    
    echo "测试: ${test_name}" | tee -a ${REPORT_FILE}
    echo "----------------------------------------" | tee -a ${REPORT_FILE}
    
    if [ "$method" = "GET" ]; then
        RESPONSE=$(curl -s -w "\n%{http_code}" "${BASE_URL}${endpoint}")
    else
        RESPONSE=$(curl -s -w "\n%{http_code}" -X "$method" "${BASE_URL}${endpoint}" \
            -H "Content-Type: application/json" \
            -d "$data")
    fi
    
    STATUS=$(echo "$RESPONSE" | tail -n 1)
    BODY=$(echo "$RESPONSE" | head -n -1)
    
    echo "状态码: ${STATUS}" | tee -a ${REPORT_FILE}
    echo "响应: ${BODY:0:300}" | tee -a ${REPORT_FILE}
    echo "" | tee -a ${REPORT_FILE}
    
    if [ "$STATUS" = "200" ]; then
        echo "  ✅ PASS" | tee -a ${REPORT_FILE}
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  ❌ FAIL" | tee -a ${REPORT_FILE}
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
    echo "" | tee -a ${REPORT_FILE}
}

# 先初始化用户
echo "准备：初始化测试用户..." | tee -a ${REPORT_FILE}
curl -s -X POST "${BASE_URL}/api/user/initialize" \
    -H "Content-Type: application/json" \
    -d "{\"userId\": \"${TEST_USER}\"}" > /dev/null
echo "" | tee -a ${REPORT_FILE}

# 测试用例3.1：智能对话（简单）
echo "测试用例 3.1: 智能对话（无工具调用）" | tee -a ${REPORT_FILE}
echo "========================================" | tee -a ${REPORT_FILE}

CHAT_DATA="{\"userId\": \"${TEST_USER}\", \"prompt\": \"你好，请简单介绍一下你能帮我做什么？\", \"systemPrompt\": \"你是一个小红书运营助手，请简洁回答。\"}"

test_api "AI简单对话" "POST" "/agent/chat" "$CHAT_DATA"

# 测试用例3.5：获取登录状态（使用正确的API端点）
echo "测试用例 3.5: 登录状态检查API" | tee -a ${REPORT_FILE}
echo "========================================" | tee -a ${REPORT_FILE}

test_api "登录状态检查" "GET" "/api/xiaohongshu/login/status?userId=${TEST_USER}" ""

# 汇总报告
echo "================================" | tee -a ${REPORT_FILE}
echo "  测试结果汇总" | tee -a ${REPORT_FILE}
echo "================================" | tee -a ${REPORT_FILE}
echo "" | tee -a ${REPORT_FILE}
echo "测试用户ID: ${TEST_USER}" | tee -a ${REPORT_FILE}
echo "通过测试: ${PASS_COUNT}" | tee -a ${REPORT_FILE}
echo "失败测试: ${FAIL_COUNT}" | tee -a ${REPORT_FILE}
echo "" | tee -a ${REPORT_FILE}

if [ ${FAIL_COUNT} -eq 0 ]; then
    echo "  ✅ 核心功能测试通过！" | tee -a ${REPORT_FILE}
    echo "" | tee -a ${REPORT_FILE}
    echo "📝 备注：部分功能需要登录状态才能完整测试。" | tee -a ${REPORT_FILE}
    exit 0
else
    echo "  ❌ 发现 ${FAIL_COUNT} 个失败的测试" | tee -a ${REPORT_FILE}
    exit 1
fi
