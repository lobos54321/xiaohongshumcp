# 智能中控中心 - 运维手册（Runbook）

本文档定义 Orchestrator tick、告警处理、排障流程和回滚策略。

---

## 1. Orchestrator Maintenance Tick

### 1.1 触发方式

- **Cron 调度**：每 **3 分钟** 执行一次
- **API 端点**：`POST /agent/orchestrator/maintenance/tick`
- **执行角色**：仅 `service_role` 可调用

### 1.2 执行内容（顺序固定）

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. recover_stuck_steps()                                         │
│    - 回收 Dify 类超时 (>20min) 的 running steps                    │
│    - 回收 Video 类超时 (>30min) 的 running steps                   │
│    - 将 status 改回 pending，追加 error 记录                       │
├─────────────────────────────────────────────────────────────────┤
│ 2. apply_video_fallback()                                        │
│    - 扫描 generate_video failed & attempt>=max & 无 fallback      │
│    - 创建 fallback_image_text step                               │
│    - 更新 task.metadata.effective_mode = IMAGE_TEXT              │
├─────────────────────────────────────────────────────────────────┤
│ 3. refresh_task_status()                                         │
│    - 扫描 pending/copy_ready/video_ready 任务                     │
│    - 按 step 状态聚合更新 task.status                             │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 幂等保证

- `recover_stuck_steps`：只更新 status='running' 且超时的 step
- `apply_video_fallback`：检查是否已存在 fallback_image_text step
- `refresh_task_status`：比较新旧状态，相同则不更新

---

## 2. 告警规则与处置

### 2.1 核心监控指标

| 指标 | 查询方式 | 告警阈值 |
|------|----------|----------|
| `running_steps_count` | `SELECT COUNT(*) FROM xhs_task_steps WHERE status='running'` | > 50 |
| `pending_steps_count` | `SELECT COUNT(*) FROM xhs_task_steps WHERE status='pending'` | > 200 |
| `step_failure_rate` | 按 step_type/provider 分组统计 | > 20% (24h) |
| `recover_count` | tick 返回的 recovered_count | > 10/hour |
| `fallback_count` | tick 返回的 fallbacks_applied | > 5/day |
| `avg_step_duration` | `finished_at - started_at` 统计 | generate_copy > 5min |

### 2.2 告警级别

| 级别 | 触发条件 | 响应时间 |
|------|----------|----------|
| P0 | RLS 绕过（任何越权访问） | 立即 |
| P1 | 同账号连续 3 次失败 | 15 分钟 |
| P1 | pending 堆积 > 200 | 15 分钟 |
| P2 | recover_count > 10/hour | 1 小时 |
| P2 | fallback_count > 5/day | 1 小时 |
| P3 | 成本异常飙升（usage 统计） | 24 小时 |

### 2.3 告警处置 SOP

#### P0: RLS 绕过
```
1. 立即禁用相关 RPC 函数
2. 检查 auth.uid() 校验是否缺失
3. 审计日志确认影响范围
4. 修复并重新测试
5. 发布 post-mortem
```

#### P1: 同账号连续 3 次失败
```
1. 查询该账号最近 N 条失败 step
   SELECT * FROM xhs_task_steps 
   WHERE xhs_account_id = '...' AND status = 'failed'
   ORDER BY created_at DESC LIMIT 10;

2. 按 step_type 分类
   - generate_copy 失败 → 检查 Dify API
   - generate_video 失败 → 检查 n8n/runninghub
   - publish 失败 → 检查 Extension 日志

3. 检查 error 字段确认根因

4. 如为 API 限流，暂停该账号 1 小时
```

#### P1: pending 堆积 > 200
```
1. 检查执行器是否正常运行
   SELECT locked_by, COUNT(*) FROM xhs_task_steps 
   WHERE status = 'running' GROUP BY locked_by;

2. 如果所有 running 都是同一个 locked_by → 执行器卡死

3. 检查是否有大量 scheduled_at 在未来
   SELECT scheduled_at, COUNT(*) FROM xhs_task_steps 
   WHERE status = 'pending' AND scheduled_at > now()
   GROUP BY scheduled_at ORDER BY scheduled_at;

4. 如为正常排期，无需处理
```

