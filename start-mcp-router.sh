#!/bin/bash

# 启动MCP Router的正确脚本
# 确保端口配置与claude-agent-service一致

echo "🚀 启动MCP Router (端口 3001)..."

cd playwright-service/mcp-router

# 设置正确的端口配置
export HTTP_PORT=3001
export MCP_BINARY_PATH=./xiaohongshu-mcp
export COOKIE_DIR=./cookies

# 启动HTTP服务器
npm run start:http