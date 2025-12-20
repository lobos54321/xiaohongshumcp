-- =====================================================
-- 创建 workflow_steps 表
-- 用于记录内容生成工作流的步骤状态
-- =====================================================

CREATE TABLE IF NOT EXISTS xhs_workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES xhs_daily_tasks(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,              -- 'copy-gen', 'copy-analyze', etc.
  step_title TEXT NOT NULL,            -- '智能文案生成'
  agent_name TEXT,                     -- 'Prome Marketing Engine'
  status TEXT DEFAULT 'pending',       -- pending/processing/completed/failed
  progress INT DEFAULT 0,              -- 0-100
  current_action TEXT,                 -- 当前正在做的动作描述
  eta TEXT,                            -- 预计剩余时间
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  time_taken TEXT,                     -- 耗时 e.g. '2.8s'
  output JSONB,                        -- 输出结果 (文案、图片URL等)
  error TEXT,                          -- 错误信息
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_workflow_steps_task_id ON xhs_workflow_steps(task_id);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_status ON xhs_workflow_steps(status);

-- 唯一约束：每个任务的每个步骤只有一条记录
CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_steps_task_step 
  ON xhs_workflow_steps(task_id, step_key);

-- RLS 策略
ALTER TABLE xhs_workflow_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on workflow_steps"
  ON xhs_workflow_steps FOR ALL
  USING (true)
  WITH CHECK (true);

-- 注释
COMMENT ON TABLE xhs_workflow_steps IS '记录工作流每个步骤的执行状态，支持实时进度展示';
COMMENT ON COLUMN xhs_workflow_steps.step_key IS '步骤标识符：copy-gen, copy-analyze, image-adapt, image-gen, task-save 等';
COMMENT ON COLUMN xhs_workflow_steps.progress IS '执行进度百分比 0-100';
COMMENT ON COLUMN xhs_workflow_steps.output IS 'JSON 格式的输出结果，包含 title, text, goldenQuotes, imageUrls 等';
