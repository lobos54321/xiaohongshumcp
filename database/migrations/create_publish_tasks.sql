-- 多平台发布任务表
-- 追踪内容在不同平台的发布状态

CREATE TABLE IF NOT EXISTS publish_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    
    -- 内容关联 (可选：关联到已有内容表)
    content_id UUID,  -- 可关联到 xhs_published_notes 或 avatar_video_generations
    content_type TEXT NOT NULL DEFAULT 'image_text', -- 'image_text' | 'video'
    
    -- 内容数据 (冗余存储，确保发布时内容可用)
    title TEXT NOT NULL,
    content TEXT,
    images TEXT[] DEFAULT '{}',
    video_url TEXT,
    tags TEXT[] DEFAULT '{}',
    
    -- 目标平台
    platform TEXT NOT NULL, -- 'xiaohongshu' | 'tiktok' | 'instagram' | 'youtube' | 'pinterest'
    
    -- 发布方式
    method TEXT NOT NULL, -- 'chrome_extension' | 'skyvern'
    
    -- 发布状态
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'queued' | 'publishing' | 'completed' | 'failed'
    
    -- 平台返回信息
    platform_post_id TEXT,  -- 平台帖子ID (如小红书 feedId)
    published_url TEXT,     -- 发布后的URL
    
    -- Skyvern 任务追踪
    skyvern_task_id TEXT,
    skyvern_run_id TEXT,
    
    -- 错误信息
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- 时间戳
    scheduled_at TIMESTAMPTZ,  -- 计划发布时间
    published_at TIMESTAMPTZ,  -- 实际发布时间
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_publish_tasks_user_id ON publish_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_publish_tasks_status ON publish_tasks(status);
CREATE INDEX IF NOT EXISTS idx_publish_tasks_platform ON publish_tasks(platform);
CREATE INDEX IF NOT EXISTS idx_publish_tasks_created_at ON publish_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_publish_tasks_content ON publish_tasks(content_id) WHERE content_id IS NOT NULL;

-- 复合索引：用户 + 平台 + 状态
CREATE INDEX IF NOT EXISTS idx_publish_tasks_user_platform_status 
    ON publish_tasks(user_id, platform, status);

-- RLS 策略
ALTER TABLE publish_tasks ENABLE ROW LEVEL SECURITY;

-- 用户只能查看自己的发布任务
CREATE POLICY "Users can view own publish tasks" ON publish_tasks
    FOR SELECT 
    USING (auth.uid() = user_id);

-- 用户只能创建自己的发布任务
CREATE POLICY "Users can insert own publish tasks" ON publish_tasks
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

-- 用户只能更新自己的发布任务
CREATE POLICY "Users can update own publish tasks" ON publish_tasks
    FOR UPDATE 
    USING (auth.uid() = user_id);

-- 用户只能删除自己的发布任务
CREATE POLICY "Users can delete own publish tasks" ON publish_tasks
    FOR DELETE 
    USING (auth.uid() = user_id);

-- 更新时间触发器
CREATE OR REPLACE FUNCTION update_publish_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_publish_tasks_updated_at ON publish_tasks;
CREATE TRIGGER update_publish_tasks_updated_at
    BEFORE UPDATE ON publish_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_publish_tasks_updated_at();

-- 注释
COMMENT ON TABLE publish_tasks IS '多平台发布任务 - 追踪内容在各平台的发布状态';
COMMENT ON COLUMN publish_tasks.platform IS '目标平台: xiaohongshu, tiktok, instagram, youtube, pinterest';
COMMENT ON COLUMN publish_tasks.method IS '发布方式: chrome_extension (小红书), skyvern (其他平台)';
COMMENT ON COLUMN publish_tasks.skyvern_task_id IS 'Skyvern 工作流任务 ID';
