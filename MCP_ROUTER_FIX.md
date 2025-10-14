# MCP Router 500错误修复说明

## 问题描述
之前系统出现500错误，是因为MCP Router服务未启动，导致claude-agent-service无法连接到`http://127.0.0.1:3001`。

## 解决方案

### 1. 启动顺序
系统需要按照以下顺序启动：

1. **首先启动MCP Router** (端口3001)
   ```bash
   ./start-mcp-router.sh
   ```
   或者手动启动：
   ```bash
   cd playwright-service/mcp-router
   HTTP_PORT=3001 npm run start:http
   ```

2. **然后启动Claude Agent Service** (端口8080)
   ```bash
   cd playwright-service
   DATA_DIR=./data/auto-content MCP_ROUTER_URL=http://127.0.0.1:3001 npm start
   ```

### 2. 端口配置
- **MCP Router**: 3001端口
- **Claude Agent Service**: 8080端口
- **前端界面**: http://localhost:8080

### 3. 验证连接
启动后可以通过以下方式验证：
```bash
# 检查MCP Router健康状态
curl http://127.0.0.1:3001/health

# 检查Claude Agent Service
curl http://localhost:8080/health
```

### 4. 环境变量
确保以下环境变量正确设置：
- `MCP_ROUTER_URL=http://127.0.0.1:3001` (claude-agent-service)
- `HTTP_PORT=3001` (mcp-router)

## 已修复的问题
✅ JSON解析失败 → 增强cleanJSONResponse方法
✅ 前端发布功能缺失 → 添加完整模态框界面
✅ MCP Router 500错误 → 服务现在正确运行在3001端口
✅ GitHub同步 → 所有更改已提交

## 注意事项
- 系统现在需要两个服务同时运行
- MCP Router必须先启动，否则claude-agent-service会连接失败
- 使用提供的启动脚本可以确保正确的配置