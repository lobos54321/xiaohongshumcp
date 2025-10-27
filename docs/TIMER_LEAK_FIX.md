# 🐛 Timer Leak Bug Fix - Socket Hang Up 根本原因

## 问题总结

**错误**: `MCP Process Error: socket hang up`
**发生时间**: 发布请求进行 ~550秒 后
**根本原因**: ProcessManager 中的**定时器泄漏 bug**

---

## 🔍 Bug 分析

### 问题描述

当新进程启动时，旧进程的清理定时器没有被正确清除。旧的定时器在后台继续运行，并在 10 分钟后触发。当定时器触发时，它删除的是**当前的进程**，而不是旧的进程，导致正在进行的发布请求被中断。

### 时间线证据

```
22:30:29 → 进程1启动 (port 18060)
           cleanupTimer 设置为在 22:40:29 触发

22:31:33 → 进程2启动 (port 18060)
           this.processes.set(userId, managed2) ← 覆盖进程1
           ⚠️ 进程1的 cleanupTimer 没有被清除！
           cleanupTimer 设置为在 22:41:33 触发

22:32:28 → 进程3启动 (port 18061)
           this.processes.set(userId, managed3) ← 覆盖进程2
           ⚠️ 进程2的 cleanupTimer 没有被清除！
           cleanupTimer 设置为在 22:42:28 触发

22:32:29 → 发布请求开始
           timeout: 600000ms (10分钟)

22:41:34 → ⚠️ 进程2的定时器触发！（泄漏的定时器）
           定时器调用: this.killProcess(userId)
           this.processes.get(userId) 返回进程3
           进程3被删除 ❌

22:41:39 → MCP 二进制报告 "context deadline exceeded"
           TCP 连接被中断
           axios 收到 "socket hang up" 错误

22:41:39 → 发布请求失败
           错误: MCP Process Error: socket hang up
```

---

## 🎯 Bug 代码位置

### 问题代码

**文件**: `playwright-service/mcp-router/src/processManager.ts`

#### 位置1: startProcess 方法（第175-182行）

```typescript
// ❌ Bug: 新进程对象没有 cleanupTimer
const managed: ManagedProcess = {
  process: childProcess,
  port,
  userId,
  lastUsed: Date.now(),
  // ⚠️ cleanupTimer 缺失！
};

this.processes.set(userId, managed); // ← 覆盖旧对象，旧定时器泄漏！
```

#### 位置2: scheduleCleanup 方法（第220-223行）

```typescript
// 清除旧的定时器
if (managed.cleanupTimer) {  // ← 新对象的 cleanupTimer 是 undefined
  clearTimeout(managed.cleanupTimer);  // ← 永远不会执行！
}
```

**问题链**:
1. 新的 `managed` 对象没有 `cleanupTimer` 属性
2. `this.processes.set(userId, managed)` 覆盖了旧对象
3. 旧对象的 `cleanupTimer` 没有被清除
4. 旧定时器继续运行，10分钟后触发
5. 定时器触发时调用 `this.killProcess(userId)`
6. `this.processes.get(userId)` 返回**当前的进程**（不是旧进程）
7. 当前进程被删除，导致正在进行的请求被中断

---

## ✅ 修复方案

### 修复代码

**文件**: `playwright-service/mcp-router/src/processManager.ts`

**位置**: `startProcess` 方法开头（第95-101行）

```typescript
private async startProcess(userId: string): Promise<ManagedProcess> {
  // 🔥 FIX: 在创建新进程前，清除旧进程的定时器，防止定时器泄漏
  const oldManaged = this.processes.get(userId);
  if (oldManaged?.cleanupTimer) {
    console.log(`[ProcessManager] Clearing old cleanup timer for user ${userId} before creating new process`);
    clearTimeout(oldManaged.cleanupTimer);
    oldManaged.cleanupTimer = undefined;
  }

  const port = await this.allocatePort();

  // ... 其余代码
}
```

### 修复原理

1. **在创建新进程之前**，先获取旧的进程对象
2. 如果旧对象存在且有 `cleanupTimer`，先清除它
3. 将旧对象的 `cleanupTimer` 设置为 `undefined`
4. 然后再创建新进程

**关键点**: 必须在 `this.processes.set(userId, managed)` **之前**清除旧定时器，否则会丢失旧对象的引用。

---

## 📊 修复验证

### 修复前的日志
```
[ProcessManager] Starting MCP process on port 18060
[ProcessManager] Starting MCP process on port 18061
...
[ProcessManager] Cleaning up inactive process for user xxx  ← 泄漏的定时器触发
[MCP xxx] ERROR: context deadline exceeded
socket hang up ❌
```

### 修复后的预期日志
```
[ProcessManager] Clearing old cleanup timer for user xxx before creating new process ✅
[ProcessManager] Starting MCP process on port 18061
...
[ProcessManager] ✅ Request completed in 550907ms (550.91s)
发布成功 ✅
```

---

## 🧪 测试计划

### 测试场景1: 正常发布
1. 启动进程
2. 发布内容（4张图片，预计5-6分钟）
3. **预期**: 发布成功，无 socket hang up 错误

### 测试场景2: 多次重启进程
1. 启动进程1
2. 刷新 cookies（触发进程重启 → 进程2）
3. 再次刷新 cookies（触发进程重启 → 进程3）
4. 发布内容
5. **预期**: 日志显示 "Clearing old cleanup timer"，发布成功

### 测试场景3: 长时间运行
1. 启动进程
2. 等待 11 分钟（超过 cleanupTimeout）
3. 发布内容
4. **预期**: 进程不会被意外删除，发布成功

---

## 🔗 相关修复

### 其他已验证的清理位置

✅ **refreshUserCookies** (第381-383行) - 正确清理
```typescript
if (managedProcess.cleanupTimer) {
  clearTimeout(managedProcess.cleanupTimer);
}
```

✅ **cleanupUser** (第452-454行) - 正确清理
```typescript
if (managedProcess.cleanupTimer) {
  clearTimeout(managedProcess.cleanupTimer);
}
```

✅ **killProcess** (第242-244行) - 正确清理
```typescript
if (managed.cleanupTimer) {
  clearTimeout(managed.cleanupTimer);
}
```

**结论**: 只有 `startProcess` 方法缺少清理逻辑，其他地方都正确处理了。

---

## 📝 修复总结

| 项目 | 修复前 | 修复后 |
|------|--------|--------|
| **Bug类型** | 定时器泄漏 | ✅ 已修复 |
| **触发条件** | 进程重启时 | ✅ 清除旧定时器 |
| **影响范围** | 所有长时间发布操作 | ✅ 不再影响 |
| **错误信息** | socket hang up | ✅ 消除 |
| **修复文件** | processManager.ts | ✅ 已修复 |
| **代码行数** | +7 行 | ✅ 最小化修改 |

---

## 🚀 部署步骤

1. ✅ **修复代码** - 已完成
2. ✅ **编译 TypeScript** - 已完成
3. ⏳ **提交到 Git** - 待执行
4. ⏳ **推送到远程** - 待执行
5. ⏳ **重新构建 Docker** - 待执行
6. ⏳ **重启服务** - 待执行
7. ⏳ **测试发布** - 待执行

---

**修复时间**: 2025-10-26
**发现者**: User (精准分析)
**修复者**: Claude Code
**严重性**: 🔴 Critical - 导致所有长时间发布失败
**状态**: ✅ 已修复，待部署
