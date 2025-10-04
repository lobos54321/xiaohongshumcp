# 🚀 小红书自动化营销平台 - Playwright 版本

基于 Playwright 浏览器自动化 + Redis 消息队列的小红书自动化营销解决方案。

## ✨ 核心特性

- **🎭 智能浏览器池**：动态管理浏览器实例，支持高并发
- **🔄 消息队列异步处理**：基于 Redis + BullMQ，排队机制确保稳定
- **👁️ 预览模式**：发布前先预览效果，确认后再发布
- **⚡ 自动发布模式**：一键直达，无需确认
- **🔐 Cookie 持久化**：一次登录，永久有效
- **📊 实时进度反馈**：排队位置、处理进度实时显示
- **💰 成本优化**：浏览器池复用，10 用户仅需 $40/月

## 🏗️ 架构设计

```
┌─────────────┐
│  前端 UI    │
│  (React)    │
└──────┬──────┘
       │
       ↓
┌─────────────┐
│  Go 后端    │
│  (Gin API)  │
└──────┬──────┘
       │
       ↓
┌───────────────────┐      ┌─────────────┐
│ Playwright 服务   │ ←──→ │    Redis    │
│  (Node.js)        │      │  消息队列   │
└─────────┬─────────┘      └─────────────┘
          │
          ↓
  ┌───────────────────┐
  │  浏览器池 (10个)  │
  │  ├─ Context A     │
  │  ├─ Context B     │
  │  └─ Context ...   │
  └───────────────────┘
```

## 📦 快速开始

### 1. 环境要求

- Docker & Docker Compose
- Node.js 18+ (本地开发)
- Go 1.21+ (本地开发)
- Redis (已包含在 Docker Compose)

### 2. 克隆项目

```bash
git clone <your-repo-url>
cd xiaohongshumcp
```

### 3. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env
cp playwright-service/.env.example playwright-service/.env

# 编辑 .env 文件，填入必要的配置
```

### 4. 使用 Docker Compose 启动（推荐）

```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

服务启动后：
- Go 后端：http://localhost:8080
- Playwright 服务：http://localhost:3001
- Redis：localhost:6379

### 5. 本地开发模式

#### 启动 Redis
```bash
docker run -d -p 6379:6379 redis:7-alpine
```

#### 启动 Playwright 服务
```bash
cd playwright-service
npm install
npm run dev
```

#### 启动 Go 后端
```bash
go run cmd/server/main.go
```

#### 启动前端
```bash
cd prome-platform
npm install
npm run dev
```

## 🎯 使用流程

### 用户操作流程

```
1️⃣ 登录平台
   ↓
2️⃣ 扫码登录小红书（首次）
   ↓
3️⃣ AI 生成内容（可选）
   ↓
4️⃣ 编辑标题和正文
   ↓
5️⃣ 选择发布模式
   ├─ 预览模式：先预览 → 确认发布
   └─ 自动发布：直接发布
   ↓
6️⃣ 查看发布状态
   └─ 排队中 → 处理中 → 发布成功
```

### API 调用流程

#### 1. 获取登录二维码

```bash
POST /api/v1/xiaohongshu/playwright/login/qrcode
Headers:
  X-API-Key: your_api_key

Response:
{
  "code": 200,
  "data": {
    "success": true,
    "qrcode": "base64_encoded_image"
  }
}
```

#### 2. 检查登录状态

```bash
GET /api/v1/xiaohongshu/playwright/login/status
Headers:
  X-API-Key: your_api_key

Response:
{
  "code": 200,
  "data": {
    "success": true,
    "status": "logged_in"  // 或 "waiting"
  }
}
```

#### 3. 提交发布任务（预览模式）

```bash
POST /api/v1/xiaohongshu/playwright/publish
Headers:
  X-API-Key: your_api_key
Content-Type: application/json

Body:
{
  "mode": "preview",  // 或 "publish"
  "title": "秋季穿搭分享",
  "content": "这样穿超显瘦...",
  "images": ["/path/to/img1.jpg"],
  "tags": ["穿搭", "秋季"]
}

Response:
{
  "code": 200,
  "data": {
    "success": true,
    "taskId": "12345",
    "status": "pending"
  }
}
```

#### 4. 查询任务状态

```bash
GET /api/v1/xiaohongshu/playwright/task/:taskId
Headers:
  X-API-Key: your_api_key

Response:
{
  "code": 200,
  "data": {
    "taskId": "12345",
    "status": "completed",  // waiting, active, completed, failed
    "progress": 100,
    "position": 0,
    "result": {
      "mode": "preview",
      "screenshot": "base64_image",  // 预览模式时返回
      "message": "预览已生成"
    }
  }
}
```

## 🔧 配置说明

### Playwright 服务配置

```bash
# playwright-service/.env

REDIS_HOST=localhost        # Redis 地址
REDIS_PORT=6379            # Redis 端口
PORT=3001                  # 服务端口
HEADLESS=true              # 无头模式
MAX_WORKERS=10             # 最大 Worker 数量
BROWSER_POOL_SIZE=10       # 浏览器池大小
COOKIE_DIR=./cookies       # Cookie 存储目录
```

