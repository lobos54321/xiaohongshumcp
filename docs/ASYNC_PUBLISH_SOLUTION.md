# 🚀 异步发布解决方案 - Zeabur 120秒超时问题

## 📋 问题分析

### 当前超时链路
```
浏览器 → Zeabur Gateway (120s ❌ 硬性限制) → Express → MCP Router → MCP Binary
                ↑ 在这里被杀死
```

### 关键数据
- **Zeabur Gateway 超时**: 120 秒（硬性限制，无法修改）
- **实际发布耗时**: 312 秒（5分12秒）
- **当前 axios 超时**: 600 秒（10分钟，但从未生效）
- **结果**: 网关在 120 秒时返回 `context deadline exceeded`

### 为什么设置 Express 超时到 110 秒无效？
```
设置 110s 超时:
- 110s < 312s（实际耗时）
- 仍然会在 110 秒时终止操作
- 发布依然失败
```

**结论**: 需要架构级别的改变，而非简单的超时配置。

---

## ✅ 解决方案：异步作业追踪系统

### 核心思路
将**同步等待**改为**异步追踪**：
1. 批准接口立即返回作业ID（响应时间 < 1秒）
2. 后台继续执行发布操作（不阻塞HTTP响应）
3. 前端定期轮询状态接口获取进度
4. 绕过 Zeabur 网关的 120 秒限制

### 架构对比

#### 🔴 当前架构（同步）
```
前端: POST /approve → 等待发布完成 (312s) → 超时 ❌

后端:
  1. 接收请求
  2. await publishContent()  ← 阻塞在这里 312 秒
  3. 返回响应                ← 永远到不了这一步（120s 被杀）
```

#### 🟢 新架构（异步）
```
前端:
  1. POST /approve → 立即返回 jobId (< 1s) ✅
  2. 每 3 秒: GET /publish-status/:jobId
  3. 检查 status: pending → running → completed ✅

后端:
  1. 接收请求
  2. 创建作业记录 → 返回 jobId（不等待）
  3. 后台执行: publishContent() (312s，不阻塞响应)
  4. 更新作业状态（completed/failed）
```

---

## 🛠️ 实现方案

### 方案 A: 最简方案（推荐）⭐
**优点**:
- ✅ 无需新依赖
- ✅ 使用现有 Map 存储
- ✅ 实现简单（约 150 行代码）
- ✅ 与现有架构一致

**缺点**:
- ❌ 重启后作业状态丢失（可接受，重新登录即可）

**实现清单**:
1. 在 `autoContentManager.ts` 添加:
   ```typescript
   interface PublishJob {
     jobId: string;
     userId: string;
     taskId: string;
     taskTitle: string;
     status: 'pending' | 'running' | 'completed' | 'failed';
     progress: number;  // 0-100
     startTime: Date;
     endTime?: Date;
     error?: string;
     result?: any;
   }

   private publishJobs: Map<string, PublishJob> = new Map();
   ```

2. 修改 `approveAndPublish` 方法:
   ```typescript
   // OLD: 同步等待完成
   public async approveAndPublish(userId: string, taskId?: string): Promise<void>

   // NEW: 立即返回 jobId
   public async startPublishJob(userId: string, taskId?: string): Promise<string>
   ```

3. 添加作业执行方法（后台运行）:
   ```typescript
   private async executePublishJob(jobId: string): Promise<void> {
     // 不阻塞调用者，独立执行
   }
   ```

4. 添加状态查询方法:
   ```typescript
   public getPublishJobStatus(jobId: string): PublishJob | null
   ```

5. 在 `server.ts` 添加新端点:
   ```typescript
   // 批准发布（立即返回）
   POST /agent/auto/approve/:userId
   → { jobId, status: 'pending' }

   // 查询作业状态（轮询用）
   GET /agent/auto/publish-status/:jobId
   → { jobId, status, progress, error?, result? }
   ```

