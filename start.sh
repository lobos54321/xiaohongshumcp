#!/bin/bash

# 启动MCP Router (后台)
cd playwright-service/mcp-router
node dist/httpServer.js &
MCP_PID=$!
cd ../..

# 等待MCP Router启动
sleep 3

# 启动Claude Agent Service
cd playwright-service/claude-agent-service
node dist/server.js

# 清理
trap "kill $MCP_PID 2>/dev/null" EXIT
