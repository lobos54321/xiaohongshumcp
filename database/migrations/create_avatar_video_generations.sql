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

-- RLS 策略
ALTER TABLE avatar_video_generations ENABLE ROW LEVEL SECURITY;

-- 用户只能查看自己的记录
CREATE POLICY "Users can view own video generations" ON avatar_video_generations
    FOR SELECT USING (auth.uid() = user_id);

-- 服务端可以插入/更新
CREATE POLICY "Service can insert video generations" ON avatar_video_generations
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can update video generations" ON avatar_video_generations
    FOR UPDATE USING (true);

-- 注释
COMMENT ON TABLE avatar_video_generations IS '数字人视频生成记录 - 持久化存储';
COMMENT ON COLUMN avatar_video_generations.audio_url IS 'TTS 生成的音频 URL';
COMMENT ON COLUMN avatar_video_generations.video_url IS '数字人视频 URL';
COMMENT ON COLUMN avatar_video_generations.audio_duration IS '音频时长（秒）';
COMMENT ON COLUMN avatar_video_generations.runninghub_task_id IS 'RunningHub 任务 ID';
