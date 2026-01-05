-- ============================================
-- 爆款素材库 (creative_references)
-- 存储同类产品/竞品的爆款内容用于参考改写
-- ============================================

CREATE TABLE IF NOT EXISTS creative_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- 来源信息
  platform TEXT NOT NULL CHECK (platform IN ('xiaohongshu', 'douyin', 'weibo', 'bilibili', 'other')),
  original_url TEXT,
  collected_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- 内容
  title TEXT,
  content TEXT,
  cover_image_url TEXT,
  
  -- 互动数据
  engagement_count INTEGER DEFAULT 0,  -- 总互动 (点赞+评论+收藏)
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  collect_count INTEGER DEFAULT 0,
  
  -- 分类
  category TEXT CHECK (category IN (
    'same_product',   -- 同类产品
    'competitor',     -- 竞品
    'industry',       -- 行业通用
    'trending'        -- 热门趋势
  )),
  relevance_score FLOAT DEFAULT 0.5,  -- 与用户产品的相关度 (0-1)
  
  -- AI 分析
  success_factors TEXT[],             -- 成功因素: ['emotional', 'practical', 'trending', 'storytelling']
  key_phrases TEXT[],                 -- 关键金句
  rewritable_parts TEXT,              -- 可改写的片段
  
  -- 使用追踪
  used_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引：按互动量排序获取热门参考
CREATE INDEX IF NOT EXISTS idx_creative_refs_engagement 
  ON creative_references(user_id, engagement_count DESC);

-- 索引：按相关度排序
CREATE INDEX IF NOT EXISTS idx_creative_refs_relevance 
  ON creative_references(user_id, relevance_score DESC);

-- 索引：按采集时间排序
CREATE INDEX IF NOT EXISTS idx_creative_refs_collected 
  ON creative_references(user_id, collected_at DESC);

-- RLS 策略
ALTER TABLE creative_references ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creative_refs_select" ON creative_references;
CREATE POLICY "creative_refs_select" ON creative_references
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "creative_refs_insert" ON creative_references;
CREATE POLICY "creative_refs_insert" ON creative_references
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "creative_refs_update" ON creative_references;
CREATE POLICY "creative_refs_update" ON creative_references
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "creative_refs_delete" ON creative_references;
CREATE POLICY "creative_refs_delete" ON creative_references
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "creative_refs_service" ON creative_references;
CREATE POLICY "creative_refs_service" ON creative_references
  FOR ALL USING (auth.role() = 'service_role');

-- 完成提示
DO $$
BEGIN
  RAISE NOTICE '✅ creative_references 表创建成功！';
END $$;
