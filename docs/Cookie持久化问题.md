# 🔴 严重问题：Cookie未持久化

## 问题描述

**Cookie保存成功，但服务重启后丢失！**

### 证据

1. **Cookie保存成功**（之前的日志）：
```
04:14:49 ✅ [Cookie保存] 成功保存Cookie到文件
04:14:49 Cookie大小: 3242 字节
```

2. **服务重启后Cookie丢失**（最新日志）：
```
04:50:22 [ProcessManager] Created empty cookies.json for user ...
04:50:22 🍪 [Cookie加载] Cookie大小: 2 字节  👈 只剩空数组[]
```

### 根本原因

**Cookie保存在容器的临时目录，Zeabur重启后被清空！**

```
Cookie路径: /app/playwright-service/mcp-router/cookies/{userId}/cookies.json
```

这个路径在容器里是**临时存储**，每次部署/重启都会清空！

## 🔧 解决方案

### 方案1：使用Zeabur Volumes（推荐）⭐

#### 步骤

1. **在Zeabur控制台配置Volume**：
   - 打开项目设置
   - 找到 "Volumes" 或"持久化存储"
   - 添加Volume：
     - Mount Path: `/data`
     - Size: 1GB（足够存储Cookie）

2. **修改Cookie保存路径**：

修改 `playwright-service/mcp-router/src/processManager.ts`:

```typescript
// 旧路径（临时）
const workDir = path.join(process.cwd(), 'cookies', userId);

// 新路径（持久化）
const workDir = process.env.COOKIE_DIR 
  ? path.join(process.env.COOKIE_DIR, userId)
  : path.join('/data/cookies', userId);  // Zeabur volume
```

3. **设置环境变量**（可选）：
```
COOKIE_DIR=/data/cookies
```

### 方案2：使用数据库存储Cookie

**优点**：
- 完全持久化
- 可以跨服务访问
- 自动备份

**缺点**：
- 需要修改较多代码
- 增加数据库查询

#### 实现

1. 在Supabase创建Cookie表
2. 修改Cookie保存/加载逻辑使用数据库
3. MCP Go也需要支持从数据库读取

### 方案3：使用环境变量（临时方案）

将Cookie base64编码后存储在环境变量中（不推荐，Cookie太大）。

## 📋 推荐实施

**立即使用方案1：Zeabur Volumes**

### 快速修复步骤

1. **在Zeabur添加Volume**
   - Volume名称: `cookie-storage`
   - Mount path: `/data`
   - Size: 1GB

2. **更新代码使用 `/data/cookies/`**

3. **重新部署**

4. **重新扫码登录**（之前的Cookie已丢失）

5. **验证**：重启服务后Cookie仍然存在

## ⚠️ 当前状态

**Cookie每次重启都会丢失！**

这就是为什么：
- 扫码登录成功 ✅
- Cookie保存成功 ✅
- 但检测不到登录状态 ❌（因为服务重启了，Cookie丢了）

## 🚀 下一步

**你现在有两个选择**：

### 选择A：立即修复持久化（推荐）

1. 我帮你修改代码使用 `/data/cookies/`
2. 你在Zeabur配置Volume挂载到 `/data`
3. 重新部署
4. 重新扫码登录
5. **完全解决问题！**

### 选择B：临时测试方案

保持服务运行，不要重启：
1. 现在扫码登录
2. 立即测试功能
3. 但一旦重启，Cookie就会丢失

---

**你选哪个？我推荐选择A，彻底解决问题！**

我可以立即帮你修改代码支持持久化存储。
