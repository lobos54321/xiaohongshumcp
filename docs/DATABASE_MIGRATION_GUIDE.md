# Supabase 数据库迁移指南

## 🎉 迁移完成状态

### ✅ 已完成

1. ✅ 创建 `databaseService.ts` - 完整的数据库服务层
2. ✅ 修改 `autoContentManager.ts` - 集成数据库
3. ✅ 实现数据库优先 + 文件备份策略
4. ✅ TypeScript 编译通过

### 📋 迁移架构

```
旧架构：文件存储
/app/data/auto-content/
└── user_xxx.json

新架构：数据库优先 + 文件备份
Supabase Database (主存储)
├── xhs_user_profiles
├── xhs_content_strategies
├── xhs_daily_tasks
├── xhs_weekly_plans
├── xhs_automation_status
├── xhs_activity_logs
└── xhs_user_mapping

/app/data/auto-content/ (备份)
└── user_xxx.json
```

---

## 🧪 测试步骤

### 第1步：验证环境变量

确保以下环境变量已配置：

```bash
# Supabase 配置
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
# 或者使用 VITE_ 前缀
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 第2步：本地测试

```bash
# 1. 进入项目目录
cd xiaohongshumcp/playwright-service/claude-agent-service

# 2. 安装依赖
npm install

# 3. 编译代码
npm run build

# 4. 启动服务
npm start
```

### 第3步：测试数据库连接

**查看日志**，应该看到：

```
✅ Supabase 客户端已初始化（自动内容管理）
✅ 数据库服务已初始化
📁 数据目录: /app/data/auto-content
📂 [DB] 从数据库加载用户数据...
📂 [DB] 找到 X 个用户
```

### 第4步：测试新用户创建

**前端操作**：
1. 登录 www.prome.live
2. 进入小红书自动化页面
3. 配置产品信息并保存

**查看日志**，应该看到：

```
💾 [DB] 数据已保存到数据库: user_xxx
💾 [FS] 数据已备份到文件: /app/data/auto-content/user_xxx.json
```

**验证数据库**：

```sql
-- 在 Supabase SQL Editor 运行
SELECT * FROM xhs_user_profiles;
SELECT * FROM xhs_content_strategies;
SELECT * FROM xhs_daily_tasks;
```

### 第5步：测试数据恢复

**重启服务**：

```bash
# 停止服务（Ctrl+C）
# 重新启动
npm start
```

**查看日志**，应该看到：

```
📂 [DB] 从数据库加载用户数据...
📂 [DB] 找到 X 个用户
📂 [DB] 已恢复用户数据: user_xxx
✅ [DB] 已从数据库恢复 X 个用户的数据
```

---

## 🔄 数据迁移（文件 → 数据库）

如果你有现有的文件数据需要迁移到数据库，按以下步骤操作：

### 方法1：自动迁移（推荐）

系统会自动处理：
1. 启动时优先从数据库加载
2. 如果数据库为空，从文件加载
3. 下次保存时自动写入数据库

**无需手动操作！**

### 方法2：手动迁移脚本

如果需要批量迁移现有数据，创建迁移脚本：

```typescript
// scripts/migrate-to-database.ts
import { createClient } from '@supabase/supabase-js';
import { DatabaseService } from '../src/databaseService.js';
import * as fs from 'fs';
import * as path from 'path';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

const db = new DatabaseService(supabase);
const dataDir = '/app/data/auto-content';

async function migrateAll() {
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const userId = file.replace('.json', '');
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));

    // 获取 supabase_uuid（从 user_mapping 表）
    const { data: mapping } = await supabase
      .from('xhs_user_mapping')
      .select('supabase_uuid')
      .eq('xhs_user_id', userId)
      .single();

    if (!mapping) {
      console.warn(`⚠️ 跳过用户 ${userId}: 未找到 UUID 映射`);
      continue;
    }

    // 迁移数据
    await db.saveAllUserData({
      supabaseUuid: mapping.supabase_uuid,
      xhsUserId: userId,
      userProfile: data.userProfile ? {
        product_name: data.userProfile.productName,
        target_audience: data.userProfile.targetAudience,
        // ... 其他字段
      } : undefined,
      // ... 其他数据
    });

    console.log(`✅ 已迁移用户: ${userId}`);
  }
}

