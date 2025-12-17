-- ============================================================
-- 智能中控中心 - 完整数据库规范
-- 包含：表/索引/RLS/RPC/recover/fallback/metrics/aggregator
-- 
-- 生成时间: 2025-12-14
-- 版本: 1.0.1
-- ============================================================

-- ============================================================
-- 0. 预备：启用必要扩展
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- 用于 gen_random_uuid()

-- ============================================================
-- 1. 矩阵账号实体
-- ============================================================
CREATE TABLE IF NOT EXISTS xhs_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_uuid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  xhs_user_id TEXT,
  nickname TEXT,
  avatar_url TEXT,
  disabled_until TIMESTAMPTZ, -- circuit breaker
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE xhs_accounts ENABLE ROW LEVEL SECURITY;

-- RLS: 四条完整策略
CREATE POLICY "xhs_accounts_select" ON xhs_accounts 
  FOR SELECT USING (supabase_uuid = auth.uid());
CREATE POLICY "xhs_accounts_insert" ON xhs_accounts 
  FOR INSERT WITH CHECK (supabase_uuid = auth.uid());
CREATE POLICY "xhs_accounts_update" ON xhs_accounts 
  FOR UPDATE USING (supabase_uuid = auth.uid()) WITH CHECK (supabase_uuid = auth.uid());
CREATE POLICY "xhs_accounts_delete" ON xhs_accounts 
  FOR DELETE USING (supabase_uuid = auth.uid());

CREATE INDEX idx_accounts_user ON xhs_accounts(supabase_uuid);