#### P2: recover_count 高
```
1. 按 step_type 分类超时分布
   SELECT step_type, COUNT(*) FROM xhs_task_steps 
   WHERE error::text LIKE '%recovery%' 
   AND created_at > now() - interval '1 hour'
   GROUP BY step_type;

2. 如果集中在某种类型 → 该 provider 响应慢
3. 考虑调整超时阈值或增加并发
```

---

## 3. 常见问题排障

### 3.1 Extension 无法获取待执行 step

**现象**：Extension 轮询返回空数组

**排查步骤**：
```sql
-- 1. 检查是否有 pending 的 publish/fetch_metrics
SELECT * FROM xhs_task_steps 
WHERE step_type IN ('publish', 'fetch_metrics')
  AND status = 'pending'
  AND supabase_uuid = '<当前用户UUID>';

-- 2. 检查 scheduled_at 是否在未来
SELECT id, step_type, scheduled_at 
FROM xhs_task_steps 
WHERE status = 'pending' 
  AND scheduled_at > now();

-- 3. 检查 RLS 是否阻止访问
SET ROLE authenticated;
SET request.jwt.claim.sub = '<当前用户UUID>';
SELECT * FROM xhs_task_steps WHERE status = 'pending';
```

### 3.2 lock_task_step 返回空

**现象**：RPC 调用成功但返回空数组

**可能原因**：
1. step 已被其他执行器锁定
2. step.attempt >= max_attempts
3. step.scheduled_at > now()
4. step.supabase_uuid != auth.uid()

**排查**：
```sql
SELECT id, status, attempt, max_attempts, scheduled_at, locked_by, supabase_uuid
FROM xhs_task_steps
WHERE id = '<step_id>';
```

### 3.3 Step 卡在 running 状态

**现象**：step 长时间 status='running'

**处理**：
1. 等待下次 tick 自动回收
2. 或手动执行 `SELECT recover_stuck_steps();`

### 3.4 Fallback 未触发

**现象**：generate_video 失败但未创建 fallback_image_text

**可能原因**：
1. attempt < max_attempts（还未达到重试上限）
2. 已存在 fallback_image_text step
3. generate_copy 未 succeeded

**排查**：
```sql
SELECT step_type, status, attempt, max_attempts
FROM xhs_task_steps
WHERE task_id = '<task_id>'
ORDER BY created_at;
```

---

## 4. 回滚策略

### 4.1 策略版本回滚

当新版本策略表现不佳时：
```sql
-- 查看历史版本
SELECT version, created_at FROM xhs_content_strategies 
WHERE xhs_account_id = '...' ORDER BY version DESC;

-- 新任务使用旧版本
-- 在 orchestrator 中指定 strategy_version = N
```

### 4.2 Task 取消

取消尚未执行的任务：
```sql
UPDATE xhs_daily_tasks SET status = 'skipped' WHERE id = '...';
UPDATE xhs_task_steps SET status = 'cancelled' WHERE task_id = '...';
```

### 4.3 Step 重试

手动重试失败的 step：
```sql
UPDATE xhs_task_steps 
SET status = 'pending', 
    attempt = 0, 
    error = NULL,
    locked_by = NULL,
    locked_at = NULL
WHERE id = '...';
```

---

## 5. Extension 轮询策略

### 5.1 建议配置

| Step Type | 轮询间隔 | 说明 |
|-----------|----------|------|
| `publish` | 30 秒 | 需要及时响应 |
| `fetch_metrics` | 5 分钟 | 按 scheduled_at 延迟执行 |

### 5.2 轮询优化

