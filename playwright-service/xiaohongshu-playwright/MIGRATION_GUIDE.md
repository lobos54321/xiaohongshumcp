# 从 MCP 方案迁移到 Playwright 方案

本指南帮助你从旧的 `xiaohongshu-mcp` (Go) 方案迁移到新的 Playwright 方案。

## 🎯 为什么要迁移？

### 旧方案的问题

1. ❌ **稳定性差** - 频繁出现超时、Socket hang up
2. ❌ **调试困难** - Go + TypeScript 混合，错误追踪复杂
3. ❌ **部署复杂** - 需要编译 Go 二进制，缓存问题频发
4. ❌ **维护成本高** - 多层架构，问题定位困难

### 新方案的优势

1. ✅ **稳定可靠** - Playwright 成熟稳定，微软维护
2. ✅ **纯 TypeScript** - 全栈统一，易于调试
3. ✅ **直接操作** - 无中间层，性能更好
4. ✅ **开发快速** - 热更新，即改即用

---

## 📋 迁移步骤

### Phase 1: 安装并测试新服务（1-2小时）

#### 1. 安装新服务

```bash
cd playwright-service/xiaohongshu-playwright
npm install
npx playwright install chromium
```

#### 2. 启动服务

```bash
# 开发模式（可以看到浏览器窗口）
HEADLESS=false npm run dev
```

#### 3. 测试基本功能

```bash
# 在另一个终端运行测试
node test-example.js
```

按照提示扫码登录，验证功能是否正常。

---

### Phase 2: 修改 Claude Agent 调用（2-4小时）

#### 方案A: 创建新的客户端（推荐）

在 `claude-agent-service/src/` 创建新文件 `XiaohongshuPlaywrightClient.ts`:

```typescript
import axios from 'axios';

export class XiaohongshuPlaywrightClient {
  private baseURL = 'http://localhost:3001';

  async getQRCode(userId: string) {
    const res = await axios.post(`${this.baseURL}/login/qrcode`, { userId });
    return res.data;
  }

  async checkLoginStatus(userId: string) {
    const res = await axios.post(`${this.baseURL}/login/check`, { userId });
    return res.data;
  }

  async publishImages(userId: string, params: {
    title: string;
    content: string;
    images: string[];
    hashtags?: string[];
  }) {
    const res = await axios.post(`${this.baseURL}/publish/images`, {
      userId,
      ...params
    });
    return res.data;
  }

  // ... 其他方法
}
```

#### 方案B: 修改现有调用

找到 `claude-agent-service` 中调用 MCP Router 的地方，替换为调用新服务：

```typescript
// 旧代码
const mcpClient = new MCPAuthClient(/* ... */);
const result = await mcpClient.callTool('xiaohongshu_publish_content', params);

// 新代码
const playwrightClient = new XiaohongshuPlaywrightClient();
const result = await playwrightClient.publishImages(userId, params);
```

---

### Phase 3: 修改工具定义（1-2小时）

更新 Claude Agent 的工具定义，使其调用新的 Playwright 服务：

```typescript
// claude-agent-service/src/claudeAgentHTTP.ts

const tools = [
  {
    name: 'xiaohongshu_publish_images',
    description: '发布图文内容到小红书',
    input_schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: '用户ID' },
        title: { type: 'string', description: '标题' },
        content: { type: 'string', description: '正文内容' },
        images: {
          type: 'array',
          items: { type: 'string' },
          description: '图片文件路径数组'
        },
        hashtags: {
          type: 'array',
          items: { type: 'string' },
          description: '话题标签（可选）'
        }
      },
      required: ['userId', 'title', 'content', 'images']
    }
  },
  {
    name: 'xiaohongshu_check_login',
    description: '检查小红书登录状态',
    input_schema: {
      type: 'object',
      properties: {
        userId: { type: 'string' }
      },
      required: ['userId']
    }
  },
  {
    name: 'xiaohongshu_get_qrcode',
    description: '获取小红书登录二维码',
    input_schema: {
      type: 'object',
      properties: {
        userId: { type: 'string' }
      },
      required: ['userId']
    }
  }
];
```

---

### Phase 4: 数据迁移（1小时）

#### 迁移现有用户的 Cookie