6. 前端修改（React/Vue）:
   ```typescript
   // 提交发布
   const { jobId } = await axios.post('/approve', { taskId });

   // 轮询状态
   const interval = setInterval(async () => {
     const { status, progress, error, result } = await axios.get(`/publish-status/${jobId}`);

     if (status === 'completed') {
       clearInterval(interval);
       showSuccess('发布成功！');
     } else if (status === 'failed') {
       clearInterval(interval);
       showError(error);
     } else {
       updateProgress(progress);  // 显示进度条
     }
   }, 3000);  // 每 3 秒轮询一次
   ```

---

### 方案 B: 进阶方案（如果需要持久化）
**适用场景**: 需要在服务重启后保留作业状态

**额外工作**:
- 添加数据库表或文件存储
- 定时清理过期作业（>24小时）

**不推荐原因**:
- 增加复杂度
- 当前场景下重启后重新登录是可接受的

---

## 📊 进度显示优化

### 后端进度追踪
```typescript
private async executePublishJob(jobId: string): Promise<void> {
  const job = this.publishJobs.get(jobId);

  try {
    job.status = 'running';
    job.progress = 0;

    // 1. 验证图片 (10%)
    job.progress = 10;

    // 2. 生成缺失图片 (30%)
    for (let i = 0; i < imagePrompts.length; i++) {
      await generateImage(...);
      job.progress = 10 + (20 * (i + 1) / imagePrompts.length);
    }

    // 3. 开始发布 (50%)
    job.progress = 50;
    await this.publishContent(...);

    // 4. 完成 (100%)
    job.status = 'completed';
    job.progress = 100;
    job.endTime = new Date();

  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
  }
}
```

### 前端进度显示
```jsx
<div className="publish-progress">
  {status === 'pending' && <Spinner text="准备发布..." />}
  {status === 'running' && (
    <>
      <ProgressBar value={progress} max={100} />
      <p>{getProgressText(progress)}</p>
    </>
  )}
  {status === 'completed' && <Success text="发布成功！" />}
  {status === 'failed' && <Error text={error} />}
</div>

function getProgressText(progress) {
  if (progress < 10) return '验证图片...';
  if (progress < 30) return '生成配图...';
  if (progress < 50) return '准备发布...';
  if (progress < 100) return '发布中，预计还需 3-4 分钟...';
  return '完成';
}
```

---

## 🔒 安全性考虑

### 1. 作业所有权验证
```typescript
public getPublishJobStatus(jobId: string, userId: string): PublishJob | null {
  const job = this.publishJobs.get(jobId);

  // 防止用户A查询用户B的作业
  if (job && job.userId !== userId) {
    throw new Error('无权访问此作业');
  }

  return job;
}
```

### 2. 作业自动清理
```typescript
// 在构造函数中启动清理任务
setInterval(() => {
  this.cleanupOldJobs();
}, 3600000);  // 每小时清理一次

private cleanupOldJobs(): void {
  const now = Date.now();
  const MAX_AGE = 24 * 3600 * 1000;  // 24 小时

  for (const [jobId, job] of this.publishJobs.entries()) {
    const age = now - job.startTime.getTime();
    if (age > MAX_AGE) {
      this.publishJobs.delete(jobId);
      console.log(`🧹 [清理] 删除过期作业: ${jobId}`);
    }
  }
}
```

### 3. 并发控制（可选）
```typescript
private maxConcurrentPublish = 5;  // 最多同时发布 5 个

public async startPublishJob(userId: string, taskId?: string): Promise<string> {
  // 检查正在运行的作业数
  const runningCount = Array.from(this.publishJobs.values())
    .filter(j => j.status === 'running').length;

  if (runningCount >= this.maxConcurrentPublish) {
    throw new Error('系统繁忙，请稍后再试');
  }

  // 继续创建作业...
}
```

---

## 🧪 测试计划

### 1. 正常流程测试
- [ ] 提交发布 → 立即返回 jobId
- [ ] 轮询状态 → pending → running → completed
- [ ] 完整发布成功（312 秒后）

