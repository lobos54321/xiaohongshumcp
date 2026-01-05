-- 创建数字人视频生成记录表
-- RunningHub 文件只保留 14 天，我们需要持久化保存

CREATE TABLE IF NOT EXISTS avatar_video_generations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    task_id TEXT,
    script TEXT,
    audio_url TEXT,
    video_url TEXT,
    audio_duration INTEGER,
    runninghub_task_id TEXT,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_avatar_video_generations_user_id ON avatar_video_generations(user_id);
CREATE INDEX IF NOT EXISTS idx_avatar_video_generations_created_at ON avatar_video_generations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_avatar_video_generations_status ON avatar_video_generations(status);

-- =========================================
-- RLS 策略 - 确保用户只能看到自己的视频
-- =========================================
ALTER TABLE avatar_video_generations ENABLE ROW LEVEL SECURITY;

-- 1. 用户只能 SELECT 自己的记录
CREATE POLICY "Users can view own video generations" ON avatar_video_generations
    FOR SELECT 
    USING (auth.uid() = user_id);

-- 2. 用户只能 INSERT 自己的记录
CREATE POLICY "Users can insert own video generations" ON avatar_video_generations
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

-- 3. 用户只能 UPDATE 自己的记录
CREATE POLICY "Users can update own video generations" ON avatar_video_generations
    FOR UPDATE 
    USING (auth.uid() = user_id);

-- 4. 用户只能 DELETE 自己的记录
CREATE POLICY "Users can delete own video generations" ON avatar_video_generations
    FOR DELETE 
    USING (auth.uid() = user_id);

-- 5. 服务端 (service_role) 有完全访问权限 (用于后端操作)
-- 注意：使用 service_role key 的请求会自动绕过 RLS

-- 注释
COMMENT ON TABLE avatar_video_generations IS '数字人视频生成记录 - 持久化存储，用户只能访问自己的记录';
COMMENT ON COLUMN avatar_video_generations.audio_url IS 'TTS 生成的音频 URL';
COMMENT ON COLUMN avatar_video_generations.video_url IS '数字人视频 URL';
COMMENT ON COLUMN avatar_video_generations.audio_duration IS '音频时长（秒）';
COMMENT ON COLUMN avatar_video_generations.runninghub_task_id IS 'RunningHub 任务 ID';
