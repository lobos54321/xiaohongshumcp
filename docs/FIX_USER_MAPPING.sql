-- ============================================
-- 修复用户映射问题
-- ============================================

-- 问题：后端日志显示 "⚠️ [DB] 未找到用户映射，跳过数据库保存: user_9dee489189a644ee_prome"
-- 原因：xhs_user_mapping 表中缺少该用户的映射记录
-- 解决：手动插入映射记录

-- 步骤1: 检查是否已存在映射
SELECT * FROM xhs_user_mapping WHERE xhs_user_id = 'user_9dee489189a644ee_prome';

-- 步骤2: 如果不存在，插入映射记录
-- 注意：需要替换 'YOUR_SUPABASE_UUID' 为实际的用户UUID
-- 用户UUID应该是前端 localStorage 中的 supabase.auth.user.id
-- 格式类似：9dee4891-89a6-44ee-8fe8-69097846e97d

INSERT INTO xhs_user_mapping (supabase_uuid, xhs_user_id)
VALUES (
  '9dee4891-89a6-44ee-8fe8-69097846e97d',  -- ← 替换为实际的Supabase UUID
  'user_9dee489189a644ee_prome'
)
ON CONFLICT (xhs_user_id) DO NOTHING;

-- 步骤3: 验证插入成功
SELECT * FROM xhs_user_mapping WHERE xhs_user_id = 'user_9dee489189a644ee_prome';

-- 步骤4: 检查用户数据是否已存在（应该在文件系统中）
-- 后端日志显示：💾 [FS] 数据已备份到文件: /app/data/auto-content/user_9dee489189a644ee_prome.json
-- 需要重启后端服务，让它从文件加载数据并保存到数据库

-- ============================================
-- 注意事项
-- ============================================

-- 1. Supabase UUID 来源
--    - 前端登录后，从 supabase.auth.user.id 获取
--    - 格式：9dee4891-89a6-44ee-8fe8-69097846e97d（36个字符，包含4个破折号）

-- 2. xhs_user_id 格式
--    - 前端生成规则：user_{UUID前14位去破折号}_prome
--    - 示例：user_9dee489189a644ee_prome

-- 3. 执行顺序
--    a) 在 Supabase SQL Editor 中执行步骤2的INSERT语句
--    b) 重启后端服务（让它重新加载数据）
--    c) 前端刷新页面
--    d) 检查后端日志，应该看到：
--       📂 [DB] 从数据库加载用户数据...
--       📂 [DB] 找到 1 个用户
--       💾 [DB] 数据已保存到数据库: user_9dee489189a644ee_prome

-- ============================================
-- 获取Supabase UUID的方法
-- ============================================

-- 方法1: 从浏览器控制台获取
-- 打开 https://www.prome.live/xiaohongshu
-- 按F12打开控制台，执行：
-- supabase.auth.getUser().then(({data}) => console.log(data.user.id))

-- 方法2: 从auth.users表查询
-- SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 5;

-- ============================================
-- 完整示例（假设UUID是 9dee4891-89a6-44ee-8fe8-69097846e97d）
-- ============================================

-- 插入映射
-- INSERT INTO xhs_user_mapping (supabase_uuid, xhs_user_id)
-- VALUES (
--   '9dee4891-89a6-44ee-8fe8-69097846e97d',
--   'user_9dee489189a644ee_prome'
-- );

-- 验证
-- SELECT * FROM xhs_user_mapping WHERE xhs_user_id = 'user_9dee489189a644ee_prome';