### 2. 异常场景测试
- [ ] 图片生成失败 → status = failed
- [ ] MCP 发布失败 → status = failed，包含错误信息
- [ ] 查询不存在的 jobId → 404
- [ ] 用户 A 查询用户 B 的作业 → 403

### 3. 并发测试
- [ ] 多个用户同时发布 → 各自独立运行
- [ ] 同一用户连续发布 2 个任务 → 都成功

### 4. 边界测试
- [ ] 网络中断后重连 → 继续轮询，作业仍在运行
- [ ] 前端关闭后重新打开 → 作业状态仍然保留（如果 < 24h）

---

## 📝 实施步骤

### 阶段 1: 后端实现（约 2 小时）
1. ✅ 修改 `autoContentManager.ts`
   - 添加 `PublishJob` 接口和 `publishJobs` Map
   - 重构 `approveAndPublish` → `startPublishJob`
   - 添加 `executePublishJob` 后台执行方法
   - 添加 `getPublishJobStatus` 状态查询方法

2. ✅ 修改 `server.ts`
   - 修改 `POST /agent/auto/approve/:userId` 端点
   - 添加 `GET /agent/auto/publish-status/:jobId` 端点

3. ✅ 编译和测试
   ```bash
   cd playwright-service/claude-agent-service
   npm run build
   npm run dev  # 本地测试
   ```

### 阶段 2: 前端实现（约 1 小时）
1. ✅ 修改批准发布按钮的处理逻辑
2. ✅ 添加轮询状态的逻辑
3. ✅ 添加进度条 UI 组件

### 阶段 3: 部署和验证（约 30 分钟）
1. ✅ 构建新镜像
   ```bash
   docker build -t xiaohongshu-automation:latest .
   ```

2. ✅ 部署到 Zeabur
   ```bash
   docker-compose up -d
   ```

3. ✅ 验证完整流程
   - 提交发布 → 立即返回
   - 观察日志 → 后台继续执行
   - 前端轮询 → 实时更新状态
   - 5 分钟后 → 发布成功 ✅

---

## 🎯 预期效果

### 用户体验改进
| 指标 | 当前 | 改进后 |
|------|------|--------|
| 批准响应时间 | 120s 超时 ❌ | < 1s 返回 ✅ |
| 发布成功率 | 0% (超时失败) | 100% ✅ |
| 进度可见性 | 无 | 实时进度条 ✅ |
| 用户等待体验 | 黑屏等待 → 超时 | 进度条 → 成功 ✅ |

### 技术指标
- **响应时间**: 312s → < 1s（提升 300 倍）
- **成功率**: 0% → 100%（从完全失败到完全成功）
- **超时错误**: 100% → 0%（彻底解决）

---

## ❓ 常见问题

### Q1: 服务重启后，正在运行的作业会怎样？
**A**: 作业状态会丢失。用户需要重新提交。如果需要持久化，可以使用方案 B（数据库存储）。

### Q2: 如果用户关闭浏览器，作业还会继续吗？
**A**: 会的！作业在后端独立运行，不依赖前端连接。用户重新打开页面后可以继续查询状态。

### Q3: 轮询会不会增加服务器压力？
**A**: 影响很小。每 3 秒一次请求，只是简单的 Map 查询，性能消耗可忽略。
- 单次查询耗时: < 1ms
- 100 个用户同时轮询: 每秒 ~33 次查询，完全可以承受

### Q4: 为什么不用 WebSocket 或 Server-Sent Events (SSE)？
**A**:
- 轮询更简单，无需额外依赖
- Zeabur 可能对 WebSocket 有特殊限制
- 当前场景下轮询已经足够（发布频率低）
- 如果未来需要实时性更高，可以升级到 SSE

---

## 🚀 总结

**核心改变**: 将**同步阻塞**改为**异步追踪**

**投入产出比**:
- **开发时间**: 约 3.5 小时
- **代码量**: 约 200 行
- **依赖增加**: 0
- **效果**: 从完全不可用 → 100% 可用 ✅

**推荐**: 立即实施方案 A（最简方案），彻底解决 Zeabur 超时问题。
