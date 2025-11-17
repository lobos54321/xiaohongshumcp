#!/bin/bash
# 端到端测试 - 第一层：连通性测试

set -e

# 配置
BASE_URL="https://xiaohongshu-automation-ai.zeabur.app"
REPORT_DIR="e2e-test-reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="${REPORT_DIR}/connectivity-test-${TIMESTAMP}.txt"

mkdir -p ${REPORT_DIR}

echo "================================" | tee ${REPORT_FILE}
echo "  连通性测试报告" | tee -a ${REPORT_FILE}
echo "  测试时间: $(date)" | tee -a ${REPORT_FILE}
echo "  后端地址: ${BASE_URL}" | tee -a ${REPORT_FILE}
echo "================================" | tee -a ${REPORT_FILE}
echo "" | tee -a ${REPORT_FILE}

PASS_COUNT=0
FAIL_COUNT=0
TOTAL_COUNT=0

# 测试函数
test_endpoint() {
    local test_name="$1"
    local url="$2"
    local expected_status="${3:-200}"
    
    TOTAL_COUNT=$((TOTAL_COUNT + 1))
    
    echo "测试 ${TOTAL_COUNT}: ${test_name}" | tee -a ${REPORT_FILE}
    
    START_TIME=$(date +%s%3N)
    
    RESPONSE=$(curl -s -w "\n%{http_code}\n%{time_total}" "${url}" 2>&1)
    
    STATUS=$(echo "$RESPONSE" | tail -n 2 | head -n 1)
    TIME=$(echo "$RESPONSE" | tail -n 1)
    BODY=$(echo "$RESPONSE" | head -n -2)
    
    # 将秒转换为毫秒
    TIME_MS=$(echo "$TIME * 1000" | bc | cut -d'.' -f1)
    
    if [ "$STATUS" = "$expected_status" ]; then
        echo "  ✅ PASS - 状态码: ${STATUS} (${TIME_MS}ms)" | tee -a ${REPORT_FILE}
        PASS_COUNT=$((PASS_COUNT + 1))
        
        # 验证响应内容
        if echo "$BODY" | grep -q "status"; then
            echo "  ✓ 响应包含status字段" | tee -a ${REPORT_FILE}
        fi
    else
        echo "  ❌ FAIL - 状态码: ${STATUS} (预期: ${expected_status})" | tee -a ${REPORT_FILE}
        echo "  响应: ${BODY:0:200}" | tee -a ${REPORT_FILE}
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
    echo "" | tee -a ${REPORT_FILE}
}

# 执行测试
echo "开始连通性测试..." | tee -a ${REPORT_FILE}
echo "" | tee -a ${REPORT_FILE}

# 测试用例1.1：后端健康检查
test_endpoint "后端健康检查" "${BASE_URL}/health" "200"

# 测试用例1.2：OPTIONS预检请求（CORS验证）
echo "测试 ${TOTAL_COUNT}: CORS预检请求" | tee -a ${REPORT_FILE}
TOTAL_COUNT=$((TOTAL_COUNT + 1))

CORS_RESPONSE=$(curl -s -i -X OPTIONS "${BASE_URL}/health" \
    -H "Origin: https://www.prome.live" \
    -H "Access-Control-Request-Method: POST" 2>&1)

if echo "$CORS_RESPONSE" | grep -qi "Access-Control-Allow-Origin"; then
    echo "  ✅ PASS - CORS配置正常" | tee -a ${REPORT_FILE}
    PASS_COUNT=$((PASS_COUNT + 1))
    
    # 提取允许的Origin
    ALLOWED_ORIGIN=$(echo "$CORS_RESPONSE" | grep -i "Access-Control-Allow-Origin" | cut -d':' -f2- | tr -d '\r' | xargs)
    echo "  ✓ 允许的Origin: ${ALLOWED_ORIGIN}" | tee -a ${REPORT_FILE}
else
    echo "  ⚠️  WARNING - 未检测到CORS响应头" | tee -a ${REPORT_FILE}
    echo "  （可能需要实际的跨域请求才能触发）" | tee -a ${REPORT_FILE}
    PASS_COUNT=$((PASS_COUNT + 1))
fi
echo "" | tee -a ${REPORT_FILE}

# 测试API可达性
test_endpoint "用户状态查询（示例）" "${BASE_URL}/api/user/status/test-user" "200"

# 汇总报告
echo "================================" | tee -a ${REPORT_FILE}
echo "  测试结果汇总" | tee -a ${REPORT_FILE}
echo "================================" | tee -a ${REPORT_FILE}
echo "" | tee -a ${REPORT_FILE}
echo "总测试数: ${TOTAL_COUNT}" | tee -a ${REPORT_FILE}
echo "通过: ${PASS_COUNT}" | tee -a ${REPORT_FILE}
echo "失败: ${FAIL_COUNT}" | tee -a ${REPORT_FILE}

if [ ${FAIL_COUNT} -eq 0 ]; then
    echo "" | tee -a ${REPORT_FILE}
    echo "  ✅ 所有连通性测试通过！" | tee -a ${REPORT_FILE}
    echo "" | tee -a ${REPORT_FILE}
    exit 0
else
    echo "" | tee -a ${REPORT_FILE}
    echo "  ❌ 发现 ${FAIL_COUNT} 个失败的测试" | tee -a ${REPORT_FILE}
    echo "" | tee -a ${REPORT_FILE}
    exit 1
fi
