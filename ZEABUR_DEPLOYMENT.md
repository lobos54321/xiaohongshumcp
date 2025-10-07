# 🚀 Zeabur 部署指南 - 小红书智能自动化系统

本文档详细说明如何将小红书智能自动化系统部署到Zeabur平台。

## 📋 部署概览

系统包含两个独立的服务：
1. **Claude Agent Service** (主服务) - 端口8080
2. **MCP Router** (工具路由) - 端口3000

## 🔧 部署前准备

### 必需的API密钥

确保您拥有以下API密钥：

1. **Anthropic Claude API Key** (必需)
   - 格式：`sk-ant-api03-...`
   - 需要在Zeabur环境变量中设置您的真实密钥

2. **Google Gemini API Key** (图片生成必需)
   - 格式：`AIzaSy...`
   - 需要在Zeabur环境变量中设置您的真实密钥

3. **Unsplash Access Key** (可选，图片备用)
   - 如果没有可留空

## 📦 部署步骤

### 第一步：部署MCP Router服务

1. 在Zeabur创建新项目
2. 添加GitHub服务，选择仓库路径：`playwright-service/mcp-router`
3. 设置环境变量：
   ```env
   NODE_ENV=production
   BASE_PORT=18060
   HTTP_PORT=3000
   MAX_PROCESSES=20
   CLEANUP_TIMEOUT=600000
   ```
4. 部署并等待启动完成
5. **记录MCP Router的内部服务名**（通常为 `mcp-router`）

### 第二步：部署Claude Agent Service

1. 在同一个Zeabur项目中添加第二个服务
2. 选择仓库路径：`playwright-service/claude-agent-service`
3. 设置关键环境变量：
   ```env
   # 必需的API密钥
   ANTHROPIC_API_KEY=your_claude_api_key_here
   GEMINI_API_KEY=your_gemini_api_key_here

   # 服务配置
   NODE_ENV=production
   PORT=8080
   CLAUDE_MODEL=claude-3-5-sonnet-20241022
   MAX_TOKENS=4096

   # MCP Router连接（替换为实际的服务名）
   MCP_ROUTER_URL=http://mcp-router:3000
   ```

### 第三步：配置域名和访问

1. 为Claude Agent Service配置自定义域名
2. 确保域名指向正确的服务端口（8080）
3. 访问 `https://your-domain.com` 测试前端界面

## ⚙️ 环境变量详解

### Claude Agent Service 环境变量

| 变量名 | 必需 | 说明 | 示例值 |
|--------|------|------|--------|
| `ANTHROPIC_API_KEY` | ✅ | Claude API密钥 | `sk-ant-api03-...` |
| `GEMINI_API_KEY` | ✅ | Gemini API密钥 | `AIzaSy...` |
| `CLAUDE_MODEL` | ❌ | Claude模型名 | `claude-3-5-sonnet-20241022` |
| `PORT` | ❌ | 服务端口 | `8080` |
| `MCP_ROUTER_URL` | ✅ | MCP Router地址 | `http://mcp-router:3000` |
| `UNSPLASH_ACCESS_KEY` | ❌ | Unsplash图片API | 可选 |

### MCP Router 环境变量

| 变量名 | 必需 | 说明 | 示例值 |
|--------|------|------|--------|
| `HTTP_PORT` | ❌ | HTTP服务端口 | `3000` |
| `BASE_PORT` | ❌ | 子进程起始端口 | `18060` |
| `MAX_PROCESSES` | ❌ | 最大进程数 | `20` |
| `CLEANUP_TIMEOUT` | ❌ | 清理超时(ms) | `600000` |

## 🔍 部署验证

### 1. 健康检查

访问以下URL验证服务状态：

- **Claude Agent Service**: `https://your-domain.com/health`
  ```json
  {
    "status": "healthy",
    "service": "claude-agent-service",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
  ```

- **MCP Router**: `https://mcp-router-domain.com/health`
  ```json
  {
    "status": "healthy",
    "message": "MCP Router is running"
  }
  ```

### 2. API测试

测试主要API端点：

```bash
# 测试聊天API
curl -X POST https://your-domain.com/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"userId":"test","prompt":"你好"}'

# 测试自动运营API
curl https://your-domain.com/agent/auto/strategy/test-user
```

### 3. 前端功能验证

1. 访问主页：`https://your-domain.com`
2. 点击"开始智能运营"
3. 验证自动登录检测功能
4. 测试配置和启动流程

## 🛠 故障排除

### 常见问题

1. **Claude API调用失败**
   - 检查 `ANTHROPIC_API_KEY` 是否正确设置
   - 确认API密钥有效且有足够额度

2. **MCP Router连接失败**
   - 检查 `MCP_ROUTER_URL` 设置是否正确
   - 确认MCP Router服务正常运行
   - 验证服务间网络连通性

3. **图片生成失败**
   - 检查 `GEMINI_API_KEY` 是否有效
   - 确认Gemini API额度充足

4. **前端API调用失败**
   - 检查域名配置是否正确
   - 确认CORS设置允许跨域访问

### 日志查看

在Zeabur控制台中查看服务日志：
1. 进入项目dashboard
2. 点击相应服务
3. 查看"Logs"标签页
4. 寻找错误信息和状态日志

## 🔄 更新部署

### 自动部署

连接GitHub仓库后，推送代码会自动触发重新部署：

```bash
git add .
git commit -m "Update deployment configuration"
git push origin main
```

### 手动重启

在Zeabur控制台中：
1. 选择需要重启的服务
2. 点击"Restart"按钮
3. 等待服务重新启动

## 📊 监控和维护

### 性能监控

1. **服务状态监控**
   - 定期检查 `/health` 端点
   - 监控服务响应时间

2. **API使用监控**
   - 跟踪Claude API调用量
   - 监控Gemini API使用情况

3. **用户活动监控**
   - 观察自动运营任务执行情况
   - 检查实时活动日志

### 维护建议

1. **定期备份**
   - 导出用户配置数据
   - 备份生成的内容

2. **安全更新**
   - 定期更新依赖包
   - 检查安全漏洞

3. **性能优化**
   - 监控内存使用
   - 优化API调用频率

## 📞 技术支持

如果在部署过程中遇到问题，请：

1. 检查Zeabur服务日志
2. 验证环境变量设置
3. 测试网络连通性
4. 确认API密钥有效性

部署成功后，您的小红书智能自动化系统将全天候运行，为用户提供自动化的内容创作和发布服务。