migrateAll().catch(console.error);
```

---

## 🚀 部署到生产环境

### 第1步：确认 Supabase 配置

在 Zeabur 环境变量中添加：

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
```

或者：

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 第2步：备份现有数据

```bash
# 备份文件数据（以防万一）
cd /app/data/auto-content
tar -czf backup-$(date +%Y%m%d).tar.gz *.json
```

### 第3步：部署新代码

```bash
# 1. 提交代码
git add .
git commit -m "feat: 迁移到Supabase数据库存储"

# 2. 推送到GitHub
git push origin main

# 3. Zeabur 自动部署（或手动触发）
```

### 第4步：验证部署

**查看 Zeabur 日志**：

```
✅ Supabase 客户端已初始化（自动内容管理）
✅ 数据库服务已初始化
📂 [DB] 从数据库加载用户数据...
```

**测试功能**：
1. 访问前端页面
2. 创建新用户配置
3. 检查数据库是否有数据

---

## 🔍 故障排查

### 问题1：数据库连接失败

**症状**：
```
⚠️ Supabase 配置缺失，将使用文件存储
```

**解决**：
1. 检查环境变量是否配置
2. 确认 Supabase URL 和 Key 正确

### 问题2：数据未保存到数据库

**症状**：
```
⚠️ [DB] 未找到用户映射，跳过数据库保存: user_xxx
```

**解决**：

确保 `xhs_user_mapping` 表有映射记录：

```sql
-- 检查映射表
SELECT * FROM xhs_user_mapping WHERE xhs_user_id = 'user_xxx';

-- 如果没有，手动插入
INSERT INTO xhs_user_mapping (supabase_uuid, xhs_user_id)
VALUES ('uuid-from-frontend', 'user_xxx');
```

### 问题3：数据恢复时出错

**症状**：
```
❌ [DB] 恢复用户 user_xxx 数据失败
```

**解决**：

检查数据库表结构和数据：

```sql
-- 检查用户配置
SELECT * FROM xhs_user_profiles WHERE xhs_user_id = 'user_xxx';

-- 检查字段是否匹配
\d xhs_user_profiles
```

---

## 📊 监控和维护

### 数据一致性检查

```sql
-- 检查每个表的数据量
SELECT
  'xhs_user_profiles' as table_name,
  COUNT(*) as count
FROM xhs_user_profiles
UNION ALL
SELECT 'xhs_content_strategies', COUNT(*) FROM xhs_content_strategies
UNION ALL
SELECT 'xhs_daily_tasks', COUNT(*) FROM xhs_daily_tasks
UNION ALL
SELECT 'xhs_weekly_plans', COUNT(*) FROM xhs_weekly_plans;
```

### 定期备份

Supabase 自动备份，但建议：

1. 定期导出数据（Supabase Dashboard → Database → Export）
2. 保留文件备份（已自动实现）

---

## ✅ 迁移完成检查清单

- [ ] Supabase 表已创建
- [ ] 环境变量已配置
- [ ] TypeScript 编译通过
- [ ] 本地测试成功
  - [ ] 数据库连接正常
  - [ ] 数据保存成功
  - [ ] 数据恢复成功
- [ ] 生产环境部署
  - [ ] 代码已推送
  - [ ] Zeabur 重新部署
  - [ ] 服务启动正常
  - [ ] 日志显示数据库初始化成功
- [ ] 功能验证
  - [ ] 新用户创建成功
  - [ ] 数据库有记录
  - [ ] 文件备份存在
  - [ ] 服务重启后数据恢复

---

## 🎉 迁移收益

### 数据安全性
- ✅ ACID 事务保证
- ✅ 自动备份和恢复
- ✅ 双重存储（数据库 + 文件）

### 性能提升
- ✅ 数据库查询优化
- ✅ 支持复杂查询
- ✅ 更好的并发控制

### 可维护性
- ✅ 统一的数据管理
- ✅ 更容易扩展
- ✅ 更好的监控和分析

---

**迁移状态**：🟢 已完成
**文档版本**：v1.0
**最后更新**：2025-11-01
