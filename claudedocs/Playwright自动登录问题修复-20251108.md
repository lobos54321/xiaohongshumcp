# 🔥 问题分析：Playwright弹窗二维码自动登录

## 问题描述
用户点击退出登录后，点击一键登录，弹出二维码，**还没扫码就自动登录了**。

## 根本原因

**Playwright launchPersistentContext 会自动加载用户数据目录中的Cookie**

```typescript
// server.ts:238-253
const tempUserDataDir = `/tmp/playwright-${userId}-${Date.now()}`;
const context = await chromium.launchPersistentContext(tempUserDataDir, {
  headless: false,
  ...
});
```

### 问题链条

1. **第一次登录成功** → Playwright自动保存Cookie到 `/tmp/playwright-${userId}-${timestamp}/`
2. **用户退出登录** → 
   - ✅ 数据库Cookie已删除
   - ✅ MCP Router Cookie已删除  
   - ❌ **Playwright临时目录中的Cookie还在！**
3. **再次点击一键登录** → 
   - 创建新的 `/tmp/playwright-${userId}-${newTimestamp}/` 目录
   - ❌ **但如果旧目录还在，或者浏览器会话复用，Cookie会被自动加载**
4. **结果** → 浏览器自动登录，不需要扫码

## 验证证据

### 1. launchPersistentContext 的行为
根据Playwright文档，`launchPersistentContext`会：
- 自动保存所有Cookie到用户数据目录
- 启动时自动加载用户数据目录中的所有Cookie
- 每次会话结束时持久化Cookie

### 2. 代码中的问题点

**问题1：临时目录未清理** (server.ts:238)
```typescript
const tempUserDataDir = `/tmp/playwright-${userId}-${Date.now()}`;
```
- 虽然每次用新时间戳，但旧目录可能还存在
- 如果进程崩溃或异常，旧目录永远不会被清理

**问题2：disposeSession清理不完整** 
```typescript
private async disposeSession(userId: string): Promise<void> {
    const session = this.sessions.get(userId);
    if (!session) return;

    // 清理定时器
    if (session.checkTimer) clearInterval(session.checkTimer);
    if (session.timeoutTimer) clearTimeout(session.timeoutTimer);

    // 关闭浏览器
    try {
        await session.context.close();
    } catch (error) {
        console.warn(`[PlaywrightLogin] Close context failed:`, error);
    }

    this.sessions.delete(userId);
    
    // ❌ 缺少：删除 tempUserDataDir 目录
}
```

**问题3：检测已登录的逻辑会误判** (server.ts:313-357)
```typescript
private async checkIfAlreadyLoggedIn(page: Page): Promise<boolean> {
    // 检查登录标识、URL、页面文本
    // ❌ 但这是在页面加载后检查，Cookie已经在浏览器中了
}
```

## 修复方案

### 方案1：启动前清理所有旧的Playwright目录 ✅ 推荐

```typescript
private async launchSession(userId: string): Promise<LoginSession> {
    await ensurePlaywrightChromiumInstalled();

    // 🔥 FIX: 清理所有旧的Playwright临时目录
    const tempDirPattern = `/tmp/playwright-${userId}-*`;
    console.log(`[PlaywrightLogin] 🧹 清理旧的临时目录: ${tempDirPattern}`);
    
    try {
        const { execSync } = require('child_process');
        execSync(`rm -rf ${tempDirPattern}`, { stdio: 'ignore' });
    } catch (error) {
        console.warn(`[PlaywrightLogin] 清理旧目录失败:`, error);
    }

    // 创建新的临时目录
    const tempUserDataDir = `/tmp/playwright-${userId}-${Date.now()}`;
    console.log(`[PlaywrightLogin] 创建新的用户数据目录: ${tempUserDataDir}`);

    const context = await chromium.launchPersistentContext(tempUserDataDir, {
        headless: false,
        ...
    });
    
    // ... 其余代码
}
```

### 方案2：退出时清理临时目录

```typescript
private async disposeSession(userId: string): Promise<void> {
    const session = this.sessions.get(userId);
    if (!session) return;

    // 清理定时器
    if (session.checkTimer) clearInterval(session.checkTimer);
    if (session.timeoutTimer) clearTimeout(session.timeoutTimer);

    // 关闭浏览器
    try {
        await session.context.close();
    } catch (error) {
        console.warn(`[PlaywrightLogin] Close context failed:`, error);
    }

    // 🔥 FIX: 清理临时用户数据目录
    if (session.tempUserDataDir) {
        console.log(`[PlaywrightLogin] 🧹 清理临时目录: ${session.tempUserDataDir}`);
        try {
            const fs = require('fs');
            fs.rmSync(session.tempUserDataDir, { recursive: true, force: true });
        } catch (error) {
            console.warn(`[PlaywrightLogin] 清理临时目录失败:`, error);
        }
    }

    this.sessions.delete(userId);
}
```

### 方案3：退出登录时强制清理Playwright目录

```typescript
// 在 /agent/xiaohongshu/logout 端点中添加
app.post('/agent/xiaohongshu/logout/:userId', async (req: Request, res: Response) => {
    // ... 现有退出逻辑 ...
    
    // 🔥 FIX: 清理Playwright临时目录
    const tempDirPattern = `/tmp/playwright-${userId}-*`;
    console.log(`[XHS Logout] 🧹 清理Playwright临时目录: ${tempDirPattern}`);
    
    try {
        const { execSync } = require('child_process');
        execSync(`rm -rf ${tempDirPattern}`, { stdio: 'ignore' });
        console.log(`[XHS Logout] ✅ Playwright临时目录已清理`);
    } catch (error) {
        console.warn(`[XHS Logout] 清理Playwright临时目录失败:`, error);
    }
    
    // ... 返回响应
});
```

## 推荐实施

**三管齐下，确保万无一失**：

1. ✅ **启动前清理** (方案1) - 防止旧目录干扰
2. ✅ **会话结束清理** (方案2) - 正常退出时清理
3. ✅ **退出登录清理** (方案3) - 用户主动退出时清理

## 测试验证

修复后测试步骤：
1. 点击退出登录
2. 点击一键登录
3. 观察弹出的二维码窗口
4. **不扫码**，等待30秒
5. 检查是否仍然显示"请扫码登录"状态

预期结果：
- ✅ 不会自动登录
- ✅ 二维码一直有效
- ✅ 只有扫码后才会登录
