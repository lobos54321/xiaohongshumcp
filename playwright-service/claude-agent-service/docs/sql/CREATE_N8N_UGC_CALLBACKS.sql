-- N8n UGC 回调记录表
-- 用于接收和存储 N8n UGC 视频工作流的回调结果

CREATE TABLE IF NOT EXISTS n8n_ugc_callbacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) UNIQUE NOT NULL,
    task_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, completed, failed
    video_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT
);

-- 索引
CREATE INDEX idx_n8n_ugc_callbacks_session_id ON n8n_ugc_callbacks(session_id);
CREATE INDEX idx_n8n_ugc_callbacks_task_id ON n8n_ugc_callbacks(task_id);
CREATE INDEX idx_n8n_ugc_callbacks_status ON n8n_ugc_callbacks(status);

-- 注释
COMMENT ON TABLE n8n_ugc_callbacks IS 'N8n UGC 视频工作流回调记录';
COMMENT ON COLUMN n8n_ugc_callbacks.session_id IS '会话 ID (agent_xxx 格式)';
COMMENT ON COLUMN n8n_ugc_callbacks.task_id IS '关联的任务 ID';
COMMENT ON COLUMN n8n_ugc_callbacks.status IS '状态: pending/completed/failed';
COMMENT ON COLUMN n8n_ugc_callbacks.video_url IS '生成的视频 URL';
