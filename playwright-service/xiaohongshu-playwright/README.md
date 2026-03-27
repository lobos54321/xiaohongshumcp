# 小红书 Playwright 自动化服务

基于 Playwright 的小红书自动化服务，提供稳定可靠的登录、发布等功能。

## ✨ 特性

- ✅ **稳定可靠** - 基于微软 Playwright，成熟稳定
- ✅ **多用户隔离** - 每个用户独立的浏览器上下文和 Cookie
- ✅ **全 TypeScript** - 类型安全，易于调试
- ✅ **REST API** - 标准 HTTP 接口，易于集成
- ✅ **无头模式** - 支持服务器环境运行
- ✅ **反检测** - 内置反爬虫检测脚本

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 安装 Playwright 浏览器

```bash
npx playwright install chromium
```

### 3. 启动服务

```bash
# 开发模式（带热更新）
npm run dev

# 生产模式
npm run build
npm start
```

服务将在 `http://localhost:3001` 启动。

### 4. 环境变量（可选）

创建 `.env` 文件：

```env
PORT=3001
HEADLESS=true
COOKIES_DIR=./data/cookies
```

## 📡 API 接口

### 健康检查

```bash
GET /health
```

### 获取登录二维码

```bash
POST /login/qrcode
Content-Type: application/json

{
  "userId": "user123"
}
```

响应：
```json
{
  "success": true,
  "data": {
    "qrCodeUrl": "data:image/png;base64,...",
    "qrCodeBase64": "..."
  }
}
```

### 检查登录状态

```bash
POST /login/check
Content-Type: application/json

{
  "userId": "user123"
}
```

响应：
```json
{
  "success": true,
  "data": {
    "isLoggedIn": true,
    "username": "用户名"
  }
}
```

### 等待扫码登录

```bash
POST /login/wait
Content-Type: application/json

{
  "userId": "user123",
  "timeout": 120000
}
```

### 发布图文

```bash
POST /publish/images
Content-Type: application/json

{
  "userId": "user123",
  "title": "今日份的咖啡☕️",
  "content": "在这家咖啡店待了一下午，氛围真的很好~",
  "images": [
    "/path/to/image1.jpg",
    "/path/to/image2.jpg"
  ],
  "hashtags": ["咖啡店探店", "北京美食"],
  "location": "北京三里屯"
}
```

响应：
```json
{
  "success": true,
  "data": {
    "success": true,
    "postUrl": "https://www.xiaohongshu.com/explore/..."
  }
}
```

### 登出

```bash
POST /login/logout
Content-Type: application/json

{
  "userId": "user123"
}
```

## 🔧 与现有项目集成

### 方式1: 替换 MCP Router

直接将 `claude-agent-service` 调用此服务，而不是 MCP Router：

```typescript
// claude-agent-service/src/xiaohongshuClient.ts
import axios from 'axios';

const PLAYWRIGHT_SERVICE_URL = 'http://localhost:3001';

export async function publishImages(userId: string, params: any) {
  const response = await axios.post(
    `${PLAYWRIGHT_SERVICE_URL}/publish/images`,
    { userId, ...params }
  );
  return response.data;
}
```

### 方式2: 集成到 Claude Agent

为 Claude Agent 添加工具定义：

```typescript
const tools = [
  {
    name: 'xiaohongshu_publish_images',
    description: '发布图文内容到小红书',
    input_schema: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
        images: { type: 'array', items: { type: 'string' } },
        hashtags: { type: 'array', items: { type: 'string' } }
      }
    }
  }
];
```

## 📊 与旧方案对比

| 维度 | 旧方案 (Go MCP) | **新方案 (Playwright)** |
|------|----------------|----------------------|
| **稳定性** | ❌ 频繁超时 | ✅ 稳定可靠 |
| **调试** | ❌ Go+TS混合 | ✅ 纯 TypeScript |
| **性能** | ❌ 多层代理 | ✅ 直接操作 |
| **开发速度** | ❌ 需重新编译 | ✅ 热更新 |
| **部署** | ❌ 编译二进制 | ✅ npm install |

## 🛠️ 开发指南

### 项目结构

```
src/
├── XiaohongshuBrowser.ts   # 浏览器管理
├── LoginService.ts         # 登录服务
├── PublishService.ts       # 发布服务
└── server.ts               # HTTP 服务器
```

### 调试模式

设置 `HEADLESS=false` 可以看到浏览器窗口：

```bash
HEADLESS=false npm run dev
```

### 自定义选择器

如果小红书页面结构变化，修改对应服务中的选择器：

```typescript
// LoginService.ts
const qrCodeLocator = page.locator('.qrcode img, .login-qrcode img');
```

## 📝 TODO

- [ ] 视频发布功能
- [ ] 内容搜索功能
- [ ] 用户资料获取
- [ ] 评论功能
- [ ] 数据统计
- [ ] 单元测试

## 📄 许可证

MIT
