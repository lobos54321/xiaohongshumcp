# Zeabur 部署指南

## 🚀 一键部署到 Zeabur

本项目已经配置好了 Zeabur 部署所需的所有文件，支持PostgreSQL + Redis的完整生产环境架构。

### 📋 部署步骤

#### 1. 准备环境变量

在 Zeabur 控制台设置以下环境变量：

**必需变量：**
```bash
CLAUDE_API_KEY=sk-ant-xxxxxxxxxxxxxxxxx  # Claude API Key
JWT_SECRET=your-super-secure-jwt-secret  # JWT密钥，请使用安全的随机字符串
DB_PASSWORD=your-secure-db-password      # PostgreSQL数据库密码
REDIS_PASSWORD=your-redis-password       # Redis密码（可选）
```

**自动配置变量（Zeabur自动提供）：**
```bash
POSTGRESQL_HOST     # PostgreSQL主机地址
POSTGRESQL_PORT     # PostgreSQL端口
POSTGRESQL_USERNAME # PostgreSQL用户名
POSTGRESQL_PASSWORD # PostgreSQL密码
POSTGRESQL_DATABASE # PostgreSQL数据库名
REDIS_HOST         # Redis主机地址
REDIS_PORT         # Redis端口
REDIS_PASSWORD     # Redis密码
```

#### 2. 从 GitHub 部署

1. 登录 [Zeabur 控制台](https://zeabur.com)
2. 创建新项目
3. 添加服务：
   - **PostgreSQL 数据库**：选择 PostgreSQL 15
   - **Redis 缓存**：选择 Redis 7
   - **主应用**：选择 "Deploy from GitHub"
4. 连接你的 GitHub 账号
5. 选择 `xiaohongshumcp` 仓库（main分支）
6. Zeabur 会自动检测到配置并部署完整堆栈

#### 3. 配置域名（可选）

部署完成后，你可以：
- 使用 Zeabur 提供的默认域名
- 绑定自定义域名

### 📁 架构说明

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   主应用服务     │───▶│  PostgreSQL     │    │     Redis       │
│                │    │   数据库         │    │     缓存        │
│ - Go 服务       │    │                 │    │                 │
│ - API 接口      │    │ - 用户数据       │    │ - 会话缓存       │
│ - Claude 集成   │    │ - 使用记录       │    │ - API 限流      │
└─────────────────┘    │ - 配置信息       │    └─────────────────┘
                       └─────────────────┘
```

### 🔧 技术特性

**数据库：** PostgreSQL 15，支持数据持久化
**缓存：** Redis 7，提供高性能缓存
**应用：** Go 1.21，容器化部署
**端口：** 8080（自动配置）
**健康检查：** 自动监控服务状态

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

# 检查登录状态（使用API Key）
GET https://your-app.zeabur.app/api/v1/xiaohongshu/api/login-status
X-API-Key: <从注册响应中获取的api_key>

# 发布内容
POST https://your-app.zeabur.app/api/v1/xiaohongshu/api/publish
X-API-Key: <api_key>
Content-Type: application/json

{
  "title": "测试发布",
  "content": "这是通过API发布的内容",
  "tags": ["测试", "API"]
}
```

### 📊 监控和日志

部署后，你可以在Zeabur控制台查看：
- **实时日志**：查看应用运行日志
- **资源使用**：监控CPU、内存、网络使用情况
- **数据库连接**：PostgreSQL连接状态
- **Redis状态**：缓存命中率和性能
- **访问统计**：API调用量和响应时间

### 🔄 更新部署

每次推送到GitHub的main分支，Zeabur会自动重新部署应用服务。

### 🚨 环境变量说明

| 变量名 | 描述 | 示例值 | 必需 |
|--------|------|--------|------|
| `CLAUDE_API_KEY` | Claude API密钥 | `sk-ant-xxxxx` | ✅ |
| `JWT_SECRET` | JWT签名密钥 | `your-secret-key` | ✅ |
| `DB_PASSWORD` | 数据库密码 | `SecurePassword123` | ✅ |
| `REDIS_PASSWORD` | Redis密码 | `RedisPassword123` | ❌ |
| `APP_ENV` | 应用环境 | `production` | ❌ |
| `LOG_LEVEL` | 日志级别 | `info` | ❌ |
| `MCP_BASE_URL` | MCP服务地址 | `http://mcp-service` | ❌ |

### 💡 最佳实践

1. **安全配置**
   - 使用强密码保护数据库和Redis
   - 定期轮换API密钥和JWT密钥
   - 启用HTTPS保护API通信

2. **性能优化**
   - 监控数据库连接池使用情况
   - 配置合适的Redis缓存策略
   - 设置适当的API速率限制

3. **数据备份**
   - 定期备份PostgreSQL数据
   - 监控存储空间使用情况
   - 设置自动备份策略

4. **成本控制**
   - 监控Claude API调用量
   - 优化数据库查询性能
   - 合理配置资源规格

### 🔧 故障排除

**常见问题：**

1. **数据库连接失败**
   - 检查PostgreSQL服务是否正常运行
   - 验证数据库连接信息是否正确
   - 查看应用日志中的详细错误信息

2. **Redis连接失败**
   - 检查Redis服务状态
   - 验证Redis密码配置
   - 应用会自动降级到内存缓存

3. **Claude API调用失败**
   - 验证API Key是否有效
   - 检查网络连接是否正常
   - 查看API调用配额是否超限

**日志查看：**
```bash
# 在Zeabur控制台查看服务日志
# 应用日志
Zeabur Console > Services > app > Logs

# 数据库日志
Zeabur Console > Services > postgres > Logs

# Redis日志
Zeabur Console > Services > redis > Logs
```

### 🆙 扩展部署

如需更高性能，可以考虑：
- 升级数据库和Redis规格
- 配置应用水平扩展
- 添加CDN加速静态资源
- 配置负载均衡

---

部署有问题？查看 [Zeabur 文档](https://zeabur.com/docs) 或 [提交 Issue](https://github.com/lobos54321/xiaohongshumcp/issues)。