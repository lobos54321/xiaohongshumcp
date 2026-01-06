-- 创建内容计划表
-- 存储 AI 生成的内容策略、周计划和每日任务

CREATE TABLE IF NOT EXISTS xhs_content_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    
    -- 用户配置
    user_profile JSONB,
    
    -- 内容策略
    strategy JSONB,
    
    -- 周计划
    weekly_plan JSONB,
    
    -- 每日任务列表
    daily_tasks JSONB,
    
    -- 生成状态: idle, generating, completed, failed
    generation_status TEXT DEFAULT 'idle',
    
    -- 时间戳
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_xhs_content_plans_user_id ON xhs_content_plans(user_id);

-- 创建唯一约束 (每个用户只有一个活跃计划)
CREATE UNIQUE INDEX IF NOT EXISTS idx_xhs_content_plans_user_id_unique ON xhs_content_plans(user_id);

-- 添加更新时间触发器
CREATE OR REPLACE FUNCTION update_xhs_content_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_xhs_content_plans_updated_at ON xhs_content_plans;
CREATE TRIGGER trigger_update_xhs_content_plans_updated_at
    BEFORE UPDATE ON xhs_content_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_xhs_content_plans_updated_at();

-- RLS 策略 (可选，根据需要启用)
-- ALTER TABLE xhs_content_plans ENABLE ROW LEVEL SECURITY;
