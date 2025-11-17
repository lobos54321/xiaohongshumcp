#!/bin/bash
# 端到端测试 - 主测试脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_DIR="${SCRIPT_DIR}/../e2e-test-reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
SUMMARY_REPORT="${REPORT_DIR}/test-summary-${TIMESTAMP}.txt"

mkdir -p ${REPORT_DIR}

echo "╔══════════════════════════════════════════════════╗" | tee ${SUMMARY_REPORT}
echo "║     小红书端到端测试 - 完整测试套件             ║" | tee -a ${SUMMARY_REPORT}
echo "╚══════════════════════════════════════════════════╝" | tee -a ${SUMMARY_REPORT}
echo "" | tee -a ${SUMMARY_REPORT}
echo "测试开始时间: $(date)" | tee -a ${SUMMARY_REPORT}
echo "后端地址: https://xiaohongshu-automation-ai.zeabur.app" | tee -a ${SUMMARY_REPORT}
echo "" | tee -a ${SUMMARY_REPORT}

TOTAL_PASSED=0
TOTAL_FAILED=0

# 给脚本添加执行权限
chmod +x ${SCRIPT_DIR}/test-connectivity.sh
chmod +x ${SCRIPT_DIR}/test-authentication.sh
chmod +x ${SCRIPT_DIR}/test-core-functions.sh

# 测试层级1：连通性测试
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a ${SUMMARY_REPORT}
echo "第一层：连通性测试" | tee -a ${SUMMARY_REPORT}
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a ${SUMMARY_REPORT}
echo "" | tee -a ${SUMMARY_REPORT}

if bash ${SCRIPT_DIR}/test-connectivity.sh; then
    echo "✅ 连通性测试 - 通过" | tee -a ${SUMMARY_REPORT}
    TOTAL_PASSED=$((TOTAL_PASSED + 1))
else
    echo "❌ 连通性测试 - 失败" | tee -a ${SUMMARY_REPORT}
    TOTAL_FAILED=$((TOTAL_FAILED + 1))
    echo "" | tee -a ${SUMMARY_REPORT}
    echo "⚠️  连通性测试失败，后续测试可能无法进行。" | tee -a ${SUMMARY_REPORT}
fi

echo "" | tee -a ${SUMMARY_REPORT}

# 测试层级2：认证流程测试
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a ${SUMMARY_REPORT}
echo "第二层：用户认证流程测试" | tee -a ${SUMMARY_REPORT}
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a ${SUMMARY_REPORT}
echo "" | tee -a ${SUMMARY_REPORT}

if bash ${SCRIPT_DIR}/test-authentication.sh; then
    echo "✅ 认证流程测试 - 通过" | tee -a ${SUMMARY_REPORT}
    TOTAL_PASSED=$((TOTAL_PASSED + 1))
else
    echo "❌ 认证流程测试 - 失败" | tee -a ${SUMMARY_REPORT}
    TOTAL_FAILED=$((TOTAL_FAILED + 1))
fi

echo "" | tee -a ${SUMMARY_REPORT}

# 测试层级3：核心功能测试
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a ${SUMMARY_REPORT}
echo "第三层：核心功能测试" | tee -a ${SUMMARY_REPORT}
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a ${SUMMARY_REPORT}
echo "" | tee -a ${SUMMARY_REPORT}

if bash ${SCRIPT_DIR}/test-core-functions.sh; then
    echo "✅ 核心功能测试 - 通过" | tee -a ${SUMMARY_REPORT}
    TOTAL_PASSED=$((TOTAL_PASSED + 1))
else
    echo "❌ 核心功能测试 - 失败" | tee -a ${SUMMARY_REPORT}
    TOTAL_FAILED=$((TOTAL_FAILED + 1))
fi

echo "" | tee -a ${SUMMARY_REPORT}

# 最终汇总
echo "╔══════════════════════════════════════════════════╗" | tee -a ${SUMMARY_REPORT}
echo "║               测试结果汇总                       ║" | tee -a ${SUMMARY_REPORT}
echo "╚══════════════════════════════════════════════════╝" | tee -a ${SUMMARY_REPORT}
echo "" | tee -a ${SUMMARY_REPORT}
echo "测试完成时间: $(date)" | tee -a ${SUMMARY_REPORT}
echo "" | tee -a ${SUMMARY_REPORT}
echo "总测试层级: $((TOTAL_PASSED + TOTAL_FAILED))" | tee -a ${SUMMARY_REPORT}
echo "通过: ${TOTAL_PASSED}" | tee -a ${SUMMARY_REPORT}
echo "失败: ${TOTAL_FAILED}" | tee -a ${SUMMARY_REPORT}
echo "" | tee -a ${SUMMARY_REPORT}

PASS_RATE=$((TOTAL_PASSED * 100 / (TOTAL_PASSED + TOTAL_FAILED)))
echo "通过率: ${PASS_RATE}%" | tee -a ${SUMMARY_REPORT}
echo "" | tee -a ${SUMMARY_REPORT}

if [ ${TOTAL_FAILED} -eq 0 ]; then
    echo "🎉 所有测试通过！系统运行正常。" | tee -a ${SUMMARY_REPORT}
    echo "" | tee -a ${SUMMARY_REPORT}
    exit 0
else
    echo "⚠️  存在失败的测试，请查看详细报告。" | tee -a ${SUMMARY_REPORT}
    echo "" | tee -a ${SUMMARY_REPORT}
    exit 1
fi
