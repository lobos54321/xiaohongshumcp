-- ============================================
-- 用户素材库 (user_materials)
-- 支持素材时间线管理，让 AI 优先使用最新素材
-- ============================================

CREATE TABLE IF NOT EXISTS user_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- 素材类型
  type TEXT NOT NULL CHECK (type IN ('image', 'document', 'text', 'video')),
  
  -- 内容
  url TEXT,                     -- 文件 URL (图片/文档/视频)
  content TEXT,                 -- 文本内容 (文案片段/产品描述)
  title TEXT,                   -- 素材标题/名称
  
  -- 分类和标签
  category TEXT CHECK (category IN (
    'product_image',    -- 产品图
    'scene_image',      -- 使用场景图
    'testimonial',      -- 客户评价
    'copy_fragment',    -- 文案片段
    'product_doc',      -- 产品文档
    'other'             -- 其他
  )),
  tags TEXT[] DEFAULT '{}',     -- 自定义标签
  
  -- 时间线 (关键！AI 按时间获取)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- AI 使用追踪
  last_used_at TIMESTAMPTZ,
  use_count INTEGER DEFAULT 0
);

-- 索引：按时间倒序获取用户最新素材
CREATE INDEX IF NOT EXISTS idx_user_materials_timeline 
  ON user_materials(user_id, created_at DESC);

-- 索引：按类型筛选
CREATE INDEX IF NOT EXISTS idx_user_materials_category 
  ON user_materials(user_id, category);

-- RLS 策略
ALTER TABLE user_materials ENABLE ROW LEVEL SECURITY;

-- 用户只能访问自己的素材
DROP POLICY IF EXISTS "user_materials_select" ON user_materials;
CREATE POLICY "user_materials_select" ON user_materials
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_materials_insert" ON user_materials;
CREATE POLICY "user_materials_insert" ON user_materials
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_materials_update" ON user_materials;
CREATE POLICY "user_materials_update" ON user_materials
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_materials_delete" ON user_materials;
CREATE POLICY "user_materials_delete" ON user_materials
  FOR DELETE USING (auth.uid() = user_id);

-- 允许服务角色完全访问
DROP POLICY IF EXISTS "user_materials_service" ON user_materials;
CREATE POLICY "user_materials_service" ON user_materials
  FOR ALL USING (auth.role() = 'service_role');

-- 自动更新 updated_at
CREATE OR REPLACE FUNCTION update_user_materials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_materials_updated_at ON user_materials;
CREATE TRIGGER trigger_user_materials_updated_at
  BEFORE UPDATE ON user_materials
  FOR EACH ROW EXECUTE FUNCTION update_user_materials_updated_at();

-- 完成提示
DO $$
BEGIN
  RAISE NOTICE '✅ user_materials 表创建成功！';
END $$;
