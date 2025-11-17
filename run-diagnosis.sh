#!/bin/bash

echo "🔍 小红书智能自动化系统问题诊断脚本"
echo "=================================================="

# 设置环境变量（如果需要）
if [[ -z "$ANTHROPIC_API_KEY" ]]; then
    echo "⚠️  注意：ANTHROPIC_API_KEY未设置，部分测试可能无法执行"
    echo "请设置环境变量以获得完整测试结果："
    echo "  export ANTHROPIC_API_KEY=your_api_key_here"
    echo ""
fi

# 检查必要命令
if ! command -v curl &> /dev/null || ! command -v jq &> /dev/null; then
    echo "❌ 错误：缺少必要命令"
    echo "请安装 curl 和 jq："
    echo "  Ubuntu/Debian: sudo apt-get install curl jq"
    echo "  CentOS/RHEL: sudo yum install curl jq"
    echo "  macOS: brew install curl jq"
    exit 1
fi

# 检查测试脚本是否存在
if [[ ! -f "run-all-tests.sh" ]]; then
    echo "❌ 错误：测试套件文件不存在"
    echo "请确保在正确的目录中运行此脚本"
    exit 1
fi

echo "✅ 环境检查通过"
echo ""

# 询问用户想要执行哪种测试
echo "请选择要执行的测试类型："
echo "1) 快速诊断（推荐）"
echo "2) 完整测试套件"
echo "3) 仅验证修复措施"
echo "4) 仅组件功能测试"
echo ""
read -p "请输入选项 (1-4): " choice

case $choice in
    1)
        echo "🚀 执行快速诊断..."
        ./comprehensive-test-and-fix.sh
        ;;
    2)
        echo "🚀 执行完整测试套件..."
        ./run-all-tests.sh
        ;;
    3)
        echo "🚀 验证修复措施..."
        ./fix-verification-script.sh
        ;;
    4)
        echo "🚀 执行组件功能测试..."
        ./detailed-component-test.sh
        ;;
    *)
        echo "❌ 无效选项，执行快速诊断..."
        ./comprehensive-test-and-fix.sh
        ;;
esac

echo ""
echo "✅ 诊断完成，请查看生成的报告文件了解详细结果"