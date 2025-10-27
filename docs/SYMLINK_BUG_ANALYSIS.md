# 🔍 符号链接 Bug 完整流程分析

## 问题现象

**错误信息**:
```
EEXIST: file already exists, symlink '/app/playwright-service/mcp-router/cookies/user_1760873748455_hsrofz6nl/cookies.json' -> '/app/data/cookies.json'
```

**用户操作**: 点击"批准发布"按钮

---

## 完整调用链路分析

### 1. 前端 → 后端

**请求**:
```http
POST /agent/auto/approve/:userId
Body: { taskId: "xxx" }
```

**代码位置**: `claude-agent-service/src/server.ts:1380-1398`

```typescript
app.post('/agent/auto/approve/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;  // ← 从 URL 获取 userId
  const { taskId } = req.body;

  await autoContentManager.approveAndPublish(userId, taskId);
  // ...
});
```

### 2. autoContentManager.approveAndPublish()

**代码位置**: `claude-agent-service/src/autoContentManager.ts:2437-2509`

```typescript
public async approveAndPublish(userId: string, taskId?: string): Promise<void> {
  // 1. 查找用户的内容计划
  const plan = this.contentPlans.get(userId);

  // 2. 找到待发布的任务
  const task = taskId ? ... : plan.dailyTasks.find(t => t.status === 'ready');

  // 3. 调用发布函数
  await this.publishContent(userId, task, task.imageUrls);
}
```

### 3. autoContentManager.publishContent()

**代码位置**: `claude-agent-service/src/autoContentManager.ts:1814-1890`

```typescript
private async publishContent(userId: string, task: DailyTask, imageUrls: string[]): Promise<void> {
  // 调用 MCP 客户端
  const result = await this.mcpClient.publishContent(userId, {
    title: title,
    content: task.description,
    images: imageUrls,
    tags: task.hashtags,
    type: actualContentType
  });
}
```

### 4. mcpClient.publishContent()

**代码位置**: `claude-agent-service/src/mcpAuthClient.ts:162-213`

```typescript
async publishContent(userId: string, content: { ... }): Promise<MCPPublishResult> {
  // 向 MCP Router 发送请求
  const response = await axios.post(`${this.mcpRouterUrl}/mcp/call`, {
    userId,  // ← userId 继续传递
    toolName: 'xiaohongshu_publish_content',
    arguments: content
  }, {
    timeout: 600000  // 10 分钟
  });
}
```

### 5. MCP Router: POST /mcp/call

**代码位置**: `mcp-router/src/httpServer.ts:54-124`

```typescript
app.post('/mcp/call', async (req, res) => {
  const { userId, toolName, arguments: args } = req.body;

  // 映射工具名到端点
  const endpoint = toolToEndpoint[toolName];
  // xiaohongshu_publish_content -> { path: '/api/v1/publish', method: 'POST' }

  // 构造请求数据
  const requestData = {
    userId,
    ...(args || {})
  };

  // 调用 ProcessManager
  const result = await processManager.callTool(
    userId,           // ← 正确的 userId
    endpoint.path,    // '/api/v1/publish'
    endpoint.method,  // 'POST'
    requestData       // { userId, title, content, images, tags, type }
  );
});
```

### 6. processManager.callTool()

**代码位置**: `mcp-router/src/processManager.ts:294-360`

