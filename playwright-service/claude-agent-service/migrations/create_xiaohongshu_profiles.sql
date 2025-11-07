-- 小红书账号信息表
CREATE TABLE IF NOT EXISTS xiaohongshu_profiles (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  xhs_user_id VARCHAR(255) NOT NULL,
  nickname VARCHAR(255),
  avatar_url TEXT,
  red_id VARCHAR(100),
  user_basic_info JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, xhs_user_id)
);

CREATE INDEX IF NOT EXISTS idx_xiaohongshu_profiles_user_id ON xiaohongshu_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_xiaohongshu_profiles_xhs_user_id ON xiaohongshu_profiles(xhs_user_id);
CREATE INDEX IF NOT EXISTS idx_xiaohongshu_profiles_active ON xiaohongshu_profiles(user_id, is_active);
