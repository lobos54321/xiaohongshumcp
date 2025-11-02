# Supabase数据持久化集成方案

## 问题分析

### 当前问题
1. ❌ 后端生成数据（plan/strategy）但只存内存，重启丢失
2. ❌ 前端刷新页面后无法获取数据（404错误）
3. ❌ 前端查询Supabase返回406错误（表结构不匹配）

### 根本原因
- 后端AutoContentManager只将数据存在内存Map中
- 没有写入Supabase数据库
- 前端和后端数据不同步

## 解决方案：完整Supabase持久化

### 数据流设计
```
用户配置 → 后端生成 → 写入Supabase → 前端读取
   ↓                                      ↑
Profile         Strategy/Plan/Tasks      显示
```

### 需要修改的表

#### 1. xhs_content_strategies (内容策略表)
```sql
CREATE TABLE IF NOT EXISTS xhs_content_strategies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supabase_uuid UUID NOT NULL REFERENCES auth.users(id),
  xhs_user_id TEXT NOT NULL,
  key_themes JSONB NOT NULL,
  content_types JSONB NOT NULL,
  optimal_times JSONB NOT NULL,
  hashtags JSONB NOT NULL,
  trending_topics JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 2. xhs_weekly_plans (周计划表)
```sql
CREATE TABLE IF NOT EXISTS xhs_weekly_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supabase_uuid UUID NOT NULL REFERENCES auth.users(id),
  xhs_user_id TEXT NOT NULL,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  daily_tasks JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 3. xhs_daily_tasks (每日任务表)
```sql
CREATE TABLE IF NOT EXISTS xhs_daily_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supabase_uuid UUID NOT NULL REFERENCES auth.users(id),
  xhs_user_id TEXT NOT NULL,
  weekly_plan_id UUID REFERENCES xhs_weekly_plans(id),
  scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
  content_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image_prompts JSONB NOT NULL,
  image_urls JSONB,
  storage_keys JSONB,
  hashtags JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  published_at TIMESTAMP WITH TIME ZONE
);
```

#### 4. xhs_automation_status (运营状态表)
```sql
CREATE TABLE IF NOT EXISTS xhs_automation_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supabase_uuid UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
  xhs_user_id TEXT NOT NULL,
  is_running BOOLEAN DEFAULT FALSE,
  start_time TIMESTAMP WITH TIME ZONE,
  last_activity TIMESTAMP WITH TIME ZONE,
  next_task_time TIMESTAMP WITH TIME ZONE,
  total_published INTEGER DEFAULT 0,
  total_views INTEGER DEFAULT 0,
  total_likes INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 后端修改任务

### Task 1: 添加Supabase写入方法
文件：`src/autoContentManager.ts`

```typescript
// 保存策略到Supabase
private async saveStrategyToSupabase(userId: string, strategy: ContentStrategy): Promise<void> {
  if (!this.supabase) return;
  
  const { error } = await this.supabase
    .from('xhs_content_strategies')
    .upsert({
      xhs_user_id: userId,
      supabase_uuid: await this.getUserSupabaseId(userId),
      key_themes: strategy.keyThemes,
      content_types: strategy.contentTypes,
      optimal_times: strategy.optimalTimes,
      hashtags: strategy.hashtags,
      trending_topics: strategy.trendingTopics,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'xhs_user_id'
    });
    
  if (error) {
    console.error('❌ 保存策略到Supabase失败:', error);
  } else {
    console.log('✅ 策略已保存到Supabase');
  }
}

// 保存周计划到Supabase
private async saveWeeklyPlanToSupabase(userId: string, plan: WeeklyPlan): Promise<void> {
  if (!this.supabase) return;
  
  const { data, error } = await this.supabase
    .from('xhs_weekly_plans')
    .upsert({
      xhs_user_id: userId,
      supabase_uuid: await this.getUserSupabaseId(userId),
      week_start_date: plan.weekStartDate,
      week_end_date: plan.weekEndDate,
      daily_tasks: plan.dailyBreakdown,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'xhs_user_id,week_start_date'
    })
    .select()
    .single();
    
  if (error) {
    console.error('❌ 保存周计划到Supabase失败:', error);
  } else {
    console.log('✅ 周计划已保存到Supabase');
    return data?.id;
  }
}