-- ============================================================
-- 2. 用户产品配置
-- ============================================================
CREATE TABLE IF NOT EXISTS xhs_user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_uuid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_name TEXT,
  target_audience TEXT,
  marketing_goal TEXT,
  brand_style TEXT,
  review_mode TEXT DEFAULT 'manual_confirm' CHECK (review_mode IN ('auto_publish', 'manual_confirm')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE xhs_user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "xhs_user_profiles_select" ON xhs_user_profiles 
  FOR SELECT USING (supabase_uuid = auth.uid());
CREATE POLICY "xhs_user_profiles_insert" ON xhs_user_profiles 
  FOR INSERT WITH CHECK (supabase_uuid = auth.uid());
CREATE POLICY "xhs_user_profiles_update" ON xhs_user_profiles 
  FOR UPDATE USING (supabase_uuid = auth.uid()) WITH CHECK (supabase_uuid = auth.uid());
CREATE POLICY "xhs_user_profiles_delete" ON xhs_user_profiles 
  FOR DELETE USING (supabase_uuid = auth.uid());

-- ============================================================
-- 3. 材料分析
-- ============================================================
CREATE TABLE IF NOT EXISTS xhs_material_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_uuid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE xhs_material_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "xhs_material_analyses_select" ON xhs_material_analyses 
  FOR SELECT USING (supabase_uuid = auth.uid());
CREATE POLICY "xhs_material_analyses_insert" ON xhs_material_analyses 
  FOR INSERT WITH CHECK (supabase_uuid = auth.uid());
CREATE POLICY "xhs_material_analyses_update" ON xhs_material_analyses 
  FOR UPDATE USING (supabase_uuid = auth.uid()) WITH CHECK (supabase_uuid = auth.uid());
CREATE POLICY "xhs_material_analyses_delete" ON xhs_material_analyses 
  FOR DELETE USING (supabase_uuid = auth.uid());

-- ============================================================
-- 4. 舆情简报
-- ============================================================
CREATE TABLE IF NOT EXISTS xhs_sentiment_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_uuid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brief_data JSONB NOT NULL,
  source TEXT DEFAULT 'bettafish',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE xhs_sentiment_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "xhs_sentiment_briefs_select" ON xhs_sentiment_briefs 
  FOR SELECT USING (supabase_uuid = auth.uid());
CREATE POLICY "xhs_sentiment_briefs_insert" ON xhs_sentiment_briefs 
  FOR INSERT WITH CHECK (supabase_uuid = auth.uid());
CREATE POLICY "xhs_sentiment_briefs_update" ON xhs_sentiment_briefs 
  FOR UPDATE USING (supabase_uuid = auth.uid()) WITH CHECK (supabase_uuid = auth.uid());
CREATE POLICY "xhs_sentiment_briefs_delete" ON xhs_sentiment_briefs 
  FOR DELETE USING (supabase_uuid = auth.uid());

-- ============================================================
-- 5. 内容策略（账号维度 + version）
-- ============================================================
CREATE TABLE IF NOT EXISTS xhs_content_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_uuid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  xhs_account_id UUID NOT NULL REFERENCES xhs_accounts(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  persona JSONB,
  direction_strategy JSONB,
  mode_plan JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(xhs_account_id, version)
);

ALTER TABLE xhs_content_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "xhs_content_strategies_select" ON xhs_content_strategies 
  FOR SELECT USING (supabase_uuid = auth.uid());
CREATE POLICY "xhs_content_strategies_insert" ON xhs_content_strategies 
  FOR INSERT WITH CHECK (supabase_uuid = auth.uid());
CREATE POLICY "xhs_content_strategies_update" ON xhs_content_strategies 
  FOR UPDATE USING (supabase_uuid = auth.uid()) WITH CHECK (supabase_uuid = auth.uid());
CREATE POLICY "xhs_content_strategies_delete" ON xhs_content_strategies 
  FOR DELETE USING (supabase_uuid = auth.uid());

-- ============================================================
-- 6. 周计划（账号维度 + version）
-- ============================================================
CREATE TABLE IF NOT EXISTS xhs_weekly_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_uuid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  xhs_account_id UUID NOT NULL REFERENCES xhs_accounts(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  week_start_date DATE NOT NULL,
  plan_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(xhs_account_id, version, week_start_date)
);

ALTER TABLE xhs_weekly_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "xhs_weekly_plans_select" ON xhs_weekly_plans 
  FOR SELECT USING (supabase_uuid = auth.uid());
CREATE POLICY "xhs_weekly_plans_insert" ON xhs_weekly_plans 
  FOR INSERT WITH CHECK (supabase_uuid = auth.uid());
CREATE POLICY "xhs_weekly_plans_update" ON xhs_weekly_plans 
  FOR UPDATE USING (supabase_uuid = auth.uid()) WITH CHECK (supabase_uuid = auth.uid());
CREATE POLICY "xhs_weekly_plans_delete" ON xhs_weekly_plans 
  FOR DELETE USING (supabase_uuid = auth.uid());

-- ============================================================
-- 7. 可执行任务队列（账号维度）
-- 🔥 review_mode 冗余存储在 metadata.review_mode
-- ============================================================
CREATE TABLE IF NOT EXISTS xhs_daily_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_uuid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  xhs_account_id UUID NOT NULL REFERENCES xhs_accounts(id) ON DELETE CASCADE,
  orchestrator_run_id TEXT NOT NULL,
  strategy_version INT NOT NULL,
  plan_version INT NOT NULL,
  scheduled_time TIMESTAMPTZ NOT NULL,
  content_mode TEXT NOT NULL,
  title TEXT,
  content TEXT,
  image_urls TEXT[],
  hashtags TEXT[],
  cooldown_keys TEXT[],
  status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,  -- 必须包含 review_mode, trace 等
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT valid_content_mode CHECK (
    content_mode IN ('IMAGE_TEXT', 'UGC_VIDEO', 'AVATAR_VIDEO', 'AVATAR_MIXCUT')
  ),
  CONSTRAINT valid_status CHECK (
    status IN ('pending', 'copy_ready', 'video_ready', 'published', 'failed', 'skipped')
  )
);

ALTER TABLE xhs_daily_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "xhs_daily_tasks_select" ON xhs_daily_tasks 
  FOR SELECT USING (supabase_uuid = auth.uid());
