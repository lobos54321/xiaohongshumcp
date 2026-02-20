-- ============================================
-- brain_briefs 表 - 大脑规划层内容简报
-- Phase 2: BrainService 产品分析与内容规划
-- ============================================

CREATE TABLE IF NOT EXISTS brain_briefs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    task_id TEXT,
    product_name TEXT NOT NULL,
    target_audience TEXT,
    marketing_goal TEXT DEFAULT 'brand',
    content_mode TEXT DEFAULT 'IMAGE_TEXT',
    core_message TEXT,
    tone_and_style TEXT,
    key_selling_points JSONB DEFAULT '[]'::jsonb,
    platform_strategies JSONB DEFAULT '{}'::jsonb,
    mother_copy JSONB DEFAULT '{}'::jsonb,
    raw_analysis TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_brain_briefs_user_id ON brain_briefs(user_id);
CREATE INDEX IF NOT EXISTS idx_brain_briefs_task_id ON brain_briefs(task_id);
CREATE INDEX IF NOT EXISTS idx_brain_briefs_created_at ON brain_briefs(created_at DESC);

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_brain_briefs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_brain_briefs_updated_at
    BEFORE UPDATE ON brain_briefs
    FOR EACH ROW
    EXECUTE FUNCTION update_brain_briefs_updated_at();

-- RLS 策略
ALTER TABLE brain_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on brain_briefs"
    ON brain_briefs
    FOR ALL
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE brain_briefs IS '大脑规划层 - 存储 BrainService 生成的内容简报和产品分析结果';
COMMENT ON COLUMN brain_briefs.core_message IS '核心信息 - Claude 分析提炼的产品核心卖点';
COMMENT ON COLUMN brain_briefs.tone_and_style IS '语调风格 - 建议的内容创作风格';
COMMENT ON COLUMN brain_briefs.key_selling_points IS '关键卖点列表 - JSON数组';
COMMENT ON COLUMN brain_briefs.platform_strategies IS '各平台策略 - JSON对象，key为平台名';
COMMENT ON COLUMN brain_briefs.mother_copy IS 'Dify生成的母文案 - JSON对象';
COMMENT ON COLUMN brain_briefs.raw_analysis IS 'Claude原始分析文本';
