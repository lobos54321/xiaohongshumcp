-- 检查 User ID 混乱问题的 SQL 查询

-- 1. 查看所有用户映射
SELECT
    supabase_uuid,
    xhs_user_id,
    created_at,
    updated_at
FROM xiaohongshu_user_mappings
ORDER BY created_at DESC
LIMIT 20;

-- 2. 查看你的正确映射
SELECT * FROM xiaohongshu_user_mappings
WHERE supabase_uuid = '9dee4891-89a6-44ee-8fe8-69097846e97d';

-- 3. 查找那个神秘的 User ID
SELECT * FROM xiaohongshu_user_mappings
WHERE xhs_user_id = 'user_1762308080819_4sfjadrig';

-- 4. 查看所有 contentPlans 的 user_id
SELECT
    user_id,
    COUNT(*) as task_count,
    MAX(created_at) as latest_created
FROM contentPlans
GROUP BY user_id
ORDER BY latest_created DESC;

-- 5. 查找使用 user_1762308080819_4sfjadrig 的计划
SELECT * FROM contentPlans
WHERE user_id = 'user_1762308080819_4sfjadrig';

-- 6. 查看你的正确 user_id 的计划
SELECT
    id,
    user_id,
    created_at,
    jsonb_array_length(tasks) as task_count
FROM contentPlans
WHERE user_id = 'user_9dee489189a644ee8fe869097846e97d_prome';

-- 7. 查看所有 contentStrategies
SELECT
    user_id,
    created_at
FROM contentStrategies
ORDER BY created_at DESC
LIMIT 10;

-- 8. 清理建议（不要直接运行，先查看上面的结果）
-- 如果确认 user_1762308080819_4sfjadrig 是孤立数据，可以清理：
/*
DELETE FROM xiaohongshu_user_mappings
WHERE xhs_user_id = 'user_1762308080819_4sfjadrig';

DELETE FROM contentPlans
WHERE user_id = 'user_1762308080819_4sfjadrig';

DELETE FROM contentStrategies
WHERE user_id = 'user_1762308080819_4sfjadrig';
*/
