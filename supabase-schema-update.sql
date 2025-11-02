-- ============================================
-- 小红书自动运营 - Supabase数据库Schema更新
-- ============================================
-- 用途：持久化自动运营数据（策略、计划、任务、状态）
-- 执行：在Supabase SQL Editor中运行此脚本
-- ============================================

-- 1. 内容策略表（xhs_content_strategies）
CREATE TABLE IF NOT EXISTS xhs_content_strategies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supabase_uuid UUID NOT NULL,
  xhs_user_id TEXT NOT NULL UNIQUE,
  key_themes JSONB NOT NULL DEFAULT '[]'::jsonb,
  content_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  optimal_times JSONB NOT NULL DEFAULT '[]'::jsonb,
  hashtags JSONB NOT NULL DEFAULT '[]'::jsonb,
  trending_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_strategies_xhs_user_id ON xhs_content_strategies(xhs_user_id);
CREATE INDEX IF NOT EXISTS idx_strategies_supabase_uuid ON xhs_content_strategies(supabase_uuid);

-- 添加注释
COMMENT ON TABLE xhs_content_strategies IS 'AI生成的内容策略';
COMMENT ON COLUMN xhs_content_strategies.key_themes IS '核心主题列表';
COMMENT ON COLUMN xhs_content_strategies.content_types IS '内容类型（图文/视频/合集）';
COMMENT ON COLUMN xhs_content_strategies.optimal_times IS '最佳发布时间';

-- ============================================

