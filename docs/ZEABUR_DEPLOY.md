# Zeabur 部署指南

## 🚀 一键部署到 Zeabur

本项目已经配置好了 Zeabur 部署所需的所有文件，你可以直接从 GitHub 部署。

### 📋 部署步骤

#### 1. 准备环境变量

在 Zeabur 控制台设置以下环境变量：

**必需变量：**
```bash
CLAUDE_API_KEY=sk-ant-xxxxxxxxxxxxxxxxx  # Claude API Key
JWT_SECRET=your-super-secure-jwt-secret  # JWT密钥，请使用安全的随机字符串
```

**可选变量：**
```bash
APP_ENV=production                       # 应用环境
LOG_LEVEL=info                          # 日志级别
MCP_BASE_URL=http://your-mcp-service    # 小红书MCP服务地址（如果有）
```

#### 2. 从 GitHub 部署

1. 登录 [Zeabur 控制台](https://zeabur.com)
2. 创建新项目
3. 选择 "Deploy from GitHub"
4. 连接你的 GitHub 账号
5. 选择 `xiaohongshumcp` 仓库
6. Zeabur 会自动检测到 Go 项目并开始部署

#### 3. 配置域名（可选）

部署完成后，你可以：
- 使用 Zeabur 提供的默认域名
- 绑定自定义域名

### 📁 部署文件说明

- `Dockerfile.zeabur`: Zeabur专用的Dockerfile
- `configs/config.zeabur.yaml`: 简化的配置文件，使用SQLite数据库
- `zeabur.yaml`: Zeabur部署配置文件
- `vercel.json`: 可选的Vercel配置（如果你想用Vercel部署）

### 🔧 技术特性

**数据库：** 自动使用SQLite，无需外部数据库
**缓存：** 内存缓存，无需Redis
**文件存储：** 本地文件系统
**端口：** 8080（自动配置）

### 🧪 部署后测试

部署成功后，你可以测试以下端点：

```bash
# 健康检查
GET https://your-app.zeabur.app/health

# 用户注册
POST https://your-app.zeabur.app/api/v1/auth/register
Content-Type: application/json

{
  "username": "test",
  "email": "test@example.com",
  "password": "test123",
  "name": "Test User"
}

# 登录获取token
POST https://your-app.zeabur.app/api/v1/auth/login
Content-Type: application/json

{
  "username": "test",
  "password": "test123"
}
```

### 📊 监控和日志

部署后，你可以在Zeabur控制台查看：
- 实时日志
- 资源使用情况
- 访问统计
- 错误监控

### 🔄 更新部署

每次推送到GitHub的master分支，Zeabur会自动重新部署。

### 🚨 注意事项

1. **API Key安全**: 请确保在环境变量中设置真实的Claude API Key
2. **JWT密钥**: 使用足够安全的JWT密钥，不要使用默认值
3. **数据持久化**: SQLite数据文件会在容器重启时重置，生产环境建议使用外部数据库
4. **小红书MCP**: 需要单独部署小红书MCP服务或提供相应的服务地址

### 💡 最佳实践

- 定期备份重要数据
- 监控API调用量和成本
- 设置适当的速率限制
- 使用HTTPS保护API通信

---

部署有问题？查看 [Zeabur 文档](https://zeabur.com/docs) 或 [提交 Issue](https://github.com/lobos54321/xiaohongshumcp/issues)。