#!/bin/bash

# xiaohongshu-mcp 集成服务启动脚本

set -e

echo "🚀 Starting xiaohongshu-mcp Integrated Service..."

# 检查必要的环境变量
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Copying from .env.xiaohongshu-mcp..."
    cp .env.xiaohongshu-mcp .env
    echo "📝 Please edit .env file and add your ANTHROPIC_API_KEY"
    exit 1
fi

# 检查 Node.js 版本
NODE_VERSION=$(node --version 2>/dev/null || echo "not found")
if [[ "$NODE_VERSION" == "not found" ]]; then
    echo "❌ Node.js not found. Please install Node.js 18+ first."
    exit 1
fi

echo "✅ Node.js version: $NODE_VERSION"

# 创建必要的目录
echo "📁 Creating necessary directories..."
mkdir -p data
mkdir -p bin
mkdir -p logs

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# 构建项目
echo "🔧 Building project..."
npm run build

echo "🌟 Starting services..."
echo "   📍 HTTP Server: http://localhost:${PORT:-4000}"
echo "   📍 MCP Service: http://localhost:${MCP_PORT:-18060}"
echo "   📍 Health Check: http://localhost:${PORT:-4000}/health"
echo "   📍 API Docs: http://localhost:${PORT:-4000}/api"
echo ""
echo "💡 Use Ctrl+C to stop all services"
echo ""

# 启动服务
npm start