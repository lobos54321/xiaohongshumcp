#!/bin/bash
# MCP Router 诊断脚本

echo "🔍 MCP Router 诊断开始..."
echo ""

# 1. 检查进程
echo "1️⃣ 检查 MCP Router 相关进程："
ps aux | grep -E "httpServer.js|xiaohongshu-mcp" | grep -v grep || echo "  ❌ 没有找到相关进程"
echo ""

# 2. 检查端口监听
echo "2️⃣ 检查端口 3000 和 3001 监听情况："
netstat -tlnp 2>/dev/null | grep -E ":3000|:3001" || lsof -i :3000 2>/dev/null || echo "  ❌ 端口 3000 未被监听"
netstat -tlnp 2>/dev/null | grep -E ":3001" || lsof -i :3001 2>/dev/null || echo "  ⚠️  端口 3001 未被监听"
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

# 5. 测试 MCP Router 健康检查
echo "5️⃣ 测试 MCP Router 健康检查："
for port in 3000 3001; do
    echo "  测试端口 $port:"
    if curl -f -m 2 "http://127.0.0.1:$port/health" 2>/dev/null; then
        echo "    ✅ 端口 $port 响应正常"
    else
        echo "    ❌ 端口 $port 无法连接"
    fi
done
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

echo "✅ 诊断完成"
echo ""
echo "💡 常见问题解决方案："
echo "  1. 如果进程不存在 → 运行: cd /app && ./start.sh"
echo "  2. 如果端口未监听 → 检查进程是否崩溃，查看日志"
echo "  3. 如果 Chromium 符号链接不存在 → 运行符号链接创建脚本"
echo "  4. 如果健康检查失败 → 检查日志中的错误信息"
