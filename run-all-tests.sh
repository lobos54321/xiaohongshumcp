#!/bin/bash

echo "🚀 小红书智能自动化系统 - 完整测试套件"
echo "=================================================="
echo "本脚本将执行所有测试和验证脚本"
echo ""

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

# 检查必要文件
check_required_files() {
    local required_files=(
        "comprehensive-test-and-fix.sh"
        "detailed-component-test.sh"
        "fix-verification-script.sh"
    )
    
    for file in "${required_files[@]}"; do
        if [[ ! -f "$file" ]]; then
            log_error "缺少必要文件: $file"
            return 1
        fi
    done
    
    return 0
}

# 执行脚本函数
run_script() {
    local script_name=$1
    local script_description=$2
    
    log_info "开始执行: $script_description"
    echo "--------------------------------------------------"
    
    if ./"$script_name"; then
        log_success "✅ $script_description 执行完成"
    else
        log_error "❌ $script_description 执行失败"
        return 1
    fi
    
    echo ""
    return 0
}

# 主函数
main() {
    log_info "开始执行完整测试套件..."
    
    # 检查必要文件
    check_required_files || return 1
    
    # 设置环境变量（如果未设置）
    if [[ -z "$ANTHROPIC_API_KEY" ]]; then
        log_warning "⚠️  ANTHROPIC_API_KEY 未设置，某些测试可能无法正常执行"
        log_info "建议设置环境变量："
        echo "  export ANTHROPIC_API_KEY=your_api_key_here"
        echo ""
    fi
    
    # 执行所有测试脚本
    run_script "comprehensive-test-and-fix.sh" "综合测试与修复脚本" || return 1
    run_script "detailed-component-test.sh" "详细组件测试脚本" || return 1
    run_script "fix-verification-script.sh" "修复验证脚本" || return 1
    
    log_success "🎉 所有测试脚本执行完成！"
    log_info "请查看生成的报告文件以获取详细结果："
    ls -la *.md 2>/dev/null || echo "  未找到报告文件"
    
    return 0
}

# 执行主函数
main "$@"