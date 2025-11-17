#!/bin/bash
# 测试脚本修复验证快速检查
# 版本: 1.0
# 用途: 快速验证所有修复后的测试脚本是否正常工作

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "${BLUE}========================================${NC}"
echo "${BLUE}🔍 测试脚本修复验证${NC}"
echo "${BLUE}========================================${NC}"
echo ""

# 计数器
PASS=0
FAIL=0

# 检查函数
check_script() {
    local script=$1
    local description=$2
    
    echo "${BLUE}检查: $description${NC}"
    
    # 检查文件存在
    if [ ! -f "$script" ]; then
        echo "${RED}❌ 文件不存在: $script${NC}"
        ((FAIL++))
        return 1
    fi
    
    # 检查可执行权限
    if [ ! -x "$script" ]; then
        echo "${RED}❌ 文件不可执行: $script${NC}"
        ((FAIL++))
        return 1
    fi
    
    # 检查语法
    if bash -n "$script" 2>/dev/null; then
        echo "${GREEN}✅ 语法检查通过${NC}"
    else
        echo "${RED}❌ 语法错误${NC}"
        ((FAIL++))
        return 1
    fi
    
    # 检查端口配置
    if grep -q "18061\|18062" "$script" && ! grep -q "# 旧端口\|已废弃" "$script"; then
        echo "${RED}❌ 仍然使用旧端口 18061/18062${NC}"
        ((FAIL++))
        return 1
    fi
    
    # 检查是否使用MCP Router
    if grep -q "localhost:3000\|MCP_ROUTER" "$script"; then
        echo "${GREEN}✅ 正确使用MCP Router (3000端口)${NC}"
    else
        echo "${YELLOW}⚠️  未明确使用MCP Router${NC}"
    fi
    
    # 检查配置管理
    if grep -q "MCP_ROUTER_URL\|MCP_ROUTER_BASE_URL" "$script"; then
        echo "${GREEN}✅ 使用环境变量配置${NC}"
    else
        echo "${YELLOW}⚠️  未使用环境变量配置${NC}"
    fi
    
    # 检查错误处理
    if grep -q "log_fail\|echo.*❌\|exit 1" "$script"; then
        echo "${GREEN}✅ 包含错误处理${NC}"
    else
        echo "${YELLOW}⚠️  缺少错误处理${NC}"
    fi
    
    ((PASS++))
    echo ""
    return 0
}

echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "${BLUE}1️⃣  检查诊断脚本${NC}"
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
check_script "./diagnose-mcp-router.sh" "MCP Router 诊断脚本"

echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "${BLUE}2️⃣  检查8大API测试脚本${NC}"
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
check_script "./test-8-apis.sh" "8大核心API测试脚本"

echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "${BLUE}3️⃣  检查发布功能测试脚本${NC}"
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
check_script "./test-publish.sh" "发布功能测试脚本"

# 额外检查：验证报告
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "${BLUE}4️⃣  检查验证报告${NC}"
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [ -f "TEST_SCRIPT_FIX_REPORT.md" ]; then
    echo "${GREEN}✅ 验证报告已生成${NC}"
    echo "   文件大小: $(du -h TEST_SCRIPT_FIX_REPORT.md | cut -f1)"
    ((PASS++))
else
    echo "${RED}❌ 验证报告缺失${NC}"
    ((FAIL++))
fi
echo ""

# 总结
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "${BLUE}📊 验证总结${NC}"
echo "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo "通过: ${GREEN}$PASS${NC} | 失败: ${RED}$FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo "${GREEN}✅ 所有检查通过！测试脚本修复成功！${NC}"
    echo ""
    echo "${BLUE}📋 后续步骤:${NC}"
    echo "  1. 启动 MCP Router 服务"
    echo "  2. 运行诊断脚本: ./diagnose-mcp-router.sh"
    echo "  3. 执行测试脚本: ./test-8-apis.sh"
    echo "  4. 测试发布功能: ./test-publish.sh"
    echo ""
    echo "${BLUE}📄 查看完整报告:${NC}"
    echo "  cat TEST_SCRIPT_FIX_REPORT.md"
    echo ""
    exit 0
else
    echo "${RED}❌ 发现 $FAIL 个问题，请检查并修复${NC}"
    echo ""
    exit 1
fi
