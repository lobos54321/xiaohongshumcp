# 智能中控中心架构概览

> **目标：** 建立一个中央 AI 驱动的内容策略系统，把「输入源 → 结构化输出 → 多 Agent 调度执行 → 反馈闭环」做成 **可执行、可追踪、可回滚、可审计** 的自动运营系统。

---

## 文档索引

| 文档 | 说明 |
|------|------|
| [01_architecture.md](./01_architecture.md) | 本文档：系统概览与设计原则 |
| [02_db_and_rls.sql](./02_db_and_rls.sql) | 完整 SQL：表/索引/RLS/RPC |
| [03_contracts.ts](./03_contracts.ts) | TypeScript 接口契约 |
| [04_runbook.md](./04_runbook.md) | 运维手册：tick/告警/排障 |

---

## 1. 核心设计原则（必须遵守）

| # | 原则 | 说明 |
|---|------|------|
| 1 | **结构化落库** | 任何 agent 的输出都必须写入 DB（strategy/plan/task/step），不能只有日志 |
| 2 | **任务 Step 化** | 任何"生成文案/视频/发布/取数/复盘"必须对应 `xhs_task_steps` 的一条 step |
| 3 | **状态聚合** | Task 状态由 Step 聚合，避免"task.status 人工随意写导致混乱" |
| 4 | **版本追溯** | 每个 step 的 `input_snapshot` 必须包含五个追溯字段 |
| 5 | **内置容错** | 死锁回收与自动降级是系统内置能力，不能靠人工排障 |
| 6 | **账号维度** | 所有策略/计划/任务必须归档到 `xhs_account_id`，避免矩阵重合 |

---

## 2. 服务分工

```
┌─────────────────────────────────────────────────────────────────────┐
│  Orchestrator (xiaohongshumcp)                                       │
│  ├── 生成 persona/strategy/mode_plan                                 │
│  ├── 生成 weekly_plan/tasks/steps                                    │
│  ├── 调度与回收（recover/fallback）                                   │
│  └── 版本滚动 - feedback loop                                        │
├─────────────────────────────────────────────────────────────────────┤
│  Execution (prome-platform)                                          │
│  ├── 执行 step: Dify / UGC / runninghub                             │
│  └── 写回 step 结果                                                  │
├─────────────────────────────────────────────────────────────────────┤
│  Chrome Extension (发布/取数)                                         │
│  ├── publish step - 发布到小红书                                      │
│  └── fetch_metrics step - 数据回收（1h/24h/7d 三窗口）                │
├─────────────────────────────────────────────────────────────────────┤
│  BettaFish (舆情)                                                     │
│  └── 输入源 - 不负责调度                                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. 端到端数据流

```
输入层                    决策层                     执行层                回调层
┌──────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐
│ProductProfile│    │  PersonaAgent   │    │ generate_copy   │    │fetch_metrics │
│MaterialAnalys│───▶│  TrendAgent     │───▶│ generate_video  │───▶│   (1h)       │
│SentimentBrief│    │  ModeSelector   │    │ publish (Ext)   │    │   (24h)      │
│AccountState[]│    │  PlannerAgent   │    │                 │    │   (7d)       │
└──────────────┘    └─────────────────┘    └─────────────────┘    └──────────────┘
        ▲                    │                      │                     │
        │                    ▼                      ▼                     │
        │           ┌────────────────┐      ┌────────────────┐            │
        │           │  xhs_content_  │      │ xhs_task_steps │            │
        │           │  strategies    │      │ (审计核心)      │            │
        │           └────────────────┘      └────────────────┘            │
        │                                                                  │
        └──────────────────── EvaluatorAgent ◀────────────────────────────┘
                              (feedback loop)
```

---

## 4. Step 类型与依赖

| Step Type | Provider | 依赖 |
|-----------|----------|------|
| `generate_copy` | Dify | - |
| `refine_title` | Dify | generate_copy |
| `compress_script` | Dify | generate_copy |
| `generate_video` | n8n/runninghub | compress_script |
| `fallback_image_text` | 执行器 | generate_copy (当 video 失败) |
| `publish` | Chrome Extension | generate_copy 或 generate_video |
| `fetch_metrics` | Chrome Extension | publish (多窗口: 1h/24h/7d) |
| `review` | Orchestrator | fetch_metrics |

---

## 5. 必须包含的追溯字段（input_snapshot）

每个 step 的 `input_snapshot` **必须** 包含以下五个字段：

```json
{
  "strategy_version": 2,
  "plan_version": 2,
  "sentiment_brief_id": "sent_2025w50_xxx",
  "material_analysis_id": "mat_2025-12-13_xxx",
  "orchestrator_run_id": "run_2025-12-14_001"
}
```

> **禁止使用 'inherit' 等占位符**，必须填写真实 ID。

---

## 6. 关键约定

1. **BettaFish 是输入源**：其输出必须结构化存成 `SentimentBrief` 并带 id
2. **Dify 文案是周资产（母文案）**：日更内容应派生，不要每天都 2000 字
3. **一旦落地 TaskStep**：后续功能只允许通过 step 扩展，不允许"绕过 step 直接改 task 状态"
4. **review_mode 冗余存储**：在创建任务时将 review_mode 写入 `tasks.metadata.review_mode`
5. **fetch_metrics 多窗口**：publish 成功后自动创建 1h/24h/7d 三个 fetch_metrics steps

---

## 7. 硬性约束（禁止违反）

### 7.1 Task/Step 创建者责任

| 操作 | Orchestrator | prome-platform | Chrome Extension |
|------|:------------:|:--------------:|:----------------:|
| INSERT tasks | ✅ | ❌ | ❌ |
| INSERT steps | ✅ | ❌ | ❌ |
| lock step (UPDATE) | ❌ | ✅ | ✅ |
| finish step (UPDATE) | ❌ | ✅ | ✅ |

> **只有 Orchestrator 允许创建 tasks/steps（INSERT），执行器和扩展只允许 lock/finish（UPDATE）**

### 7.2 publish step 的 review_mode 检查

publish step 执行前必须按以下规则处理：

```
IF tasks.metadata.review_mode == 'manual_confirm':
    → Extension 弹窗确认
    → 用户确认后才执行发布
    → 用户拒绝则保持 pending

IF tasks.metadata.review_mode == 'auto_publish':
    → 直接执行发布
```

### 7.3 账号隔离（Circuit Breaker）

当账号连续失败 N 次（默认 N=3）：
1. 调用 `disable_account_temporarily(account_id, hours)` 禁用账号
2. 所有执行器/Orchestrator 在创建/调度任务时跳过该账号
3. 禁用到期后自动恢复

