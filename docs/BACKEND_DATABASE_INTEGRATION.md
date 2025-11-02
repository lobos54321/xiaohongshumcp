# 小红书后端数据库集成说明

## 📋 概述

本文档说明小红书自动化后端（xiaohongshumcp）如何集成Supabase数据库，实现数据持久化。

**更新时间**: 2025-11-02
**版本**: v1.0
**状态**: ✅ 已完成并部署

---

## 🏗️ 系统架构

### 整体架构

```
前端 (prome-platform)
    ↓ HTTPS请求
后端 (xiaohongshumcp/playwright-service/claude-agent-service)
    ↓ 数据持久化
Supabase数据库
```

### 后端仓库结构

```
xiaohongshumcp/
├── playwright-service/
│   └── claude-agent-service/          ← Node.js + TypeScript后端
│       ├── src/
│       │   ├── server.ts              ← Express API服务器（端口4000）
│       │   ├── autoContentManager.ts  ← 自动内容管理（业务逻辑）
│       │   └── databaseService.ts     ← 数据库服务层（新增）
│       ├── package.json
│       └── tsconfig.json
└── docs/
    └── DATABASE_MIGRATION_GUIDE.md    ← 迁移指南
```

---

## 🔧 核心修改

### 1. 新增文件

#### `src/databaseService.ts` (587行)

**功能**: 封装所有Supabase数据库操作

**核心方法**:

```typescript
export class DatabaseService {
  constructor(private supabase: SupabaseClient) {}

  // 保存用户配置
  async saveUserProfile(profile: UserProfile): Promise<void>

  // 保存内容策略
  async saveContentStrategy(strategy: ContentStrategy): Promise<void>

  // 保存每日任务
  async saveDailyTasks(tasks: DailyTask[]): Promise<void>

  // 批量保存所有用户数据
  async saveAllUserData(data: {
    supabaseUuid: string;
    xhsUserId: string;
    userProfile?: Partial<UserProfile>;
    strategy?: Partial<ContentStrategy>;
    tasks?: Partial<DailyTask>[];
    weeklyPlan?: Partial<WeeklyPlan>;
    automationStatus?: Partial<AutomationStatus>;
  }): Promise<void>

  // 获取所有用户数据
  async getAllUserData(xhsUserId: string): Promise<{
    userProfile: UserProfile | null;
    strategy: ContentStrategy | null;
    tasks: DailyTask[];
    weeklyPlan: WeeklyPlan | null;
    automationStatus: AutomationStatus | null;
  }>

  // 获取所有用户ID列表
  async getAllUserIds(): Promise<string[]>
}
```

**涉及的7个Supabase表**:
- `xhs_user_profiles` - 用户配置
- `xhs_content_strategies` - 内容策略
- `xhs_daily_tasks` - 每日任务
- `xhs_weekly_plans` - 周计划
- `xhs_automation_status` - 自动化状态
- `xhs_activity_logs` - 活动日志
- `xhs_user_mapping` - 用户ID映射

---

### 2. 修改文件

#### `src/autoContentManager.ts`

**修改1: 导入数据库服务** (第11行)
```typescript
import { DatabaseService } from './databaseService.js';
```

**修改2: 添加数据库服务实例** (第71行)
```typescript
private db?: DatabaseService;  // 数据库服务
```

**修改3: 初始化数据库服务** (第100-110行)
```typescript
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (supabaseUrl && supabaseKey) {
  this.supabase = createClient(supabaseUrl, supabaseKey);
  this.db = new DatabaseService(this.supabase);  // 初始化数据库服务
  console.log('✅ 数据库服务已初始化');
}
```

**修改4: saveData改为async** (第128行)
```typescript
// 之前: private saveData(userId: string): void
// 现在: private async saveData(userId: string): Promise<void>
```

