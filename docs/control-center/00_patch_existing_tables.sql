-- ============================================================
-- 智能中控中心 - 增量迁移脚本（处理已有表）
-- 
-- 🔥 此脚本专门处理 xhs_accounts / xhs_daily_tasks 等已存在表
-- 请先执行此脚本，再执行 02_db_and_rls.sql
-- 
-- 生成时间: 2025-12-14
-- 版本: 1.0.1-patch
-- ============================================================

-- ============================================================
-- 0. 启用扩展
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. 修复 xhs_accounts 表（添加缺失列）
-- ============================================================
DO $$ 
BEGIN
  -- supabase_uuid
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xhs_accounts' AND column_name = 'supabase_uuid') THEN
    ALTER TABLE xhs_accounts ADD COLUMN supabase_uuid UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    RAISE NOTICE '[xhs_accounts] Added column: supabase_uuid';
  END IF;

  -- disabled_until (circuit breaker)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xhs_accounts' AND column_name = 'disabled_until') THEN
    ALTER TABLE xhs_accounts ADD COLUMN disabled_until TIMESTAMPTZ;
    RAISE NOTICE '[xhs_accounts] Added column: disabled_until';
  END IF;

  -- updated_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xhs_accounts' AND column_name = 'updated_at') THEN
    ALTER TABLE xhs_accounts ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
    RAISE NOTICE '[xhs_accounts] Added column: updated_at';
  END IF;
END $$;

-- ============================================================
-- 2. 修复 xhs_daily_tasks 表（如果存在）
-- ============================================================
DO $$ 
BEGIN
  -- 检查表是否存在
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'xhs_daily_tasks') THEN
    
    -- supabase_uuid
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xhs_daily_tasks' AND column_name = 'supabase_uuid') THEN
      ALTER TABLE xhs_daily_tasks ADD COLUMN supabase_uuid UUID REFERENCES auth.users(id) ON DELETE CASCADE;
      RAISE NOTICE '[xhs_daily_tasks] Added column: supabase_uuid';
    END IF;

    -- xhs_account_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xhs_daily_tasks' AND column_name = 'xhs_account_id') THEN
      ALTER TABLE xhs_daily_tasks ADD COLUMN xhs_account_id UUID REFERENCES xhs_accounts(id) ON DELETE CASCADE;
      RAISE NOTICE '[xhs_daily_tasks] Added column: xhs_account_id';
    END IF;

    -- orchestrator_run_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xhs_daily_tasks' AND column_name = 'orchestrator_run_id') THEN
      ALTER TABLE xhs_daily_tasks ADD COLUMN orchestrator_run_id TEXT DEFAULT 'legacy';
      RAISE NOTICE '[xhs_daily_tasks] Added column: orchestrator_run_id';
    END IF;

    -- strategy_version
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xhs_daily_tasks' AND column_name = 'strategy_version') THEN
      ALTER TABLE xhs_daily_tasks ADD COLUMN strategy_version INT DEFAULT 1;
      RAISE NOTICE '[xhs_daily_tasks] Added column: strategy_version';
    END IF;

    -- plan_version
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xhs_daily_tasks' AND column_name = 'plan_version') THEN
      ALTER TABLE xhs_daily_tasks ADD COLUMN plan_version INT DEFAULT 1;
      RAISE NOTICE '[xhs_daily_tasks] Added column: plan_version';
    END IF;

    -- content_mode
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xhs_daily_tasks' AND column_name = 'content_mode') THEN
      ALTER TABLE xhs_daily_tasks ADD COLUMN content_mode TEXT DEFAULT 'IMAGE_TEXT';
      RAISE NOTICE '[xhs_daily_tasks] Added column: content_mode';
    END IF;

    -- cooldown_keys
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xhs_daily_tasks' AND column_name = 'cooldown_keys') THEN
      ALTER TABLE xhs_daily_tasks ADD COLUMN cooldown_keys TEXT[];
      RAISE NOTICE '[xhs_daily_tasks] Added column: cooldown_keys';
    END IF;

    -- metadata
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xhs_daily_tasks' AND column_name = 'metadata') THEN
      ALTER TABLE xhs_daily_tasks ADD COLUMN metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
      RAISE NOTICE '[xhs_daily_tasks] Added column: metadata';
    END IF;

    -- updated_at
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xhs_daily_tasks' AND column_name = 'updated_at') THEN
      ALTER TABLE xhs_daily_tasks ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
      RAISE NOTICE '[xhs_daily_tasks] Added column: updated_at';
    END IF;

    -- scheduled_time (如果不存在)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xhs_daily_tasks' AND column_name = 'scheduled_time') THEN
      ALTER TABLE xhs_daily_tasks ADD COLUMN scheduled_time TIMESTAMPTZ DEFAULT now();
      RAISE NOTICE '[xhs_daily_tasks] Added column: scheduled_time';
    END IF;

  END IF;
