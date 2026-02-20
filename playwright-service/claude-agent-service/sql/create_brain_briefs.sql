-- brain_briefs 表：Brain 规划层生成的统一 brief
CREATE TABLE IF NOT EXISTS brain_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  product_description TEXT,
  product_analysis JSONB DEFAULT '{}',
  recommended_modes TEXT[] DEFAULT '{}',
  selected_modes TEXT[] DEFAULT '{}',
  mode_reasoning TEXT,
  core_message TEXT,
  key_selling_points TEXT[],
  tone_and_style TEXT,
  target_audience TEXT,
  content_angle TEXT,
  mother_copy_title TEXT,
  mother_copy_text TEXT,
  mother_copy_emotion TEXT,
  pipeline_status JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brain_briefs_user_id ON brain_briefs(user_id);
CREATE INDEX IF NOT EXISTS idx_brain_briefs_task_id ON brain_briefs(task_id);