// 保存任务到Supabase
private async saveTasksToSupabase(userId: string, tasks: DailyTask[], planId?: string): Promise<void> {
  if (!this.supabase) return;
  
  const tasksData = tasks.map(task => ({
    xhs_user_id: userId,
    supabase_uuid: await this.getUserSupabaseId(userId),
    weekly_plan_id: planId,
    scheduled_time: task.scheduledTime.toISOString(),
    content_type: task.contentType,
    title: task.title,
    content: task.content,
    image_prompts: task.imagePrompts,
    image_urls: task.imageUrls || [],
    storage_keys: task.storageKeys || [],
    hashtags: task.hashtags,
    status: task.status
  }));
  
  const { error } = await this.supabase
    .from('xhs_daily_tasks')
    .upsert(tasksData, {
      onConflict: 'xhs_user_id,scheduled_time'
    });
    
  if (error) {
    console.error('❌ 保存任务到Supabase失败:', error);
  } else {
    console.log(`✅ ${tasks.length}个任务已保存到Supabase`);
  }
}

// 更新运营状态到Supabase
private async updateAutomationStatus(userId: string, status: Partial<AutomationStatus>): Promise<void> {
  if (!this.supabase) return;
  
  const { error } = await this.supabase
    .from('xhs_automation_status')
    .upsert({
      xhs_user_id: userId,
      supabase_uuid: await this.getUserSupabaseId(userId),
      ...status,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'supabase_uuid'
    });
    
  if (error) {
    console.error('❌ 更新运营状态到Supabase失败:', error);
  } else {
    console.log('✅ 运营状态已更新到Supabase');
  }
}
```

### Task 2: 在关键流程中调用写入方法

在 `startAutoOperation()` 方法中：
```typescript
async startAutoOperation(userId: string, profile: UserProfile): Promise<void> {
  // ... 现有生成逻辑 ...
  
  // ✅ 保存到Supabase
  await this.saveStrategyToSupabase(userId, strategy);
  const planId = await this.saveWeeklyPlanToSupabase(userId, weeklyPlan);
  await this.saveTasksToSupabase(userId, dailyTasks, planId);
  await this.updateAutomationStatus(userId, {
    is_running: true,
    start_time: new Date(),
    last_activity: new Date()
  });
}
```

### Task 3: 添加从Supabase读取的方法（用于重启恢复）

```typescript
async loadFromSupabase(userId: string): Promise<ContentPlan | null> {
  if (!this.supabase) return null;
  
  // 读取策略
  const { data: strategy } = await this.supabase
    .from('xhs_content_strategies')
    .select('*')
    .eq('xhs_user_id', userId)
    .single();
    
  // 读取周计划
  const { data: plan } = await this.supabase
    .from('xhs_weekly_plans')
    .select('*')
    .eq('xhs_user_id', userId)
    .order('week_start_date', { ascending: false })
    .limit(1)
    .single();
    
  // 读取任务
  const { data: tasks } = await this.supabase
    .from('xhs_daily_tasks')
    .select('*')
    .eq('xhs_user_id', userId)
    .order('scheduled_time', { ascending: true });
    
  if (strategy && plan && tasks) {
    return {
      strategy: {
        keyThemes: strategy.key_themes,
        contentTypes: strategy.content_types,
        optimalTimes: strategy.optimal_times,
        hashtags: strategy.hashtags,
        trendingTopics: strategy.trending_topics
      },
      weeklyPlan: {
        weekStartDate: plan.week_start_date,
        weekEndDate: plan.week_end_date,
        dailyBreakdown: plan.daily_tasks
      },
      dailyTasks: tasks.map(t => ({
        scheduledTime: new Date(t.scheduled_time),
        contentType: t.content_type,
        title: t.title,
        content: t.content,
        imagePrompts: t.image_prompts,
        imageUrls: t.image_urls,
        storageKeys: t.storage_keys,
        hashtags: t.hashtags,
        status: t.status
      }))
    };
  }
  
  return null;
}
```

## 前端修改

前端已经在调用Supabase查询，只需确保：
1. ✅ 表名正确
2. ✅ 字段名匹配（使用snake_case）
3. ✅ 添加正确的Accept头（`application/json`）

## 执行步骤

### 步骤1：更新数据库Schema
在Supabase SQL Editor中执行上述SQL创建/修改表

### 步骤2：修改后端代码
1. 添加Supabase写入方法
2. 在生成流程中调用保存
3. 添加从Supabase恢复的逻辑

### 步骤3：测试验证
1. 启动自动运营
2. 检查Supabase表是否有数据
3. 刷新前端页面，验证数据显示
4. 重启后端，验证数据恢复

## 优势

✅ **数据持久化**：重启不丢失
✅ **多用户支持**：每个用户独立数据
✅ **前端同步**：刷新页面立即显示
✅ **可扩展性**：支持分布式部署
✅ **数据分析**：可用SQL查询统计

## 下一步

我可以帮您：
1. 生成完整的SQL脚本
2. 修改后端代码添加写入逻辑
3. 测试验证数据流

请告诉我您想先执行哪一步？