END $$;

-- ============================================================
-- 3. 修复 xhs_task_steps 表（如果存在）
-- ============================================================
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'xhs_task_steps') THEN
    
    -- supabase_uuid
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xhs_task_steps' AND column_name = 'supabase_uuid') THEN
      ALTER TABLE xhs_task_steps ADD COLUMN supabase_uuid UUID REFERENCES auth.users(id) ON DELETE CASCADE;
      RAISE NOTICE '[xhs_task_steps] Added column: supabase_uuid';
    END IF;

    -- xhs_account_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xhs_task_steps' AND column_name = 'xhs_account_id') THEN
      ALTER TABLE xhs_task_steps ADD COLUMN xhs_account_id UUID REFERENCES xhs_accounts(id) ON DELETE CASCADE;
      RAISE NOTICE '[xhs_task_steps] Added column: xhs_account_id';
    END IF;

    -- step_key
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xhs_task_steps' AND column_name = 'step_key') THEN
      ALTER TABLE xhs_task_steps ADD COLUMN step_key TEXT;
      RAISE NOTICE '[xhs_task_steps] Added column: step_key';
    END IF;

    -- scheduled_at
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xhs_task_steps' AND column_name = 'scheduled_at') THEN
      ALTER TABLE xhs_task_steps ADD COLUMN scheduled_at TIMESTAMPTZ;
      RAISE NOTICE '[xhs_task_steps] Added column: scheduled_at';
    END IF;

    -- max_attempts
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xhs_task_steps' AND column_name = 'max_attempts') THEN
      ALTER TABLE xhs_task_steps ADD COLUMN max_attempts INT DEFAULT 3;
      RAISE NOTICE '[xhs_task_steps] Added column: max_attempts';
    END IF;

    -- usage
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xhs_task_steps' AND column_name = 'usage') THEN
      ALTER TABLE xhs_task_steps ADD COLUMN usage JSONB;
      RAISE NOTICE '[xhs_task_steps] Added column: usage';
    END IF;

    -- provider_run_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xhs_task_steps' AND column_name = 'provider_run_id') THEN
      ALTER TABLE xhs_task_steps ADD COLUMN provider_run_id TEXT;
      RAISE NOTICE '[xhs_task_steps] Added column: provider_run_id';
    END IF;

  END IF;
END $$;

-- ============================================================
-- 4. 修复 xhs_content_strategies 表（如果存在）
-- ============================================================
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'xhs_content_strategies') THEN
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xhs_content_strategies' AND column_name = 'supabase_uuid') THEN
      ALTER TABLE xhs_content_strategies ADD COLUMN supabase_uuid UUID REFERENCES auth.users(id) ON DELETE CASCADE;
      RAISE NOTICE '[xhs_content_strategies] Added column: supabase_uuid';
    END IF;

  END IF;
END $$;

-- ============================================================
-- 5. 修复 xhs_weekly_plans 表（如果存在）
-- ============================================================
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'xhs_weekly_plans') THEN
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xhs_weekly_plans' AND column_name = 'supabase_uuid') THEN
      ALTER TABLE xhs_weekly_plans ADD COLUMN supabase_uuid UUID REFERENCES auth.users(id) ON DELETE CASCADE;
      RAISE NOTICE '[xhs_weekly_plans] Added column: supabase_uuid';
    END IF;

  END IF;
END $$;

-- ============================================================
-- 6. 让 NOT NULL 列变成可选（暂时），稍后填充
-- ============================================================
DO $$
BEGIN
  -- 如果 orchestrator_run_id 是 NOT NULL 但有 NULL 值，先设置默认值
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xhs_daily_tasks' AND column_name = 'orchestrator_run_id') THEN
    UPDATE xhs_daily_tasks SET orchestrator_run_id = 'legacy' WHERE orchestrator_run_id IS NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xhs_daily_tasks' AND column_name = 'strategy_version') THEN
    UPDATE xhs_daily_tasks SET strategy_version = 1 WHERE strategy_version IS NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xhs_daily_tasks' AND column_name = 'plan_version') THEN
    UPDATE xhs_daily_tasks SET plan_version = 1 WHERE plan_version IS NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'xhs_daily_tasks' AND column_name = 'content_mode') THEN
    UPDATE xhs_daily_tasks SET content_mode = 'IMAGE_TEXT' WHERE content_mode IS NULL;
  END IF;
END $$;

-- ============================================================
-- 完成 - 请继续执行 02_db_migration.sql
-- ============================================================
SELECT 'Patch complete! Now run 02_db_migration.sql' AS message;