### Go 后端配置

```bash
# .env

PLAYWRIGHT_SERVICE_URL=http://localhost:3001  # Playwright 服务地址
DB_HOST=localhost                              # 数据库地址
CLAUDE_API_KEY=your_key                        # Claude API Key
```

## 📊 成本与性能

### 并发能力

| 配置 | 并发用户 | 处理速度 | 服务器成本 |
|-----|---------|---------|-----------|
| 10 Workers | 10-20 | 1200 任务/小时 | $40/月 |
| 20 Workers | 50-100 | 2400 任务/小时 | $80/月 |
| 50 Workers | 200-500 | 6000 任务/小时 | $150/月 |

### 资源消耗

- **单个浏览器实例**：~300MB 内存
- **10 个浏览器池**：~3GB 内存
- **Redis**：~50MB 内存
- **Go 后端**：~100MB 内存

**总计**：4 核 8GB 服务器可支持 100 并发用户

## 🛡️ 安全性

### Cookie 管理
- 用户 Cookie 独立存储：`cookies/{userId}.json`
- 不同用户的 Cookie 完全隔离
- 建议生产环境加密存储

### API 认证
- 支持 API Key 认证
- 支持 JWT Token 认证
- 请求频率限制（可配置）

### 数据隔离
- 每个用户独立的 BrowserContext
- Cookie 自动加载/保存
- 任务队列按用户隔离

## 🐛 故障排查

### 1. Playwright 服务无法启动

**问题**：提示 Chromium 未找到

**解决**：
```bash
# 手动安装 Playwright
cd playwright-service
npx playwright install chromium
```

### 2. Redis 连接失败

**问题**：`ECONNREFUSED localhost:6379`

**解决**：
```bash
# 检查 Redis 是否运行
docker ps | grep redis

# 启动 Redis
docker run -d -p 6379:6379 redis:7-alpine
```

### 3. 任务一直排队

**问题**：任务状态停留在 `waiting`

**解决**：
```bash
# 检查 Worker 是否启动
curl http://localhost:3001/health

# 查看 Playwright 服务日志
docker-compose logs playwright-service
```

### 4. 预览截图失败

**问题**：预览模式返回空白截图

**解决**：
- 检查小红书是否登录成功
- 检查浏览器是否有足够权限
- 尝试非 headless 模式调试：`HEADLESS=false`

## 📝 开发指南

### 添加新功能

1. **后端 API**：
   - 在 `internal/api/playwright.go` 添加新的 handler
   - 在 `internal/api/router.go` 注册路由

2. **Playwright 逻辑**：
   - 在 `playwright-service/src/xiaohongshu.js` 添加自动化逻辑
   - 在 `playwright-service/src/server.js` 添加 API 端点

3. **前端集成**：
   - 在 `prome-platform/src/pages/XiaohongshuMarketing_new.tsx` 调用 API

### 测试

```bash
# 后端测试
go test ./...

# Playwright 服务测试
cd playwright-service
npm test

# 前端测试
cd prome-platform
npm run test
```

## 🚢 部署到生产环境

### 使用 Docker Compose

```bash
# 1. 拉取代码
git pull origin main

# 2. 配置生产环境变量
cp .env.example .env
# 编辑 .env，设置生产配置

# 3. 构建并启动
docker-compose -f docker-compose.yml up -d --build

# 4. 查看状态
docker-compose ps
docker-compose logs -f
```

### 使用 Zeabur/Vercel

1. 将 Playwright 服务部署为独立服务
2. 设置环境变量 `PLAYWRIGHT_SERVICE_URL`
3. Go 后端通过 HTTP 调用 Playwright 服务

### 监控与日志

```bash
# 查看实时日志
docker-compose logs -f playwright-service
docker-compose logs -f go-backend

# 监控 Redis 队列
docker exec -it xiaohongshu-redis redis-cli
> LLEN bull:xiaohongshu-publish:waiting
```

## 📚 技术栈

### 后端
- **Go 1.21+** - 高性能 Web 服务
- **Gin** - HTTP 框架
- **GORM** - ORM 框架

### Playwright 服务
- **Node.js 18+** - 运行时
- **Playwright** - 浏览器自动化
- **BullMQ** - 消息队列
- **Express** - HTTP 服务

### 基础设施
- **Redis** - 消息队列 + 缓存
- **PostgreSQL** - 主数据库
- **Docker** - 容器化部署

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/xxx`
3. 提交代码：`git commit -m 'Add xxx'`
4. 推送分支：`git push origin feature/xxx`
5. 提交 Pull Request

## 📄 许可证

MIT License

## 🔗 相关项目

- [xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp) - 原始项目
- [Playwright](https://github.com/microsoft/playwright) - 浏览器自动化
- [BullMQ](https://github.com/taskforcesh/bullmq) - 消息队列

---

**注意**：本项目仅供学习交流使用，请遵守小红书平台规范，不要用于违规用途。