旧的 Cookie 存储在 `mcp-router/cookies/{userId}/cookies.json`，需要转换格式：

```typescript
// 迁移脚本示例
import * as fs from 'fs';
import * as path from 'path';

async function migrateCookies() {
  const oldCookiesDir = './mcp-router/cookies';
  const newCookiesDir = './xiaohongshu-playwright/data/cookies';

  const users = fs.readdirSync(oldCookiesDir);

  for (const userId of users) {
    const oldPath = path.join(oldCookiesDir, userId, 'cookies.json');
    const newPath = path.join(newCookiesDir, `${userId}.json`);

    if (fs.existsSync(oldPath)) {
      const oldCookies = JSON.parse(fs.readFileSync(oldPath, 'utf-8'));

      // 转换为 Playwright storageState 格式
      const storageState = {
        cookies: oldCookies.map((c: any) => ({
          name: c.name,
          value: c.value,
          domain: c.domain || '.xiaohongshu.com',
          path: c.path || '/',
          expires: c.expires || -1,
          httpOnly: c.httpOnly || false,
          secure: c.secure || false,
          sameSite: c.sameSite || 'Lax'
        })),
        origins: []
      };

      fs.writeFileSync(newPath, JSON.stringify(storageState, null, 2));
      console.log(`✅ 已迁移用户 ${userId} 的 Cookie`);
    }
  }
}

migrateCookies();
```

---

### Phase 5: 部署配置（1-2小时）

#### 更新 `start.sh`

```bash
#!/bin/bash

# 启动 Playwright 服务
cd playwright-service/xiaohongshu-playwright
npm install
npm run build
npm start &

# 启动 Claude Agent 服务
cd ../claude-agent-service
npm install
npm run build
npm start &

wait
```

#### 更新 Dockerfile

```dockerfile
FROM node:18-alpine

# 安装 Playwright 依赖
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# 设置环境变量
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# 复制项目文件
WORKDIR /app
COPY . .

# 安装依赖
RUN cd playwright-service/xiaohongshu-playwright && npm install && npm run build
RUN cd playwright-service/claude-agent-service && npm install && npm run build

# 启动脚本
CMD ["./start.sh"]
```

---

## ✅ 迁移验证清单

完成迁移后，检查以下项目：

- [ ] Playwright 服务可以正常启动
- [ ] 登录流程正常（获取二维码、扫码、检查状态）
- [ ] 发布功能正常（图文发布）
- [ ] Claude Agent 可以调用新服务
- [ ] 多用户隔离正常工作
- [ ] Cookie 持久化正常
- [ ] 错误处理和日志完整

---

## 🔄 回滚计划

如果迁移出现问题，可以快速回滚：

1. 停止新服务
2. 重启旧的 MCP Router 和 Claude Agent
3. 恢复原来的代码

保留旧代码至少2周，确保新方案稳定后再删除。

---

## 📊 性能对比

迁移后预期改进：

| 指标 | 旧方案 | 新方案 | 改进 |
|------|--------|--------|------|
| 发布成功率 | ~60% | ~95% | +58% |
| 平均响应时间 | 30-60s | 15-30s | -50% |
| 超时错误 | 频繁 | 极少 | -90% |
| 部署时间 | 10-15分钟 | 3-5分钟 | -66% |

---

## 🆘 常见问题

### Q: 迁移需要多长时间？

A: 预计 6-10 小时（包括测试）。建议分阶段进行，先测试再上线。

### Q: 会影响现有用户吗？

A: 需要用户重新扫码登录一次（Cookie 格式不同）。提前通知用户。

### Q: 如果页面结构变化怎么办？

A: 修改 `LoginService.ts` 和 `PublishService.ts` 中的选择器即可，比修改 Go 代码简单很多。

### Q: 性能会更好吗？

A: 是的。少了 MCP 中间层，直接操作浏览器，响应更快。

---

## 📞 支持

迁移过程中遇到问题，可以：

1. 查看日志: `npm run dev` 启动服务查看详细日志
2. 调试模式: `HEADLESS=false npm run dev` 可以看到浏览器操作
3. 查看测试示例: `node test-example.js`

---

**迁移愉快！** 🚀