**修改5: saveData实现数据库优先策略** (第128-212行)
```typescript
private async saveData(userId: string): Promise<void> {
  try {
    // 🔥 优先使用数据库存储
    if (this.db) {
      try {
        // 从 user_mapping 表获取 supabase_uuid
        const { data: mapping } = await this.db['supabase']
          .from('xhs_user_mapping')
          .select('supabase_uuid')
          .eq('xhs_user_id', userId)
          .single();

        if (mapping && mapping.supabase_uuid) {
          // 保存到数据库
          await this.db.saveAllUserData({
            supabaseUuid: mapping.supabase_uuid,
            xhsUserId: userId,
            userProfile: { ... },
            strategy: { ... },
            tasks: [ ... ],
            automationStatus: { ... },
          });
          console.log(`💾 [DB] 数据已保存到数据库: ${userId}`);
        }
      } catch (dbError) {
        console.error(`❌ [DB] 保存到数据库失败，继续使用文件存储`);
      }
    }

    // 🔥 文件系统作为备份（始终保存）
    const filePath = path.join(this.dataDir, `${userId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`💾 [FS] 数据已备份到文件: ${filePath}`);
  }
}
```

**修改6: loadPersistedData改为async** (第214行)
```typescript
// 之前: private loadPersistedData(): void
// 现在: private async loadPersistedData(): Promise<void>
```

**修改7: loadPersistedData实现数据库优先加载** (第214-341行)
```typescript
private async loadPersistedData(): Promise<void> {
  try {
    // 🔥 优先从数据库加载
    if (this.db) {
      try {
        const userIds = await this.db.getAllUserIds();

        for (const userId of userIds) {
          const data = await this.db.getAllUserData(userId);

          // 恢复用户配置
          if (data.userProfile) {
            this.userProfiles.set(userId, { ... });
          }

          // 恢复内容计划
          if (data.strategy || data.tasks.length > 0) {
            this.contentPlans.set(userId, { ... });
          }
        }

        console.log(`✅ [DB] 已从数据库恢复 ${userIds.length} 个用户的数据`);
        return;  // 数据库加载成功，直接返回
      } catch (dbError) {
        console.error(`❌ [DB] 从数据库加载失败，回退到文件系统`);
      }
    }

    // 🔥 回退：从文件系统加载
    const files = fs.readdirSync(this.dataDir).filter(f => f.endsWith('.json'));
    // ... 原文件加载逻辑保留
  }
}
```

**修改8: 构造函数异步初始化** (第117-120行)
```typescript
// 🔥 异步加载数据（不阻塞构造函数）
this.loadPersistedData().catch(err => {
  console.error('❌ 初始化加载数据失败:', err);
});
```

**修改9: 所有saveData调用加await** (11处)
```typescript
// 之前: this.saveData(userId);
// 现在: await this.saveData(userId);

// 涉及位置:
// - 第1618行: 任务生成时
// - 第2236行: 演示模式
// - 第2603行: 更新热门话题
// - 第2643行: 更新任务时间
// - 第2695行: 编辑任务
// - 第2807行: 重新生成任务
// - 第2846行: 更新策略
// - 第3048行: 发布任务
// - 第276行: 数据库加载后更新
// - 第335行: 文件加载后更新
// - 第445行: 演示模式回退
```

**修改10: 相关函数改为async**
```typescript
// useDemoPlan: void → async Promise<void>  (第2200行)
// updateTrendingTopicsIfMissing: void → async Promise<void>  (第2589行)
```

---

## 🔄 数据流转

### 保存流程

```
用户操作 (前端)
    ↓ POST /api/...
Express API (server.ts)
    ↓ autoContentManager.xxx()
业务逻辑处理
    ↓ await saveData(userId)
数据库优先策略
    ├─ [DB] 保存到Supabase (主存储) ✅
    └─ [FS] 备份到文件 (备用) ✅
```

### 加载流程

```
服务启动
    ↓ constructor()
异步加载数据
    ↓ loadPersistedData()
数据库优先加载
    ├─ [DB] 从Supabase加载 ✅
    │   └─ 成功 → 直接返回
    └─ [DB] 加载失败 ❌
        └─ [FS] 从文件系统回退加载 ✅
```

### 双用户ID映射

```
前端用户ID (supabase_uuid)
    ↓ xhs_user_mapping表
后端用户ID (xhs_user_id)
    ↓ 业务逻辑使用
xhs_user_id: "user_9dee489189a644ee_prome"
```

---

## 🌐 环境变量配置

### Zeabur部署环境变量

在Zeabur项目设置中添加：

```bash
# Supabase配置（必需）
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key

# 或使用VITE_前缀（Zeabur格式）
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Anthropic API
ANTHROPIC_API_KEY=sk-ant-xxx
```

### 本地开发环境变量

创建 `.env` 文件：

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key

# Anthropic
ANTHROPIC_API_KEY=sk-ant-xxx

# 其他配置
ALLOW_DEMO_MODE=true
```

---

## 📊 Supabase表结构

### xhs_user_profiles
```sql
CREATE TABLE xhs_user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supabase_uuid UUID REFERENCES auth.users(id),
  xhs_user_id TEXT UNIQUE NOT NULL,
  product_name TEXT,
  target_audience TEXT,
  marketing_goal TEXT,
  post_frequency TEXT,
  brand_style TEXT,
  review_mode TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### xhs_daily_tasks
```sql
CREATE TABLE xhs_daily_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supabase_uuid UUID REFERENCES auth.users(id),
  xhs_user_id TEXT REFERENCES xhs_user_profiles(xhs_user_id),
  theme TEXT NOT NULL,
  title TEXT,
  content TEXT,
  scheduled_time TIMESTAMPTZ,
  status TEXT DEFAULT 'planned',
  image_urls TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

完整表结构见: `supabase-schema-update.sql`

---

## 🚀 部署流程

### 1. 推送代码到GitHub