```typescript
async callTool(userId: string, endpoint: string, method: string = 'POST', data?: any): Promise<any> {
  // 1. 获取或创建用户进程
  const port = await this.getOrCreateProcess(userId);  // ← 正确的 userId

  // 2. 🔥 创建符号链接（问题所在！）
  this.ensureCookieSymlink(userId);  // ← 正确的 userId

  // 3. 调用 MCP binary
  const url = `http://localhost:${port}${endpoint}`;
  const response = await axios({ method, url, data, timeout: 600000 });

  return response.data;
}
```

### 7. processManager.ensureCookieSymlink()

**代码位置**: `mcp-router/src/processManager.ts:265-289`

```typescript
private ensureCookieSymlink(userId: string): void {
  const userCookieFile = path.join(this.cookieDir, userId, 'cookies.json');
  // 例如: /app/playwright-service/mcp-router/cookies/user_1760873748455_hsrofz6nl/cookies.json

  const mcpExpectedPath = '/app/data/cookies.json';

  try {
    // 确保目录存在
    if (!fs.existsSync(mcpDataDir)) {
      fs.mkdirSync(mcpDataDir, { recursive: true });
    }

    // 🔥 BUG: 这里检查失效！
    if (fs.existsSync(mcpExpectedPath)) {  // ← 对失效符号链接返回 false
      fs.unlinkSync(mcpExpectedPath);
    }

    // 🔥 直接创建符号链接，但文件已存在！
    fs.symlinkSync(userCookieFile, mcpExpectedPath);  // ← EEXIST 错误！
  } catch (symlinkError) {
    throw symlinkError;
  }
}
```

---

## 🔴 根本问题分析

### Bug #1: `fs.existsSync()` 无法检测失效符号链接

**问题**:
```typescript
if (fs.existsSync(mcpExpectedPath)) {  // ← 失效符号链接返回 false
  fs.unlinkSync(mcpExpectedPath);
}
```

**场景**:
1. `/app/data/cookies.json` 是一个符号链接
2. 它指向 `/app/playwright-service/mcp-router/cookies/test/cookies.json`
3. 但是 `test/cookies.json` **不存在**
4. `fs.existsSync('/app/data/cookies.json')` 返回 **false**（因为跟随符号链接检查目标文件）
5. 跳过 `unlinkSync`
6. 尝试 `symlinkSync` → **EEXIST 错误**

**验证**:
```javascript
const fs = require('fs');

// 创建指向不存在文件的符号链接
fs.symlinkSync('/nonexistent', '/tmp/broken-link');