CREATE POLICY "xhs_daily_tasks_insert" ON xhs_daily_tasks 
  FOR INSERT WITH CHECK (supabase_uuid = auth.uid());
CREATE POLICY "xhs_daily_tasks_update" ON xhs_daily_tasks 
  FOR UPDATE USING (supabase_uuid = auth.uid()) WITH CHECK (supabase_uuid = auth.uid());
CREATE POLICY "xhs_daily_tasks_delete" ON xhs_daily_tasks 
  FOR DELETE USING (supabase_uuid = auth.uid());

CREATE INDEX idx_tasks_account ON xhs_daily_tasks(xhs_account_id);
CREATE INDEX idx_tasks_orchestrator ON xhs_daily_tasks(orchestrator_run_id);
CREATE INDEX idx_tasks_scheduled ON xhs_daily_tasks(scheduled_time);
CREATE INDEX idx_tasks_cooldown ON xhs_daily_tasks USING GIN(cooldown_keys);

-- ============================================================
-- 8. 任务执行 Steps（审计核心）
-- 🔥 UNIQUE(task_id, step_type) 防止重复创建
-- 🔥 step_key 用于 fetch_metrics 窗口去重
-- ============================================================
CREATE TABLE IF NOT EXISTS xhs_task_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES xhs_daily_tasks(id) ON DELETE CASCADE,
  supabase_uuid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  xhs_account_id UUID NOT NULL REFERENCES xhs_accounts(id) ON DELETE CASCADE,
  step_type TEXT NOT NULL,
  step_key TEXT,  -- 用于 fetch_metrics 窗口: "fetch_metrics:1h"
  status TEXT NOT NULL DEFAULT 'pending',
  attempt INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  scheduled_at TIMESTAMPTZ,
  input_snapshot JSONB NOT NULL,
  output_payload JSONB,
  usage JSONB,
  provider TEXT,
  provider_run_id TEXT,
  error JSONB,
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- 🔥 input_snapshot 必须包含五个追溯字段（禁止 'inherit' 占位）
  CONSTRAINT input_snapshot_trace_check CHECK (
    input_snapshot ? 'strategy_version' AND
    input_snapshot ? 'plan_version' AND
    input_snapshot ? 'sentiment_brief_id' AND
    input_snapshot ? 'material_analysis_id' AND
    input_snapshot ? 'orchestrator_run_id' AND
    input_snapshot->>'sentiment_brief_id' != 'inherit' AND
    input_snapshot->>'material_analysis_id' != 'inherit'
  ),
  
  CONSTRAINT valid_step_type CHECK (
    step_type IN (
      'generate_copy', 'refine_title', 'compress_script',
      'generate_video', 'publish', 'fetch_metrics', 'review',
      'fallback_image_text'
    )
  ),
  CONSTRAINT valid_step_status CHECK (
    status IN ('pending', 'running', 'succeeded', 'failed', 'skipped', 'cancelled')
  )
);

CREATE UNIQUE INDEX idx_steps_unique_type 
  ON xhs_task_steps(task_id, step_type) 
  WHERE step_key IS NULL;

CREATE UNIQUE INDEX idx_steps_unique_key 
  ON xhs_task_steps(task_id, step_key) 
  WHERE step_key IS NOT NULL;

ALTER TABLE xhs_task_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "xhs_task_steps_select" ON xhs_task_steps 
  FOR SELECT USING (supabase_uuid = auth.uid());
CREATE POLICY "xhs_task_steps_insert" ON xhs_task_steps 
  FOR INSERT WITH CHECK (supabase_uuid = auth.uid());
CREATE POLICY "xhs_task_steps_update" ON xhs_task_steps 
  FOR UPDATE USING (supabase_uuid = auth.uid()) WITH CHECK (supabase_uuid = auth.uid());
CREATE POLICY "xhs_task_steps_delete" ON xhs_task_steps 
  FOR DELETE USING (supabase_uuid = auth.uid());

