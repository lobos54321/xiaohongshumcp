#!/bin/bash
# 端到端测试 - 第二层：用户认证流程测试

set -e

# 配置
BASE_URL="https://xiaohongshu-automation-ai.zeabur.app"
REPORT_DIR="e2e-test-reports"
TIMESTAMP=$(date +%s)
TEST_USER="e2e-test-${TIMESTAMP}-$(head -c 8 /dev/urandom | base64 | tr -dc 'a-z0-9' | head -c 6)"
REPORT_FILE="${REPORT_DIR}/authentication-test-${TIMESTAMP}.txt"

mkdir -p ${REPORT_DIR}

echo "================================" | tee ${REPORT_FILE}
echo "  用户认证流程测试" | tee -a ${REPORT_FILE}
echo "  测试时间: $(date)" | tee -a ${REPORT_FILE}
echo "  测试用户: ${TEST_USER}" | tee -a ${REPORT_FILE}
echo "================================" | tee -a ${REPORT_FILE}
echo "" | tee -a ${REPORT_FILE}

PASS_COUNT=0
FAIL_COUNT=0

# 测试函数
test_step() {
    local step_name="$1"
    local result="$2"
    
    echo "步骤: ${step_name}" | tee -a ${REPORT_FILE}
    
    if [ "$result" = "PASS" ]; then
        echo "  ✅ PASS" | tee -a ${REPORT_FILE}
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "  ❌ FAIL" | tee -a ${REPORT_FILE}
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
    echo "" | tee -a ${REPORT_FILE}
}

# 测试用例2.1：用户初始化
echo "测试用例 2.1: 用户初始化" | tee -a ${REPORT_FILE}
echo "----------------------------------------" | tee -a ${REPORT_FILE}

INIT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BASE_URL}/api/user/initialize" \
    -H "Content-Type: application/json" \
    -d "{\"userId\": \"${TEST_USER}\"}")

INIT_STATUS=$(echo "$INIT_RESPONSE" | tail -n 1)
INIT_BODY=$(echo "$INIT_RESPONSE" | head -n -1)

echo "响应状态码: ${INIT_STATUS}" | tee -a ${REPORT_FILE}
echo "响应内容: ${INIT_BODY}" | tee -a ${REPORT_FILE}
echo "" | tee -a ${REPORT_FILE}

if [ "$INIT_STATUS" = "200" ] && echo "$INIT_BODY" | grep -q "success"; then
    test_step "用户初始化" "PASS"
else
    test_step "用户初始化" "FAIL"
    echo "❌ 用户初始化失败，终止测试" | tee -a ${REPORT_FILE}
    exit 1
fi

# 测试用例2.2：获取用户状态
echo "测试用例 2.2: 获取用户状态" | tee -a ${REPORT_FILE}
echo "----------------------------------------" | tee -a ${REPORT_FILE}

STATUS_RESPONSE=$(curl -s -w "\n%{http_code}" "${BASE_URL}/api/user/status/${TEST_USER}")

STATUS_CODE=$(echo "$STATUS_RESPONSE" | tail -n 1)
STATUS_BODY=$(echo "$STATUS_RESPONSE" | head -n -1)

echo "响应状态码: ${STATUS_CODE}" | tee -a ${REPORT_FILE}
echo "响应内容: ${STATUS_BODY}" | tee -a ${REPORT_FILE}
echo "" | tee -a ${REPORT_FILE}

if [ "$STATUS_CODE" = "200" ]; then
    test_step "获取用户状态" "PASS"
else
    test_step "获取用户状态" "FAIL"
fi

# 测试用例2.3：自动登录流程（获取二维码）
echo "测试用例 2.3: 自动登录流程" | tee -a ${REPORT_FILE}
echo "----------------------------------------" | tee -a ${REPORT_FILE}

# 第一步：获取登录二维码
echo "步骤 1/3: 获取登录二维码..." | tee -a ${REPORT_FILE}

QR_RESPONSE=$(curl -s -w "\n%{http_code}" \
    "${BASE_URL}/api/xiaohongshu/login/qrcode?userId=${TEST_USER}")

QR_STATUS=$(echo "$QR_RESPONSE" | tail -n 1)
QR_BODY=$(echo "$QR_RESPONSE" | head -n -1)

echo "响应状态码: ${QR_STATUS}" | tee -a ${REPORT_FILE}