console.log(fs.existsSync('/tmp/broken-link'));          // false ← Bug!
console.log(fs.lstatSync('/tmp/broken-link').isSymbolicLink());  // true
```

### Bug #2: test 用户数据从哪里来？

**可能原因**:

1. **旧的测试代码残留**
   - 之前的代码可能有硬编码的 `userId = 'test'`
   - 旧的符号链接没有清理

2. **之前的 startProcess 创建的**
   - 之前的代码在 `startProcess` 中创建符号链接
   - Test 用户进程启动时创建了符号链接
   - 进程退出后符号链接依然存在

3. **手动测试时创建**
   - 开发测试时使用 `test` 作为 userId
   - 符号链接被创建但从未清理

### Bug #3: 符号链接生命周期管理错误

**当前问题**:
- 符号链接在 Docker 容器的 `/app/data/cookies.json`（全局唯一）
- 多个用户共享同一个路径
- 需要动态创建和清理

**错误的设计**（已修复但有新 bug）:
- ❌ 在 `startProcess` 创建 → 多用户冲突
- ✅ 在 `callTool` 创建 → 正确
- ❌ 清理逻辑错误 → `existsSync` 无法检测失效符号链接

---

## 🎯 真实 userId 流程验证

### 1. 用户登录时的 userId

**登录接口**: `POST /agent/auto/login`

```typescript
// claude-agent-service/src/server.ts
app.post('/agent/auto/login', async (req: Request, res: Response) => {
  const userId = `user_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  // 例如: user_1760873748455_hsrofz6nl

  // 保存 userId
  req.session.userId = userId;

  // 返回给前端
  res.json({ userId, ... });
});
```

### 2. 前端存储 userId

```javascript
// 前端代码
const loginResponse = await fetch('/agent/auto/login', ...);
const { userId } = await loginResponse.json();
localStorage.setItem('userId', userId);
```

### 3. 发布时使用 userId

```javascript
// 前端代码
const userId = localStorage.getItem('userId');
await fetch(`/agent/auto/approve/${userId}`, {
  method: 'POST',
  body: JSON.stringify({ taskId })
});
```

**结论**: userId 在整个链路中都是正确传递的，**没有任何地方硬编码 'test'**。

---

## 🔍 test 用户符号链接的来源追踪

### 可能性1: 之前的代码版本

**旧的 processManager.ts**（已在 commit 690e62f 修改）:

```typescript
// startProcess 方法中创建符号链接
private async startProcess(userId: string): Promise<ManagedProcess> {
  // ...

  // 🔥 这里会为每个用户创建符号链接
  const mcpExpectedPath = '/app/data/cookies.json';
  fs.symlinkSync(cookiesFile, mcpExpectedPath);
  // ↑ test 用户启动进程时创建了符号链接

  // ...
}
```

**时间线**:
1. 某个时刻，test 用户进程启动
2. 创建符号链接：`/app/data/cookies.json -> .../cookies/test/cookies.json`
3. test 用户退出/删除，但符号链接依然存在
4. test/cookies.json 文件被删除或不存在
5. 符号链接变成**失效符号链接**
6. 真实用户 `user_1760873748455_hsrofz6nl` 尝试发布
7. `ensureCookieSymlink` 无法检测到失效符号链接
8. EEXIST 错误

### 可能性2: 测试代码或配置

**搜索 "test" 用户的使用**:

```bash
grep -r "userId.*=.*['\"]test['\"]" playwright-service/
grep -r "test.*user" playwright-service/
```

**需要检查**:
- 是否有测试文件使用硬编码的 `test` userId
- 是否有配置文件指定默认 userId
- 是否有脚本或工具创建测试数据

---

## ✅ 正确的修复方案

### 方案1: 使用 lstatSync 检测符号链接

```typescript
private ensureCookieSymlink(userId: string): void {
  const userCookieFile = path.join(this.cookieDir, userId, 'cookies.json');
  const mcpExpectedPath = '/app/data/cookies.json';
  const mcpDataDir = '/app/data';

  try {
    // 确保目录存在
    if (!fs.existsSync(mcpDataDir)) {
      fs.mkdirSync(mcpDataDir, { recursive: true });
    }

    // ✅ FIX: 使用 lstatSync 检测符号链接本身
    try {
      const stats = fs.lstatSync(mcpExpectedPath);
      if (stats.isSymbolicLink() || stats.isFile() || stats.isDirectory()) {
        fs.unlinkSync(mcpExpectedPath);
        console.log(`[ProcessManager] Removed existing symlink/file: ${mcpExpectedPath}`);
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;  // 非"文件不存在"错误，抛出
      }
      // ENOENT: 文件不存在，可以继续创建
    }

    // 创建新的符号链接
    fs.symlinkSync(userCookieFile, mcpExpectedPath);
    console.log(`[ProcessManager] ✅ Created cookie symlink for user ${userId}: ${mcpExpectedPath} -> ${userCookieFile}`);
  } catch (symlinkError) {
    console.error(`[ProcessManager] ❌ Failed to create cookie symlink for user ${userId}:`, symlinkError);
    throw symlinkError;
  }
}
```

### 方案2: 强制删除（使用 unlinkSync + 错误处理）

```typescript
// 强制删除，忽略不存在的错误
try {
  fs.unlinkSync(mcpExpectedPath);
} catch (err: any) {
  if (err.code !== 'ENOENT') {
    throw err;
  }
}

// 然后创建
fs.symlinkSync(userCookieFile, mcpExpectedPath);
```

### 方案3: 清理所有旧的测试数据

```bash
# 进入 Docker 容器
docker exec -it <container-id> /bin/sh

# 删除 test 用户的符号链接和数据
rm -f /app/data/cookies.json
rm -rf /app/playwright-service/mcp-router/cookies/test

# 删除所有用户的 cookies 并重新登录
rm -rf /app/playwright-service/mcp-router/cookies/*
```

---

## 📊 问题优先级

| 问题 | 严重性 | 影响范围 | 修复优先级 |
|------|--------|----------|-----------|
| `existsSync` 无法检测失效符号链接 | 🔴 Critical | 所有用户发布 | P0 - 立即修复 |
| test 用户数据残留 | 🟡 Important | 第一次发布 | P1 - 清理数据 |
| 符号链接生命周期管理 | 🟢 Low | 边缘情况 | P2 - 优化 |

---

## 🚀 推荐修复步骤

### 立即修复（P0）

1. ✅ 修改 `ensureCookieSymlink` 使用 `lstatSync`
2. ✅ 测试失效符号链接场景
3. ✅ 部署到 Docker

### 清理数据（P1）

1. 删除 `/app/data/cookies.json`
2. 清理所有测试用户的 cookies 目录
3. 确保只保留真实用户数据

### 代码审查（P2）

1. 检查是否有其他地方硬编码 'test' userId
2. 添加单元测试覆盖失效符号链接场景
3. 添加日志记录符号链接的创建和删除

---

## 📝 总结

### 根本原因

1. **技术原因**: `fs.existsSync()` 无法检测失效符号链接
2. **历史原因**: test 用户数据残留在系统中
3. **设计问题**: 符号链接清理逻辑不完善

### 用户要求

> 我不要任何的测试数据，我要真实用户，真实数据。

**解决方案**:
1. 修复符号链接检测逻辑（使用 `lstatSync`）
2. 清理所有测试数据
3. 确保只有真实用户登录后才创建 cookies

### 下一步

1. **暂停部署** - 不要立即修改代码
2. **理解流程** - 确认所有调用链路都清晰
3. **确认修复方案** - 与用户确认修复方向
4. **测试验证** - 修复后验证所有场景