```typescript
// 智能轮询：根据上次结果调整间隔
let pollInterval = 30_000; // 初始 30s

async function adaptivePoll() {
  const steps = await pollPendingSteps();
  
  if (steps.length === 0) {
    // 无任务时延长间隔（最长 5 分钟）
    pollInterval = Math.min(pollInterval * 1.5, 300_000);
  } else {
    // 有任务时恢复短间隔
    pollInterval = 30_000;
  }
  
  setTimeout(adaptivePoll, pollInterval);
}
```

---

## 6. 账号隔离（Circuit Breaker）

当某账号频繁失败时，需要临时隔离以避免拖垮整个系统。

### 6.1 触发条件

| 条件 | 阈值 | 隔离时长 |
|------|------|----------|
| 同一账号连续 step 失败 | 3 次 | 1 小时 |
| 同一账号 24h 内失败率 | > 50% | 2 小时 |
| publish step 连续失败 | 2 次 | 4 小时（可能被平台限流） |

### 6.2 激活隔离

```sql
-- 方式一：使用 RPC 函数
SELECT disable_account_temporarily(
  'account_id_here'::uuid, 
  1  -- 隔离 1 小时
);

-- 方式二：直接更新
UPDATE xhs_accounts 
SET disabled_until = now() + interval '1 hour'
WHERE id = 'account_id_here';
```

### 6.3 隔离期间行为

| 组件 | 行为 |
|------|------|
| Orchestrator | 创建 tasks 时跳过 disabled 账号 |
| prome-platform | 执行器跳过 disabled 账号的 steps |
| Chrome Extension | 轮询时过滤 disabled 账号 |

**执行器/Extension 检查逻辑**：
```typescript
// 在执行 step 前检查账号是否可用
const { data: available } = await supabase.rpc('is_account_available', {
  p_account_id: step.xhs_account_id
});

if (!available) {
  console.log('[Executor] Account disabled, skipping step:', step.id);
  return;
}
```

### 6.4 自动检测与激活

在 Orchestrator tick 中增加检测逻辑：

```sql
-- 检测连续失败 >= 3 次的账号
WITH recent_failures AS (
  SELECT xhs_account_id, 
         COUNT(*) as fail_count,
         MAX(finished_at) as last_failure
  FROM xhs_task_steps
  WHERE status = 'failed'
    AND finished_at > now() - interval '1 hour'
  GROUP BY xhs_account_id
  HAVING COUNT(*) >= 3
)
SELECT disable_account_temporarily(xhs_account_id, 1)
FROM recent_failures rf
JOIN xhs_accounts a ON a.id = rf.xhs_account_id
WHERE a.disabled_until IS NULL OR a.disabled_until < now();
```

### 6.5 解除隔离

隔离会在 `disabled_until` 时间到达后自动解除。

**手动解除**：
```sql
UPDATE xhs_accounts
SET disabled_until = NULL
WHERE id = 'account_id_here';
```

### 6.6 监控隔离状态

```sql
-- 查看当前被隔离的账号
SELECT id, nickname, disabled_until,
       disabled_until - now() as remaining
FROM xhs_accounts
WHERE disabled_until > now();
```

---

## 7. 日常检查清单

### 每日检查

- [ ] `pending_steps_count` < 200
- [ ] `running_steps_count` < 50
- [ ] 无 P1/P0 告警
- [ ] tick 正常执行（检查 cron 日志）
- [ ] 无账号长时间被隔离

### 每周检查

- [ ] `step_failure_rate` < 20%（按 provider 分类）
- [ ] `recover_count` 趋势稳定
- [ ] 成本增长在预期范围内
- [ ] 内容去重有效（无重复内容发布）
- [ ] 隔离触发次数趋势

### 每月检查

- [ ] RLS 策略审计
- [ ] RPC 权限审计
- [ ] 数据增长趋势（规划清理策略）
- [ ] 性能瓶颈分析
- [ ] Circuit breaker 阈值评估