```bash
git add .
git commit -m "feat: 集成Supabase数据库"
git push origin main
```

### 2. Zeabur自动部署

- Zeabur会自动检测到代码更新
- 自动重新构建和部署
- 查看部署日志确认成功

### 3. 验证部署

**查看Zeabur日志**，应该看到：

```
✅ Supabase 客户端已初始化（自动内容管理）
✅ 数据库服务已初始化
📁 数据目录: /app/data/auto-content
📂 [DB] 从数据库加载用户数据...
📂 [DB] 找到 X 个用户
✅ [DB] 已从数据库恢复 X 个用户的数据
```

如果看到 `⚠️ Supabase 配置缺失，将使用文件存储`，说明环境变量未配置。

---

## 🧪 测试验证

### 本地测试

```bash
cd xiaohongshumcp/playwright-service/claude-agent-service

# 1. 安装依赖
npm install

# 2. 编译
npm run build

# 3. 启动
npm start

# 4. 测试API
curl http://localhost:4000/health
```

### 数据库验证

在Supabase SQL Editor运行：

```sql
-- 检查用户数据
SELECT * FROM xhs_user_profiles;

-- 检查内容策略
SELECT * FROM xhs_content_strategies;

-- 检查每日任务
SELECT * FROM xhs_daily_tasks;

-- 检查用户映射
SELECT * FROM xhs_user_mapping;
```

---

## 🔍 故障排查

### 问题1: 数据库连接失败

**症状**:
```
⚠️ Supabase 配置缺失，将使用文件存储
```

**解决**:
1. 检查Zeabur环境变量是否配置
2. 确认 `SUPABASE_URL` 和 `SUPABASE_KEY` 正确
3. 重启服务生效

### 问题2: 数据未保存到数据库

**症状**:
```
⚠️ [DB] 未找到用户映射，跳过数据库保存: user_xxx
```

**解决**:

检查 `xhs_user_mapping` 表：

```sql
-- 检查映射
SELECT * FROM xhs_user_mapping WHERE xhs_user_id = 'user_xxx';

-- 如果没有，手动插入
INSERT INTO xhs_user_mapping (supabase_uuid, xhs_user_id)
VALUES ('uuid-from-frontend', 'user_xxx');
```

### 问题3: 数据恢复失败

**症状**:
```
❌ [DB] 恢复用户 user_xxx 数据失败
```

**解决**:

检查数据库表结构和数据：

```sql
-- 检查用户配置
SELECT * FROM xhs_user_profiles WHERE xhs_user_id = 'user_xxx';

-- 检查表结构
\d xhs_user_profiles
```

---

## 📈 监控指标

### 关键日志

**正常启动日志**:
```
✅ Supabase 客户端已初始化（自动内容管理）
✅ 数据库服务已初始化
📂 [DB] 从数据库加载用户数据...
📂 [DB] 找到 3 个用户
✅ [DB] 已从数据库恢复 3 个用户的数据
```

**数据保存日志**:
```
💾 [DB] 数据已保存到数据库: user_xxx
💾 [FS] 数据已备份到文件: /app/data/auto-content/user_xxx.json
```

### 性能监控

- 数据库查询时间 < 100ms
- 数据保存时间 < 200ms
- 服务启动时间 < 5s

---

## 🎯 迁移收益

### 数据安全性
- ✅ ACID事务保证
- ✅ Supabase自动备份
- ✅ 双重存储（数据库 + 文件）

### 性能提升
- ✅ 数据库索引优化
- ✅ 支持复杂查询
- ✅ 更好的并发控制

### 可维护性
- ✅ 统一的数据管理
- ✅ 更容易扩展
- ✅ 更好的监控和分析

---

## 📝 相关文档

- [数据库迁移指南](./DATABASE_MIGRATION_GUIDE.md) - 完整迁移步骤和测试指南
- [架构方案对比分析](./架构方案对比分析.md) - 文件存储 vs 数据库存储对比
- [Supabase集成计划](../SUPABASE_INTEGRATION_PLAN.md) - 原始集成计划

---

## ✅ 提交历史

### Commit 1: 初始数据库集成
```
commit e474408
feat: 迁移到Supabase数据库存储

- 新增 databaseService.ts 数据库服务层
- 修改 autoContentManager.ts 实现数据库优先+文件备份策略
- 添加完整的迁移指南和SQL架构文档
```

### Commit 2: 修复async/await
```
commit 205806c
fix: 修复saveData异步调用缺失await的问题

- 修改 useDemoPlan 为 async 函数
- 修改 updateTrendingTopicsIfMissing 为 async 函数
- 在所有 saveData() 调用前添加 await（8处）
- 在 useDemoPlan 调用前添加 await（1处）
- 在 updateTrendingTopicsIfMissing 调用前添加 await（2处）
```

---

**状态**: 🟢 已完成并部署
**最后更新**: 2025-11-02
**维护人员**: Claude Code
