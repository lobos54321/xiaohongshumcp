-- 小红书用户Cookie存储表
CREATE TABLE IF NOT EXISTS xhs_user_cookies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  supabase_uuid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  xhs_user_id TEXT NOT NULL UNIQUE,
  cookies JSONB NOT NULL DEFAULT '[]'::jsonb,
  cookie_count INTEGER NOT NULL DEFAULT 0,
  cookie_size INTEGER NOT NULL DEFAULT 0,
  last_validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 为查询优化创建索引
CREATE INDEX IF NOT EXISTS idx_xhs_cookies_supabase_uuid ON xhs_user_cookies(supabase_uuid);
CREATE INDEX IF NOT EXISTS idx_xhs_cookies_xhs_user_id ON xhs_user_cookies(xhs_user_id);
CREATE INDEX IF NOT EXISTS idx_xhs_cookies_updated_at ON xhs_user_cookies(updated_at);

-- 自动更新 updated_at 字段的触发器
CREATE OR REPLACE FUNCTION update_xhs_cookies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER xhs_cookies_updated_at
BEFORE UPDATE ON xhs_user_cookies
FOR EACH ROW
EXECUTE FUNCTION update_xhs_cookies_updated_at();

-- RLS (Row Level Security) 策略
ALTER TABLE xhs_user_cookies ENABLE ROW LEVEL SECURITY;

-- 用户只能访问自己的Cookie
CREATE POLICY "Users can view their own cookies"
ON xhs_user_cookies FOR SELECT
USING (auth.uid() = supabase_uuid);

CREATE POLICY "Users can insert their own cookies"
ON xhs_user_cookies FOR INSERT
WITH CHECK (auth.uid() = supabase_uuid);

CREATE POLICY "Users can update their own cookies"
ON xhs_user_cookies FOR UPDATE
USING (auth.uid() = supabase_uuid);

CREATE POLICY "Users can delete their own cookies"
ON xhs_user_cookies FOR DELETE
USING (auth.uid() = supabase_uuid);

-- 添加注释
COMMENT ON TABLE xhs_user_cookies IS '小红书用户Cookie存储表，用于持久化保存用户的登录状态';
COMMENT ON COLUMN xhs_user_cookies.supabase_uuid IS 'Supabase用户UUID';
COMMENT ON COLUMN xhs_user_cookies.xhs_user_id IS '小红书用户ID（映射表中的ID）';
COMMENT ON COLUMN xhs_user_cookies.cookies IS 'Cookie数组（JSON格式）';
COMMENT ON COLUMN xhs_user_cookies.cookie_count IS 'Cookie数量';
COMMENT ON COLUMN xhs_user_cookies.cookie_size IS 'Cookie总大小（字节）';
COMMENT ON COLUMN xhs_user_cookies.last_validated_at IS '最后验证时间';