CREATE INDEX idx_task_steps_task_id ON xhs_task_steps(task_id);
CREATE INDEX idx_task_steps_status ON xhs_task_steps(status);
CREATE INDEX idx_task_steps_pending ON xhs_task_steps(supabase_uuid, step_type, status) 
  WHERE status = 'pending';
CREATE INDEX idx_task_steps_running ON xhs_task_steps(status, locked_at) 
  WHERE status = 'running';
CREATE INDEX idx_task_steps_scheduled ON xhs_task_steps(scheduled_at) 
  WHERE status = 'pending' AND scheduled_at IS NOT NULL;

-- ============================================================
-- 9. 内容签名表（P2 去重）
-- ============================================================
CREATE TABLE IF NOT EXISTS xhs_content_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_uuid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  xhs_account_id UUID NOT NULL REFERENCES xhs_accounts(id) ON DELETE CASCADE,
  signature_hash TEXT NOT NULL,
  signature_type TEXT NOT NULL CHECK (signature_type IN ('topic', 'pillar', 'hook', 'title')),
  task_id UUID REFERENCES xhs_daily_tasks(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE xhs_content_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "xhs_content_signatures_select" ON xhs_content_signatures 
  FOR SELECT USING (supabase_uuid = auth.uid());
CREATE POLICY "xhs_content_signatures_insert" ON xhs_content_signatures 
  FOR INSERT WITH CHECK (supabase_uuid = auth.uid());
CREATE POLICY "xhs_content_signatures_update" ON xhs_content_signatures 
  FOR UPDATE USING (supabase_uuid = auth.uid()) WITH CHECK (supabase_uuid = auth.uid());
CREATE POLICY "xhs_content_signatures_delete" ON xhs_content_signatures 
  FOR DELETE USING (supabase_uuid = auth.uid());

CREATE INDEX idx_signatures_lookup 
  ON xhs_content_signatures(xhs_account_id, signature_type, created_at DESC);

-- ============================================================
-- 10. RPC 函数：lock_task_step
-- ============================================================
CREATE OR REPLACE FUNCTION lock_task_step(
  p_step_id UUID,
  p_lock_owner TEXT
) RETURNS SETOF xhs_task_steps AS $$
DECLARE
  v_step xhs_task_steps;
BEGIN
  UPDATE xhs_task_steps
  SET status = 'running',
      locked_by = p_lock_owner,
      locked_at = now(),
      started_at = COALESCE(started_at, now()),
      attempt = attempt + 1
  WHERE id = p_step_id
    AND status = 'pending'
    AND attempt < max_attempts
    AND supabase_uuid = auth.uid()
    AND (scheduled_at IS NULL OR scheduled_at <= now())
  RETURNING * INTO v_step;

  IF v_step.id IS NOT NULL THEN
    RETURN NEXT v_step;
  END IF;
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION lock_task_step(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lock_task_step(UUID, TEXT) TO authenticated;

-- ============================================================
-- 11. RPC 函数：finish_task_step
-- ============================================================
CREATE OR REPLACE FUNCTION finish_task_step(
  p_step_id UUID,
  p_status TEXT,
  p_output_payload JSONB,
  p_usage JSONB,
  p_provider TEXT,
  p_provider_run_id TEXT,
  p_error JSONB DEFAULT NULL
) RETURNS SETOF xhs_task_steps AS $$
DECLARE
  v_step xhs_task_steps;
BEGIN
  UPDATE xhs_task_steps
  SET status = p_status,
      output_payload = p_output_payload,
      usage = p_usage,
      provider = p_provider,
      provider_run_id = p_provider_run_id,
      error = CASE 
        WHEN p_error IS NOT NULL THEN COALESCE(error, '{}'::jsonb) || p_error
        ELSE error
      END,
      locked_by = NULL,
      locked_at = NULL,
      finished_at = now()
  WHERE id = p_step_id
    AND status = 'running'
    AND supabase_uuid = auth.uid()
  RETURNING * INTO v_step;

  IF v_step.id IS NOT NULL THEN
    RETURN NEXT v_step;
  END IF;
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION finish_task_step(UUID, TEXT, JSONB, JSONB, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finish_task_step(UUID, TEXT, JSONB, JSONB, TEXT, TEXT, JSONB) TO authenticated;

-- ============================================================
-- 12. RPC 函数：recover_stuck_steps
-- ============================================================
CREATE OR REPLACE FUNCTION recover_stuck_steps()
RETURNS TABLE(
  recovered_count INT,
  recovered_step_ids UUID[]
) AS $$
DECLARE
  v_dify_ids UUID[];
  v_video_ids UUID[];
BEGIN
  WITH recovered AS (
    UPDATE xhs_task_steps
    SET status = 'pending',
        locked_by = NULL,
        locked_at = NULL,
        error = COALESCE(error, '{}'::jsonb) || jsonb_build_object(
          'recovery_' || to_char(now(), 'YYYYMMDD_HH24MISS'),
          jsonb_build_object(
            'reason', 'timeout',
            'rule', 'dify_20min',
            'attempt_at_recovery', attempt,
            'timestamp', now()
          )
        )
    WHERE status = 'running'
      AND step_type IN ('generate_copy', 'refine_title', 'compress_script')
      AND locked_at < now() - interval '20 minutes'
      AND attempt < max_attempts
    RETURNING id
  )
  SELECT array_agg(id) INTO v_dify_ids FROM recovered;

  WITH recovered AS (
    UPDATE xhs_task_steps
    SET status = 'pending',
        locked_by = NULL,
        locked_at = NULL,
        error = COALESCE(error, '{}'::jsonb) || jsonb_build_object(
          'recovery_' || to_char(now(), 'YYYYMMDD_HH24MISS'),
          jsonb_build_object(
            'reason', 'timeout',
            'rule', 'video_30min',
            'attempt_at_recovery', attempt,
            'timestamp', now()
          )
        )
    WHERE status = 'running'
      AND step_type = 'generate_video'
      AND locked_at < now() - interval '30 minutes'
      AND attempt < max_attempts
    RETURNING id
  )
  SELECT array_agg(id) INTO v_video_ids FROM recovered;

  RETURN QUERY SELECT 
    COALESCE(array_length(v_dify_ids, 1), 0) + COALESCE(array_length(v_video_ids, 1), 0),
    COALESCE(v_dify_ids, ARRAY[]::UUID[]) || COALESCE(v_video_ids, ARRAY[]::UUID[]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION recover_stuck_steps() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION recover_stuck_steps() TO service_role;

-- ============================================================
-- 13. RPC 函数：apply_video_fallback
-- ============================================================
CREATE OR REPLACE FUNCTION apply_video_fallback(p_task_id UUID)
RETURNS TABLE(
  fallback_created BOOLEAN,
  fallback_step_id UUID,
  reason TEXT
) AS $$
DECLARE
  v_copy_step xhs_task_steps;
  v_video_step xhs_task_steps;
  v_new_step_id UUID;
BEGIN
  SELECT * INTO v_video_step
  FROM xhs_task_steps
  WHERE task_id = p_task_id
    AND step_type = 'generate_video'
    AND status = 'failed'
    AND attempt >= max_attempts
  LIMIT 1;

  IF v_video_step.id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'generate_video not failed or not max_attempts'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_copy_step
  FROM xhs_task_steps
  WHERE task_id = p_task_id
    AND step_type = 'generate_copy'
    AND status = 'succeeded'
  LIMIT 1;

  IF v_copy_step.id IS NULL THEN
    UPDATE xhs_daily_tasks
    SET status = 'failed',
        metadata = COALESCE(metadata, '{}'::jsonb) || 
          '{"failure_reason": "no_copy_for_fallback"}'::jsonb,
        updated_at = now()
    WHERE id = p_task_id;
    
    RETURN QUERY SELECT FALSE, NULL::UUID, 'generate_copy not succeeded, task marked failed'::TEXT;
    RETURN;
  END IF;

  UPDATE xhs_task_steps
  SET status = 'skipped'
  WHERE id = v_video_step.id;

  INSERT INTO xhs_task_steps (
    task_id, supabase_uuid, xhs_account_id, step_type,
    status, input_snapshot
  )
  VALUES (
    p_task_id,
    v_copy_step.supabase_uuid,
    v_copy_step.xhs_account_id,
    'fallback_image_text',
    'pending',
    v_copy_step.input_snapshot || '{"fallback_from": "generate_video"}'::jsonb
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_new_step_id;
  
  IF v_new_step_id IS NULL THEN
    SELECT id INTO v_new_step_id FROM xhs_task_steps
    WHERE task_id = p_task_id AND step_type = 'fallback_image_text'
    LIMIT 1;
  END IF;

  UPDATE xhs_daily_tasks
  SET metadata = COALESCE(metadata, '{}'::jsonb) || 
    '{"effective_mode": "IMAGE_TEXT", "fallback_applied": true}'::jsonb,
    updated_at = now()
  WHERE id = p_task_id;

  RETURN QUERY SELECT TRUE, v_new_step_id, 'fallback_image_text created'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION apply_video_fallback(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_video_fallback(UUID) TO service_role;

-- ============================================================
-- 14. RPC 函数：create_fetch_metrics_steps（强硬模式）
-- ============================================================
CREATE OR REPLACE FUNCTION create_fetch_metrics_steps(
  p_task_id UUID,
  p_published_at TIMESTAMPTZ
) RETURNS INT AS $$
DECLARE
  v_task xhs_daily_tasks;
  v_trace JSONB;
  v_sentiment_brief_id TEXT;
  v_material_analysis_id TEXT;
  v_count INT := 0;
BEGIN
  SELECT * INTO v_task FROM xhs_daily_tasks WHERE id = p_task_id;
  v_trace := v_task.metadata->'trace';

  IF v_trace IS NULL THEN
    RAISE EXCEPTION 'Task % missing metadata.trace, cannot create fetch_metrics steps', p_task_id;
  END IF;

  v_sentiment_brief_id := v_trace->>'sentiment_brief_id';
  v_material_analysis_id := v_trace->>'material_analysis_id';

  IF v_sentiment_brief_id IS NULL OR v_material_analysis_id IS NULL THEN
    RAISE EXCEPTION 'Task % has incomplete trace: sentiment_brief_id=%, material_analysis_id=%',
      p_task_id, v_sentiment_brief_id, v_material_analysis_id;
  END IF;

  INSERT INTO xhs_task_steps (
    task_id, supabase_uuid, xhs_account_id, step_type, step_key,
    status, scheduled_at, input_snapshot
  )
  VALUES (
    p_task_id, v_task.supabase_uuid, v_task.xhs_account_id,
    'fetch_metrics', 'fetch_metrics:1h',
    'pending', p_published_at + interval '1 hour',
    jsonb_build_object(
      'strategy_version', v_task.strategy_version,
      'plan_version', v_task.plan_version,
      'orchestrator_run_id', v_task.orchestrator_run_id,
      'sentiment_brief_id', v_sentiment_brief_id,
      'material_analysis_id', v_material_analysis_id,
      'metrics_window', '1h',
      'note_id', v_task.metadata->>'note_id'
    )
  )
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO xhs_task_steps (
    task_id, supabase_uuid, xhs_account_id, step_type, step_key,
    status, scheduled_at, input_snapshot
  )
  VALUES (
    p_task_id, v_task.supabase_uuid, v_task.xhs_account_id,
    'fetch_metrics', 'fetch_metrics:24h',
    'pending', p_published_at + interval '24 hours',
    jsonb_build_object(
      'strategy_version', v_task.strategy_version,
      'plan_version', v_task.plan_version,
      'orchestrator_run_id', v_task.orchestrator_run_id,
      'sentiment_brief_id', v_sentiment_brief_id,
      'material_analysis_id', v_material_analysis_id,
      'metrics_window', '24h',
      'note_id', v_task.metadata->>'note_id'
    )
  )
  ON CONFLICT DO NOTHING;
  v_count := v_count + ROW_COUNT;

  INSERT INTO xhs_task_steps (
    task_id, supabase_uuid, xhs_account_id, step_type, step_key,
    status, scheduled_at, input_snapshot
  )
  VALUES (
    p_task_id, v_task.supabase_uuid, v_task.xhs_account_id,
    'fetch_metrics', 'fetch_metrics:7d',
    'pending', p_published_at + interval '7 days',
    jsonb_build_object(
      'strategy_version', v_task.strategy_version,
      'plan_version', v_task.plan_version,
      'orchestrator_run_id', v_task.orchestrator_run_id,
      'sentiment_brief_id', v_sentiment_brief_id,
      'material_analysis_id', v_material_analysis_id,
      'metrics_window', '7d',
      'note_id', v_task.metadata->>'note_id'
    )
  )
  ON CONFLICT DO NOTHING;
  v_count := v_count + ROW_COUNT;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION create_fetch_metrics_steps(UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_fetch_metrics_steps(UUID, TIMESTAMPTZ) TO authenticated;

-- ============================================================
-- 15. RPC 函数：refresh_task_status
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_task_status(p_task_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_task xhs_daily_tasks;
  v_has_copy_succeeded BOOLEAN;
  v_has_video_succeeded BOOLEAN;
  v_has_publish_succeeded BOOLEAN;
  v_has_critical_failed BOOLEAN;
  v_new_status TEXT;
BEGIN
  SELECT * INTO v_task FROM xhs_daily_tasks WHERE id = p_task_id;
  IF v_task.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM xhs_task_steps 
    WHERE task_id = p_task_id AND step_type = 'generate_copy' AND status = 'succeeded'
  ) INTO v_has_copy_succeeded;

  SELECT EXISTS (
    SELECT 1 FROM xhs_task_steps 
    WHERE task_id = p_task_id AND step_type IN ('generate_video', 'fallback_image_text') AND status = 'succeeded'
  ) INTO v_has_video_succeeded;

  SELECT EXISTS (
    SELECT 1 FROM xhs_task_steps 
    WHERE task_id = p_task_id AND step_type = 'publish' AND status = 'succeeded'
  ) INTO v_has_publish_succeeded;

  SELECT EXISTS (
    SELECT 1 FROM xhs_task_steps 
    WHERE task_id = p_task_id 
      AND step_type IN ('generate_copy', 'generate_video', 'publish')
      AND status = 'failed'
      AND attempt >= max_attempts
      AND NOT EXISTS (
        SELECT 1 FROM xhs_task_steps s2 
        WHERE s2.task_id = p_task_id 
          AND s2.step_type = 'fallback_image_text'
          AND s2.status IN ('pending', 'running', 'succeeded')
      )
  ) INTO v_has_critical_failed;

  IF v_has_critical_failed THEN
    v_new_status := 'failed';
  ELSIF v_has_publish_succeeded THEN
    v_new_status := 'published';
  ELSIF v_has_video_succeeded THEN
    v_new_status := 'video_ready';
  ELSIF v_has_copy_succeeded THEN
    v_new_status := 'copy_ready';
  ELSE
    v_new_status := 'pending';
  END IF;

  UPDATE xhs_daily_tasks
  SET status = v_new_status,
      updated_at = now()
  WHERE id = p_task_id
    AND status != v_new_status;

  RETURN v_new_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION refresh_task_status(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION refresh_task_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_task_status(UUID) TO service_role;

-- ============================================================
-- 16. RPC 函数：orchestrator_maintenance_tick
-- ============================================================
CREATE OR REPLACE FUNCTION orchestrator_maintenance_tick()
RETURNS TABLE(
  recovered_count INT,
  fallbacks_applied INT,
  tasks_refreshed INT
) AS $$
DECLARE
  v_recovered INT;
  v_fallbacks INT := 0;
  v_refreshed INT := 0;
  v_task_id UUID;
BEGIN
  SELECT r.recovered_count INTO v_recovered FROM recover_stuck_steps() r;

  FOR v_task_id IN (
    SELECT DISTINCT task_id 
    FROM xhs_task_steps 
    WHERE step_type = 'generate_video'
      AND status = 'failed'
      AND attempt >= max_attempts
      AND NOT EXISTS (
        SELECT 1 FROM xhs_task_steps s2 
        WHERE s2.task_id = xhs_task_steps.task_id 
          AND s2.step_type = 'fallback_image_text'
      )
  )
  LOOP
    PERFORM apply_video_fallback(v_task_id);
    v_fallbacks := v_fallbacks + 1;
  END LOOP;

  FOR v_task_id IN (
    SELECT id FROM xhs_daily_tasks 
    WHERE status IN ('pending', 'copy_ready', 'video_ready')
      AND updated_at < now() - interval '5 minutes'
    LIMIT 100
  )
  LOOP
    PERFORM refresh_task_status(v_task_id);
    v_refreshed := v_refreshed + 1;
  END LOOP;

  RETURN QUERY SELECT v_recovered, v_fallbacks, v_refreshed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION orchestrator_maintenance_tick() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orchestrator_maintenance_tick() TO service_role;

-- ============================================================
-- 17. 触发器：确保 step 的 supabase_uuid/xhs_account_id 与 task 一致
-- ============================================================
CREATE OR REPLACE FUNCTION enforce_step_ownership()
RETURNS TRIGGER AS $$
DECLARE
  v_task xhs_daily_tasks;
BEGIN
  SELECT * INTO v_task FROM xhs_daily_tasks WHERE id = NEW.task_id;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION 'Task not found: %', NEW.task_id;
  END IF;

  NEW.supabase_uuid := v_task.supabase_uuid;
  NEW.xhs_account_id := v_task.xhs_account_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_step_ownership
  BEFORE INSERT OR UPDATE ON xhs_task_steps
  FOR EACH ROW
  EXECUTE FUNCTION enforce_step_ownership();

-- ============================================================
-- 18. 账号隔离开关支持（circuit breaker）
-- ============================================================

-- 创建禁用账号的函数（service_role）
CREATE OR REPLACE FUNCTION disable_account_temporarily(
  p_account_id UUID,
  p_duration_hours INT DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
  UPDATE xhs_accounts
  SET disabled_until = now() + (p_duration_hours || ' hours')::interval
  WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION disable_account_temporarily(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION disable_account_temporarily(UUID, INT) TO service_role;

-- 检查账号可用性（authenticated + service_role）
CREATE OR REPLACE FUNCTION is_account_available(p_account_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_disabled_until TIMESTAMPTZ;
  v_owner UUID;
BEGIN
  SELECT disabled_until, supabase_uuid INTO v_disabled_until, v_owner
  FROM xhs_accounts WHERE id = p_account_id;

  IF v_owner IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_owner != auth.uid() THEN
    RETURN FALSE;
  END IF;

  RETURN v_disabled_until IS NULL OR v_disabled_until < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION is_account_available(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_account_available(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_account_available(UUID) TO service_role;

-- authenticated 用户自助禁用（归属校验）
CREATE OR REPLACE FUNCTION disable_my_account_temporarily(
  p_account_id UUID,
  p_duration_hours INT DEFAULT 1
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE xhs_accounts
  SET disabled_until = now() + (p_duration_hours || ' hours')::interval
  WHERE id = p_account_id
    AND supabase_uuid = auth.uid();

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION disable_my_account_temporarily(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION disable_my_account_temporarily(UUID, INT) TO authenticated;

-- ============================================================
-- 完成
-- ============================================================
