/**
 * Orchestrator - Control Center
 * 
 * Phase 1 最小实现：
 * - start(): 创建 1 个 task + 对应 steps
 * - maintenanceTick(): 调用 DB 的 orchestrator_maintenance_tick()
 */

import { supabaseAdmin, checkSupabaseConnection } from './db/supabase.js';
import {
    createTask,
    createStepsForTask,
    generateRunId,
} from './services/TaskFactory.js';
import {
    StartOrchestratorRequest,
    StartOrchestratorResponse,
    MaintenanceTickResponse,
    XhsAccount,
    ContentMode,
    TaskMetadata,
} from './types/contracts.js';

export class ControlCenter {
    private initialized = false;

    /**
     * 初始化检查
     */
    async initialize(): Promise<boolean> {
        if (this.initialized) return true;

        const connected = await checkSupabaseConnection();
        if (!connected) {
            console.error('[ControlCenter] Failed to initialize: Supabase connection failed');
            return false;
        }

        this.initialized = true;
        console.log('[ControlCenter] Initialized successfully');
        return true;
    }

    /**
     * 获取账号信息
     */
    async getAccount(xhs_account_id: string): Promise<XhsAccount | null> {
        const { data, error } = await supabaseAdmin
            .from('xhs_accounts')
            .select('id, supabase_uuid, nickname, red_id, disabled_until, execution_provider, skyvern_profile_id')
            .eq('id', xhs_account_id)
            .single();

        if (error) {
            console.error('[ControlCenter] Failed to get account:', error);
            return null;
        }

        return data as XhsAccount;
    }

    /**
     * 检查账号是否可用（circuit breaker）
     */
    isAccountAvailable(account: XhsAccount): boolean {
        if (!account.disabled_until) return true;
        return new Date(account.disabled_until) < new Date();
    }

    /**
     * POST /agent/auto/start
     * 
     * 创建 1 个 task + 对应 steps
     */
    async start(req: StartOrchestratorRequest): Promise<StartOrchestratorResponse> {
        const orchestrator_run_id = generateRunId();
        console.log('[ControlCenter] Starting orchestrator run:', orchestrator_run_id);

        try {
            // 1. 获取账号信息
            const account = await this.getAccount(req.xhs_account_id);
            if (!account) {
                return {
                    success: false,
                    orchestrator_run_id,
                    strategy_version: 1,
                    plan_version: 1,
                    tasks_created: 0,
                    steps_created: 0,
                    error: 'Account not found',
                };
            }

            // 2. 检查账号是否被禁用
            if (!this.isAccountAvailable(account)) {
                return {
                    success: false,
                    orchestrator_run_id,
                    strategy_version: 1,
                    plan_version: 1,
                    tasks_created: 0,
                    steps_created: 0,
                    error: `Account disabled until ${account.disabled_until}`,
                };
            }

            // 3. 检查 supabase_uuid
            if (!account.supabase_uuid) {
                return {
                    success: false,
                    orchestrator_run_id,
                    strategy_version: 1,
                    plan_version: 1,
                    tasks_created: 0,
                    steps_created: 0,
                    error: 'Account missing supabase_uuid',
                };
            }

            // 4. 构建 metadata
            const metadata: TaskMetadata = {
                review_mode: 'manual_confirm',  // Phase 1 默认手动确认
                trace: {
                    sentiment_brief_id: `brief_${orchestrator_run_id}`,
                    material_analysis_id: `material_${orchestrator_run_id}`,
                },
            };

            // 5. 创建 Task
            const task = await createTask({
                supabase_uuid: account.supabase_uuid,
                xhs_account_id: account.id,
                xhs_user_id: account.red_id || 'unknown',
                theme: req.theme || '默认主题',
                orchestrator_run_id,
                strategy_version: 1,  // Phase 1 固定为 1
                plan_version: 1,      // Phase 1 固定为 1
                scheduled_time: new Date(Date.now() + 60 * 60 * 1000),  // 1 小时后
                content_mode: 'IMAGE_TEXT' as ContentMode,
                title: req.title,
                content: req.content,
                metadata,
            });

            // 6. 创建 Steps (使用账号配置的执行器)
            const steps = await createStepsForTask(task, {
                topic: req.theme,
                provider: account.execution_provider || 'chrome_extension',
            });

            console.log('[ControlCenter] Run completed:', {
                orchestrator_run_id,
                task_id: task.id,
                steps_created: steps.length,
            });

            return {
                success: true,
                orchestrator_run_id,
                strategy_version: 1,
                plan_version: 1,
                task_id: task.id,
                tasks_created: 1,
                steps_created: steps.length,
            };

        } catch (error) {
            console.error('[ControlCenter] Start failed:', error);
            return {
                success: false,
                orchestrator_run_id,
                strategy_version: 1,
                plan_version: 1,
                tasks_created: 0,
                steps_created: 0,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * POST /agent/orchestrator/maintenance/tick
     * 
     * 调用 DB 的 orchestrator_maintenance_tick()
     */
    async maintenanceTick(): Promise<MaintenanceTickResponse> {
        console.log('[ControlCenter] Running maintenance tick...');

        try {
            const { data, error } = await supabaseAdmin.rpc('orchestrator_maintenance_tick');

            if (error) {
                console.error('[ControlCenter] Maintenance tick failed:', error);
                throw new Error(error.message);
            }

            const result = data?.[0] || data || {
                recovered_count: 0,
                fallbacks_applied: 0,
                tasks_refreshed: 0,
            };

            console.log('[ControlCenter] Maintenance tick result:', result);

            return {
                recovered_count: result.recovered_count || 0,
                fallbacks_applied: result.fallbacks_applied || 0,
                tasks_refreshed: result.tasks_refreshed || 0,
                timestamp: new Date().toISOString(),
            };

        } catch (error) {
            console.error('[ControlCenter] Maintenance tick error:', error);
            return {
                recovered_count: 0,
                fallbacks_applied: 0,
                tasks_refreshed: 0,
                timestamp: new Date().toISOString(),
            };
        }
    }

    /**
     * 获取 Orchestrator 状态
     */
    async getStatus(orchestrator_run_id?: string): Promise<{
        has_strategy: boolean;
        has_plan: boolean;
        tasks_created: number;
        steps_created: number;
        steps_by_status: Record<string, number>;
    }> {
        let query = supabaseAdmin.from('xhs_daily_tasks').select('id');
        if (orchestrator_run_id) {
            query = query.eq('orchestrator_run_id', orchestrator_run_id);
        }

        const { data: tasks, error: tasksError } = await query;
        if (tasksError) {
            console.error('[ControlCenter] Failed to get tasks:', tasksError);
        }

        const taskIds = (tasks || []).map(t => t.id);

        // 获取 steps 统计
        let stepsData: { status: string }[] = [];
        if (taskIds.length > 0) {
            const { data, error } = await supabaseAdmin
                .from('xhs_task_steps')
                .select('status')
                .in('task_id', taskIds);

            if (!error && data) {
                stepsData = data;
            }
        }

        // 按状态分组
        const stepsByStatus: Record<string, number> = {};
        stepsData.forEach(step => {
            stepsByStatus[step.status] = (stepsByStatus[step.status] || 0) + 1;
        });

        return {
            has_strategy: false,  // Phase 1 暂不实现
            has_plan: false,      // Phase 1 暂不实现
            tasks_created: tasks?.length || 0,
            steps_created: stepsData.length,
            steps_by_status: stepsByStatus,
        };
    }
}

// 单例
export const controlCenter = new ControlCenter();
