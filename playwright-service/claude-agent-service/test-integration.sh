#!/bin/bash

# xiaohongshu-mcp 集成测试脚本

set -e

echo "🧪 Testing xiaohongshu-mcp Integration..."

# 检查编译是否成功
echo "📦 Building project..."
npm run build

# 检查核心文件是否存在
echo "📁 Checking files..."
if [ ! -f "dist/mcpServiceManager.js" ]; then
    echo "❌ mcpServiceManager.js not found"
    exit 1
fi

if [ ! -f "dist/claudeAgentHTTP.js" ]; then
    echo "❌ claudeAgentHTTP.js not found"
    exit 1
fi

if [ ! -f "dist/server.js" ]; then
    echo "❌ server.js not found"
    exit 1
fi

echo "✅ All core files exist"

# 创建测试环境配置
echo "⚙️  Creating test configuration..."
cat > .env.test << 'EOF'
ANTHROPIC_API_KEY=test_key_placeholder
CLAUDE_MODEL=claude-3-haiku-20240307
MAX_TOKENS=4096
PORT=4001
MCP_PORT=18061
HEADLESS=true
LOG_LEVEL=debug
COOKIES_PATH=./test_data/cookies.json
EOF

# 创建测试目录
mkdir -p test_data
mkdir -p bin

echo "🔍 Testing MCP Service Manager (dry run)..."

# 创建简单的测试脚本
cat > test_mcp.js << 'EOF'
import { MCPServiceManager } from './dist/mcpServiceManager.js';
import dotenv from 'dotenv';

// 加载测试环境变量
dotenv.config({ path: '.env.test' });

async function testMCPServiceManager() {
    console.log('🧪 Testing MCP Service Manager...');

    const manager = new MCPServiceManager({
        port: 18061,
        headless: true,
        cookiesPath: './test_data/cookies.json',
        logLevel: 'debug'
    });

    try {
        // 测试配置获取
        const config = manager.getConfig();
        console.log('✅ Config:', config);

        // 测试状态获取
        const status = manager.getStatus();
        console.log('✅ Status:', status);

        // 测试健康检查（预期失败，因为服务未启动）
        const healthy = await manager.isHealthy();
        console.log('ℹ️  Health check (expected false):', healthy);

        console.log('✅ MCP Service Manager tests passed!');
        return true;
    } catch (error) {
        console.error('❌ MCP Service Manager test failed:', error.message);
        return false;
    }
}

testMCPServiceManager()
    .then(success => {
        if (success) {
            console.log('🎉 All tests passed!');
            process.exit(0);
        } else {
            console.log('💥 Tests failed!');
            process.exit(1);
        }
    })
    .catch(error => {
        console.error('💥 Test execution failed:', error);
        process.exit(1);
    });
EOF

# 运行测试
echo "🚀 Running tests..."
node test_mcp.js

# 清理测试文件
echo "🧹 Cleaning up..."
rm -f test_mcp.js
rm -f .env.test
rm -rf test_data

echo "✅ Integration test completed successfully!"