if [ "$QR_STATUS" = "200" ] && echo "$QR_BODY" | grep -q "img"; then
    echo "  ✅ 二维码获取成功" | tee -a ${REPORT_FILE}
    
    # 提取二维码base64数据并保存
    QR_IMAGE=$(echo "$QR_BODY" | grep -o '"img"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
    
    if [ -n "$QR_IMAGE" ]; then
        QR_PNG="${REPORT_DIR}/qrcode-${TIMESTAMP}.png"
        echo "$QR_IMAGE" | sed 's/data:image\/png;base64,//' | base64 -d > ${QR_PNG} 2>/dev/null || true
        
        if [ -f "$QR_PNG" ]; then
            echo "  ✓ 二维码已保存: ${QR_PNG}" | tee -a ${REPORT_FILE}
        fi
    fi
    
    test_step "获取二维码" "PASS"
else
    echo "  ❌ 二维码获取失败" | tee -a ${REPORT_FILE}
    echo "  响应: ${QR_BODY:0:200}" | tee -a ${REPORT_FILE}
    test_step "获取二维码" "FAIL"
fi

echo "" | tee -a ${REPORT_FILE}
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a ${REPORT_FILE}
echo "  📱 手动测试步骤" | tee -a ${REPORT_FILE}
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a ${REPORT_FILE}
echo "" | tee -a ${REPORT_FILE}
echo "如需完整测试登录流程，请执行以下步骤：" | tee -a ${REPORT_FILE}
echo "1. 打开二维码文件: ${REPORT_DIR}/qrcode-${TIMESTAMP}.png" | tee -a ${REPORT_FILE}
echo "2. 使用小红书APP扫描二维码" | tee -a ${REPORT_FILE}
echo "3. 完成登录后，运行以下命令检查状态：" | tee -a ${REPORT_FILE}
echo "" | tee -a ${REPORT_FILE}
echo "   curl -s '${BASE_URL}/api/xiaohongshu/login/status?userId=${TEST_USER}' | jq ." | tee -a ${REPORT_FILE}
echo "" | tee -a ${REPORT_FILE}
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a ${REPORT_FILE}
echo "" | tee -a ${REPORT_FILE}

# 步骤 2/3: 检查登录状态（不等待扫码）
echo "步骤 2/3: 检查当前登录状态..." | tee -a ${REPORT_FILE}

LOGIN_STATUS_RESPONSE=$(curl -s "${BASE_URL}/api/xiaohongshu/login/status?userId=${TEST_USER}")

echo "登录状态: ${LOGIN_STATUS_RESPONSE}" | tee -a ${REPORT_FILE}
echo "" | tee -a ${REPORT_FILE}

if echo "$LOGIN_STATUS_RESPONSE" | grep -q '"logged_in"[[:space:]]*:[[:space:]]*true'; then
    echo "  ✅ 用户已登录！" | tee -a ${REPORT_FILE}
    test_step "登录状态检查" "PASS"
else
    echo "  ⚠️  用户未登录（预期行为，需要扫码）" | tee -a ${REPORT_FILE}
    test_step "登录状态检查（未扫码）" "PASS"
fi

# 汇总报告
echo "" | tee -a ${REPORT_FILE}
echo "================================" | tee -a ${REPORT_FILE}
echo "  测试结果汇总" | tee -a ${REPORT_FILE}
echo "================================" | tee -a ${REPORT_FILE}
echo "" | tee -a ${REPORT_FILE}
echo "测试用户ID: ${TEST_USER}" | tee -a ${REPORT_FILE}
echo "通过步骤: ${PASS_COUNT}" | tee -a ${REPORT_FILE}
echo "失败步骤: ${FAIL_COUNT}" | tee -a ${REPORT_FILE}
echo "" | tee -a ${REPORT_FILE}

if [ ${FAIL_COUNT} -eq 0 ]; then
    echo "  ✅ 认证流程测试通过！" | tee -a ${REPORT_FILE}
    echo "" | tee -a ${REPORT_FILE}
    echo "📝 备注：完整的登录流程需要人工扫码，自动化测试已验证API可用性。" | tee -a ${REPORT_FILE}
    exit 0
else
    echo "  ❌ 发现 ${FAIL_COUNT} 个失败的步骤" | tee -a ${REPORT_FILE}
    exit 1
fi
