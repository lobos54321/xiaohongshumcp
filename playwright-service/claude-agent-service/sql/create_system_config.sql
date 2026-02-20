-- system_config 表：集中管理所有 API key 和系统配置
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  description TEXT,
  is_secret BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by TEXT
);

-- 插入默认配置项
INSERT INTO system_config (key, value, category, description, is_secret) VALUES
  ('ANTHROPIC_API_KEY', '', 'api_keys', 'Anthropic Claude API Key', true),
  ('CLAUDE_MODEL', 'claude-opus-4-6', 'models', 'Claude 主模型', false),
  ('VARIANT_MODEL', 'claude-opus-4-6', 'models', '平台适配变体模型', false),
  ('GEMINI_API_KEY', '', 'api_keys', 'Gemini API Key', true),
  ('GEMINI_BASE_URL', 'http://bruder.yukinoapi.com/v1', 'urls', 'Gemini API Base URL', false),
  ('GEMINI_MODEL', 'gemini-3-pro-image-preview', 'models', 'Gemini 图片生成模型', false),
  ('GEMINI_TEXT_MODEL', 'gemini-2.5-flash', 'models', 'Gemini 文本模型', false),
  ('DIFY_API_KEY', '', 'api_keys', 'Dify API Key', true),
  ('DIFY_API_URL', 'https://api.dify.ai/v1', 'urls', 'Dify API URL', false),
  ('RUNNINGHUB_API_KEY', '', 'api_keys', 'RunningHub API Key', true),
  ('N8N_UGC_WEBHOOK_URL', '', 'urls', 'N8n UGC Webhook URL', false),
  ('N8N_CALLBACK_URL', 'https://xiaohongshu-automation-ai.zeabur.app/api/ugc-video-callback', 'urls', 'N8n 回调 URL', false),
  ('SKYVERN_API_KEY', '', 'api_keys', 'Skyvern API Key', true),
  ('SKYVERN_API_URL', '', 'urls', 'Skyvern API URL', false),
  ('UNSPLASH_API_KEY', '', 'api_keys', 'Unsplash API Key', true),
  ('RESEND_API_KEY', '', 'api_keys', 'Resend Email API Key', true),
  ('FROM_EMAIL', 'noreply@prome.live', 'general', '发件人邮箱', false)
ON CONFLICT (key) DO NOTHING;
