-- ============================================================
-- Phase 1 验证脚本：数据健康检查 + 测试数据 + RPC 验证
-- 
-- 执行顺序：
-- 1. 运行"健康检查"部分
-- 2. 根据结果修复 supabase_uuid
-- 3. 运行"创建测试数据"部分
-- 4. 运行"RPC 验证"部分
-- ============================================================

-- ============================================================
-- 1. 健康检查：xhs_accounts.supabase_uuid 完整性
-- ============================================================
SELECT '=== 1.1 检查 supabase_uuid 缺失的账号 ===' AS step;

SELECT id, nickname, xhs_user_id, supabase_uuid, created_at
FROM xhs_accounts
WHERE supabase_uuid IS NULL;

-- 如果有结果，需要手动补齐 supabase_uuid
-- UPDATE xhs_accounts SET supabase_uuid = '<your-auth-user-id>' WHERE id = '<account-id>';

-- ============================================================
-- 1.2 检查现有数据量
-- ============================================================
SELECT '=== 1.2 现有数据统计 ===' AS step;

SELECT 
  (SELECT COUNT(*) FROM xhs_accounts) AS accounts_count,
  (SELECT COUNT(*) FROM xhs_daily_tasks) AS tasks_count,
  (SELECT COUNT(*) FROM xhs_task_steps) AS steps_count,
  (SELECT COUNT(*) FROM xhs_content_strategies) AS strategies_count;

-- ============================================================
-- 2. 创建最小测试数据（需要替换 YOUR_SUPABASE_UUID）
-- 
-- 🔥 重要：将下面的 'YOUR_SUPABASE_UUID' 替换为你的真实用户 ID
-- 可以通过 SELECT id FROM auth.users LIMIT 1; 获取
-- ============================================================

-- 先获取一个有效的 supabase_uuid
SELECT '=== 2.0 获取可用的 auth.users ID ===' AS step;
SELECT id AS auth_user_id FROM auth.users LIMIT 1;

-- ============================================================
-- 2.1 确保有一个测试账号（如果 xhs_accounts 为空或没有 supabase_uuid）
-- 🔥 执行前请先替换 YOUR_SUPABASE_UUID
-- ============================================================
/*
INSERT INTO xhs_accounts (supabase_uuid, nickname, xhs_user_id)
VALUES (
  'YOUR_SUPABASE_UUID'::uuid,  -- 替换为上面查到的 auth_user_id
  '测试账号',
  'test_xhs_001'
)
ON CONFLICT DO NOTHING
RETURNING id, nickname;
*/

-- ============================================================
-- 2.2 创建测试 Task（需要一个有效的 xhs_account_id）
-- 🔥 执行前请先替换 YOUR_SUPABASE_UUID 和 YOUR_XHS_ACCOUNT_ID
-- ============================================================
/*
INSERT INTO xhs_daily_tasks (
  supabase_uuid,
  xhs_account_id,
  orchestrator_run_id,
  strategy_version,
  plan_version,
  scheduled_time,
  content_mode,
  title,
  content,
  status,
  metadata
)
VALUES (
  'YOUR_SUPABASE_UUID'::uuid,
  'YOUR_XHS_ACCOUNT_ID'::uuid,  -- 从 xhs_accounts 获取
  'test_run_001',
  1,
  1,
  now() + interval '1 hour',
  'IMAGE_TEXT',
  '测试标题：如何选购XX产品',
  '测试内容：这是一篇关于XX产品的测试文案...',
  'pending',
  jsonb_build_object(
    'review_mode', 'manual_confirm',
    'trace', jsonb_build_object(
      'sentiment_brief_id', 'test_brief_001',
      'material_analysis_id', 'test_material_001'
    )
  )
)
RETURNING id, title, status;
*/

-- ============================================================
-- 2.3 创建测试 Step (generate_copy)
-- 🔥 执行前请先替换相关 ID
-- ============================================================
/*
INSERT INTO xhs_task_steps (
  task_id,
  supabase_uuid,
  xhs_account_id,
  step_type,
  status,
  input_snapshot
)
VALUES (
  'YOUR_TASK_ID'::uuid,  -- 从上面创建的 task 获取
  'YOUR_SUPABASE_UUID'::uuid,
  'YOUR_XHS_ACCOUNT_ID'::uuid,
  'generate_copy',
  'pending',
  jsonb_build_object(
    'strategy_version', 1,
    'plan_version', 1,
    'orchestrator_run_id', 'test_run_001',
    'sentiment_brief_id', 'test_brief_001',
    'material_analysis_id', 'test_material_001',
    'task_mode', 'IMAGE_TEXT',
    'topic', '产品选购指南'
  )
)
RETURNING id, step_type, status;
*/

-- ============================================================
-- 3. RPC 验证（需要以 authenticated 用户身份执行）
-- 
-- 在 Supabase Dashboard 的 SQL Editor 中执行时默认是 service_role
-- 如果要测试 authenticated 权限，需要通过 API 或前端调用
-- ============================================================

-- 3.1 验证 RPC 函数存在
SELECT '=== 3.1 验证 RPC 函数存在 ===' AS step;

SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'lock_task_step',
    'finish_task_step',
    'recover_stuck_steps',
    'apply_video_fallback',
    'create_fetch_metrics_steps',
    'refresh_task_status',
    'orchestrator_maintenance_tick',
    'is_account_available',
    'disable_account_temporarily',
    'disable_my_account_temporarily',
    'enforce_step_ownership'
  )
ORDER BY routine_name;

-- 3.2 验证触发器存在
SELECT '=== 3.2 验证触发器存在 ===' AS step;

SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE trigger_name = 'trg_enforce_step_ownership';

-- 3.3 测试 orchestrator_maintenance_tick（service_role 可直接执行）
SELECT '=== 3.3 测试 maintenance_tick ===' AS step;

SELECT * FROM orchestrator_maintenance_tick();

-- ============================================================
-- 4. 快速验证：查看当前 pending steps
-- ============================================================
SELECT '=== 4.0 当前 pending steps ===' AS step;

SELECT id, task_id, step_type, status, scheduled_at, created_at
FROM xhs_task_steps
WHERE status = 'pending'
ORDER BY created_at DESC
LIMIT 10;