-- 2. 周计划表（xhs_weekly_plans）
CREATE TABLE IF NOT EXISTS xhs_weekly_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supabase_uuid UUID NOT NULL,
  xhs_user_id TEXT NOT NULL,
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  daily_tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(xhs_user_id, week_start_date)
);

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_weekly_plans_xhs_user_id ON xhs_weekly_plans(xhs_user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_plans_week_start ON xhs_weekly_plans(week_start_date DESC);

-- 添加注释
COMMENT ON TABLE xhs_weekly_plans IS 'AI生成的周计划';
COMMENT ON COLUMN xhs_weekly_plans.daily_tasks IS '每日任务概要';

-- ============================================

-- 3. 每日任务表（xhs_daily_tasks）
CREATE TABLE IF NOT EXISTS xhs_daily_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supabase_uuid UUID NOT NULL,
  xhs_user_id TEXT NOT NULL,
  weekly_plan_id UUID REFERENCES xhs_weekly_plans(id) ON DELETE SET NULL,
  scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
  content_type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image_prompts JSONB NOT NULL DEFAULT '[]'::jsonb,
  image_urls JSONB DEFAULT '[]'::jsonb,
  storage_keys JSONB DEFAULT '[]'::jsonb,
  hashtags JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'generating', 'ready', 'published', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  published_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(xhs_user_id, scheduled_time)
);

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_daily_tasks_xhs_user_id ON xhs_daily_tasks(xhs_user_id);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_status ON xhs_daily_tasks(status);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_scheduled_time ON xhs_daily_tasks(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_weekly_plan_id ON xhs_daily_tasks(weekly_plan_id);

-- 添加注释
COMMENT ON TABLE xhs_daily_tasks IS 'AI生成的每日发布任务';
COMMENT ON COLUMN xhs_daily_tasks.status IS 'planned=计划中, generating=生成中, ready=待发布, published=已发布, failed=失败';
COMMENT ON COLUMN xhs_daily_tasks.image_prompts IS '图片生成的prompt列表';
COMMENT ON COLUMN xhs_daily_tasks.image_urls IS 'Supabase公网URL（用于显示）';
COMMENT ON COLUMN xhs_daily_tasks.storage_keys IS 'Supabase Storage路径（用于删除）';

-- ============================================

-- 4. 自动运营状态表（xhs_automation_status）
CREATE TABLE IF NOT EXISTS xhs_automation_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supabase_uuid UUID NOT NULL UNIQUE,
  xhs_user_id TEXT NOT NULL UNIQUE,
  is_running BOOLEAN DEFAULT FALSE,
  start_time TIMESTAMP WITH TIME ZONE,
  last_activity TIMESTAMP WITH TIME ZONE,
  next_task_time TIMESTAMP WITH TIME ZONE,
  total_published INTEGER DEFAULT 0,
  total_views INTEGER DEFAULT 0,
  total_likes INTEGER DEFAULT 0,
  total_comments INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_automation_status_xhs_user_id ON xhs_automation_status(xhs_user_id);
CREATE INDEX IF NOT EXISTS idx_automation_status_is_running ON xhs_automation_status(is_running);

-- 添加注释
COMMENT ON TABLE xhs_automation_status IS '自动运营实时状态';
COMMENT ON COLUMN xhs_automation_status.is_running IS '是否正在运行';
COMMENT ON COLUMN xhs_automation_status.last_activity IS '最后活动时间';
COMMENT ON COLUMN xhs_automation_status.next_task_time IS '下次任务执行时间';

-- ============================================

-- 5. RLS策略（Row Level Security）
-- 确保用户只能访问自己的数据

-- 启用RLS
ALTER TABLE xhs_content_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE xhs_weekly_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE xhs_daily_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE xhs_automation_status ENABLE ROW LEVEL SECURITY;

-- 策略：用户只能查看和修改自己的数据
CREATE POLICY "Users can view own strategies" ON xhs_content_strategies
  FOR SELECT USING (auth.uid() = supabase_uuid);

CREATE POLICY "Users can insert own strategies" ON xhs_content_strategies
  FOR INSERT WITH CHECK (auth.uid() = supabase_uuid);

CREATE POLICY "Users can update own strategies" ON xhs_content_strategies
  FOR UPDATE USING (auth.uid() = supabase_uuid);

CREATE POLICY "Users can view own plans" ON xhs_weekly_plans
  FOR SELECT USING (auth.uid() = supabase_uuid);

CREATE POLICY "Users can insert own plans" ON xhs_weekly_plans
  FOR INSERT WITH CHECK (auth.uid() = supabase_uuid);

CREATE POLICY "Users can update own plans" ON xhs_weekly_plans
  FOR UPDATE USING (auth.uid() = supabase_uuid);

CREATE POLICY "Users can view own tasks" ON xhs_daily_tasks
  FOR SELECT USING (auth.uid() = supabase_uuid);

CREATE POLICY "Users can insert own tasks" ON xhs_daily_tasks
  FOR INSERT WITH CHECK (auth.uid() = supabase_uuid);

CREATE POLICY "Users can update own tasks" ON xhs_daily_tasks
  FOR UPDATE USING (auth.uid() = supabase_uuid);

CREATE POLICY "Users can view own status" ON xhs_automation_status
  FOR SELECT USING (auth.uid() = supabase_uuid);

CREATE POLICY "Users can insert own status" ON xhs_automation_status
  FOR INSERT WITH CHECK (auth.uid() = supabase_uuid);

CREATE POLICY "Users can update own status" ON xhs_automation_status
  FOR UPDATE USING (auth.uid() = supabase_uuid);

-- ============================================

-- 6. 触发器：自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_strategies_updated_at BEFORE UPDATE ON xhs_content_strategies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON xhs_weekly_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON xhs_daily_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_status_updated_at BEFORE UPDATE ON xhs_automation_status
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================

-- 7. 清理旧数据的函数（可选）
CREATE OR REPLACE FUNCTION cleanup_old_tasks()
RETURNS void AS $$
BEGIN
  -- 删除30天前已发布的任务
  DELETE FROM xhs_daily_tasks
  WHERE status = 'published'
    AND published_at < NOW() - INTERVAL '30 days';
    
  -- 删除90天前的周计划
  DELETE FROM xhs_weekly_plans
  WHERE week_end_date < CURRENT_DATE - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- ============================================

-- 执行完成提示
DO $$
BEGIN
  RAISE NOTICE '✅ Supabase Schema 更新完成！';
  RAISE NOTICE '📊 已创建4个表：';
  RAISE NOTICE '   - xhs_content_strategies (内容策略)';
  RAISE NOTICE '   - xhs_weekly_plans (周计划)';
  RAISE NOTICE '   - xhs_daily_tasks (每日任务)';
  RAISE NOTICE '   - xhs_automation_status (运营状态)';
  RAISE NOTICE '🔒 RLS策略已启用，确保数据安全';
  RAISE NOTICE '⏰ 自动更新时间戳已配置';
END $$;
