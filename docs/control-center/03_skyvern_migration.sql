-- ============================================================
-- Skyvern Matrix Executor - 数据库迁移脚本
-- 添加 execution_provider 和 skyvern_profile_id 支持
-- ============================================================

-- 1. xhs_accounts 增加 Skyvern 相关字段
ALTER TABLE xhs_accounts 
ADD COLUMN IF NOT EXISTS execution_provider TEXT DEFAULT 'chrome_extension';

ALTER TABLE xhs_accounts 
ADD COLUMN IF NOT EXISTS skyvern_profile_id TEXT;

COMMENT ON COLUMN xhs_accounts.execution_provider IS 
'执行器类型: chrome_extension (本地扩展) 或 skyvern (矩阵云端)';

COMMENT ON COLUMN xhs_accounts.skyvern_profile_id IS 
'Skyvern 浏览器配置文件 ID，用于持久化登录态';

-- 2. xhs_task_steps 增加 provider 字段
ALTER TABLE xhs_task_steps 
ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'chrome_extension';

COMMENT ON COLUMN xhs_task_steps.provider IS 
'执行器提供者: chrome_extension 或 skyvern';

-- 3. 更新 TaskFactory 创建 step 时的默认逻辑
-- (这由 Orchestrator 代码中根据 xhs_accounts.execution_provider 决定)

-- 4. 创建索引加速 Skyvern Executor 查询
CREATE INDEX IF NOT EXISTS idx_steps_skyvern_pending 
ON xhs_task_steps(provider, status, scheduled_at) 
WHERE provider = 'skyvern' AND status = 'pending';

-- 5. 扩展 recover_stuck_steps 支持 Skyvern
-- 在现有函数基础上增加对 provider='skyvern' 的处理

-- 查看现有 recover_stuck_steps 函数是否包含 provider 过滤
-- 如果没有，需要更新函数

-- 临时：创建一个简单的 Skyvern step 恢复函数
CREATE OR REPLACE FUNCTION recover_stuck_skyvern_steps()
RETURNS TABLE(step_id UUID, step_type TEXT, stuck_minutes INTEGER) AS $$
BEGIN
    RETURN QUERY
    UPDATE xhs_task_steps
    SET 
        status = 'pending',
        lock_owner = NULL,
        locked_at = NULL,
        updated_at = now()
    WHERE 
        provider = 'skyvern'
        AND status = 'running'
        AND locked_at < now() - INTERVAL '15 minutes'
    RETURNING 
        id AS step_id, 
        step_type, 
        EXTRACT(EPOCH FROM (now() - locked_at))::INTEGER / 60 AS stuck_minutes;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION recover_stuck_skyvern_steps() TO service_role;
REVOKE EXECUTE ON FUNCTION recover_stuck_skyvern_steps() FROM anon, authenticated;

-- 6. 验证
DO $$
BEGIN
    RAISE NOTICE 'Skyvern migration completed successfully';
    RAISE NOTICE 'New columns: xhs_accounts.execution_provider, xhs_accounts.skyvern_profile_id';
    RAISE NOTICE 'New columns: xhs_task_steps.provider';
    RAISE NOTICE 'New index: idx_steps_skyvern_pending';
    RAISE NOTICE 'New function: recover_stuck_skyvern_steps()';
END $$;
