/**
 * WorkflowProgressService
 * 
 * 管理工作流步骤状态，支持：
 * 1. 创建/更新步骤状态
 * 2. 获取任务的所有步骤
 * 3. 通过 WebSocket 推送状态更新
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { WebSocket } from 'ws';

// 步骤状态
export type StepStatus = 'pending' | 'processing' | 'completed' | 'failed';

// 步骤记录
export interface WorkflowStep {
    id: string;
    task_id: string;
    step_key: string;
    step_title: string;
    agent_name: string;
    status: StepStatus;
    progress: number;
    current_action?: string;
    eta?: string;
    started_at?: string;
    completed_at?: string;
    time_taken?: string;
    output?: Record<string, unknown>;
    error?: string;
}

// 步骤定义（用于创建）
export interface StepDefinition {
    step_key: string;
    step_title: string;
    agent_name: string;
}

// 内容模式对应的步骤
export const MODE_STEPS: Record<string, StepDefinition[]> = {
    IMAGE_TEXT: [
        { step_key: 'market-strategy', step_title: '内容营销策略', agent_name: 'Prome Strategy Master' },
        { step_key: 'weekly-plan', step_title: '每周计划生成', agent_name: 'Prome Planner' },
        { step_key: 'detail-plan', step_title: '详细发布计划', agent_name: 'Prome Orchestrator' },
        { step_key: 'copy-analyze', step_title: '文案策略分析', agent_name: 'Prome Content Analyzer' },
        { step_key: 'copy-gen', step_title: '智能文案生成', agent_name: 'Prome Marketing Engine' },
        { step_key: 'variant-gen', step_title: '变体文案生成', agent_name: 'Prome Copywriter' },
        { step_key: 'image-adapt', step_title: '图片智能适配', agent_name: 'Prome Vision AI' },
        { step_key: 'image-gen', step_title: '图片生成编排', agent_name: 'Prome Image Studio' },
        { step_key: 'task-save', step_title: '内容入库', agent_name: 'Prome Executor' },
    ],
    AVATAR_VIDEO: [
        { step_key: 'market-strategy', step_title: '内容营销策略', agent_name: 'Prome Strategy Master' },
        { step_key: 'weekly-plan', step_title: '每周计划生成', agent_name: 'Prome Planner' },
        { step_key: 'detail-plan', step_title: '详细发布计划', agent_name: 'Prome Orchestrator' },
        { step_key: 'copy-analyze', step_title: '文案策略分析', agent_name: 'Prome Content Analyzer' },
        { step_key: 'copy-gen', step_title: '智能文案生成', agent_name: 'Prome Marketing Engine' },
        { step_key: 'variant-gen', step_title: '变体文案生成', agent_name: 'Prome Copywriter' },
        { step_key: 'voice-clone', step_title: '语音克隆合成', agent_name: 'Prome Voice Engine' },
        { step_key: 'avatar-render', step_title: '数字人渲染', agent_name: 'Prome Avatar Renderer' },
        { step_key: 'task-save', step_title: '内容入库', agent_name: 'Prome Executor' },
    ],
    UGC_VIDEO: [
        { step_key: 'market-strategy', step_title: '内容营销策略', agent_name: 'Prome Strategy Master' },
        { step_key: 'weekly-plan', step_title: '每周计划生成', agent_name: 'Prome Planner' },
        { step_key: 'detail-plan', step_title: '详细发布计划', agent_name: 'Prome Orchestrator' },
        { step_key: 'copy-analyze', step_title: '文案策略分析', agent_name: 'Prome Content Analyzer' },
        { step_key: 'copy-gen', step_title: '智能文案生成', agent_name: 'Prome Marketing Engine' },
        { step_key: 'variant-gen', step_title: '变体文案生成', agent_name: 'Prome Copywriter' },
        { step_key: 'vision-analyze', step_title: '视觉特征分析', agent_name: 'Prome Visual AI' },
        { step_key: 'scene-gen', step_title: '场景图生成', agent_name: 'Prome Scene Studio' },
        { step_key: 'video-gen', step_title: '动态视频生成', agent_name: 'Prome Video Engine' },
        { step_key: 'task-save', step_title: '内容入库', agent_name: 'Prome Executor' },
    ],
};

// WebSocket 连接管理
const taskConnections = new Map<string, Set<WebSocket>>();

// 内存中的步骤状态缓存（支持离线运行/容错）
const stepsCache = new Map<string, Map<string, WorkflowStep>>();
const taskModes = new Map<string, string>();

export class WorkflowProgressService {
    private supabase: SupabaseClient;

    constructor(supabase: SupabaseClient) {
        this.supabase = supabase;
    }

    /**
     * 为任务初始化所有步骤
     */
    async initializeSteps(taskId: string, contentMode: string): Promise<void> {
        const steps = MODE_STEPS[contentMode];
        if (!steps) {
            console.error(`[WorkflowProgressService] Unknown content mode: ${contentMode}`);
            return;
        }

        taskModes.set(taskId, contentMode);
        const memSteps: Map<string, WorkflowStep> = new Map();

        for (const step of steps) {
            const newStep: WorkflowStep = {
                id: `${taskId}_${step.step_key}`,
                task_id: taskId,
                step_key: step.step_key,
                step_title: step.step_title,
                agent_name: step.agent_name,
                status: 'pending',
                progress: 0,
            };
            memSteps.set(step.step_key, newStep);

            // 异步保存到数据库，不阻塞初始化
            this.supabase
                .from('xhs_workflow_steps')
                .upsert({
                    task_id: taskId,
                    step_key: step.step_key,
                    step_title: step.step_title,
                    agent_name: step.agent_name,
                    status: 'pending',
                    progress: 0,
                }, { onConflict: 'task_id,step_key' })
                .then(({ error }) => {
                    if (error) console.error(`[WorkflowProgressService] DB Upsert Error (non-fatal):`, error.message);
                });
        }

        stepsCache.set(taskId, memSteps);
        console.log(`[WorkflowProgressService] ✅ Initialized ${steps.length} steps in-memory for task ${taskId}`);
    }

    /**
     * 更新步骤状态
     */
    async updateStep(
        taskId: string,
        stepKey: string,
        updates: Partial<{
            status: StepStatus;
            progress: number;
            current_action: string;
            eta: string;
            output: Record<string, unknown>;
            error: string;
            time_taken: string;
        }>
    ): Promise<void> {
        const updateData: Record<string, any> = { ...updates };

        // 自动设置时间戳
        if (updates.status === 'processing' && !updateData.started_at) {
            updateData.started_at = new Date().toISOString();
        }
        if (updates.status === 'completed' || updates.status === 'failed') {
            updateData.completed_at = new Date().toISOString();
        }

        // 1. 更新内存缓存 (保证实时性)
        let memSteps = stepsCache.get(taskId);
        if (!memSteps) {
            console.warn(`[WorkflowProgressService] Cache missing for task ${taskId}, attempting to recover...`);
            memSteps = new Map();
            stepsCache.set(taskId, memSteps);
        }

        const currentStep = memSteps.get(stepKey) || {
            task_id: taskId,
            step_key: stepKey,
            step_title: stepKey,
            agent_name: 'Prome AI',
            status: 'pending',
            progress: 0
        } as WorkflowStep;

        const updatedStep = { ...currentStep, ...updateData } as WorkflowStep;
        memSteps.set(stepKey, updatedStep);

        // 2. 异步更新数据库 (持久化)
        this.supabase
            .from('xhs_workflow_steps')
            .update(updateData)
            .eq('task_id', taskId)
            .eq('step_key', stepKey)
            .then(({ error }) => {
                if (error) console.error(`[WorkflowProgressService] DB Update Error (non-fatal):`, error.message);
            });

        // 3. 立即推送 WebSocket 更新 (无视数据库延迟)
        this.broadcastStepUpdate(taskId, updatedStep);
    }

    /**
     * 开始执行步骤
     */
    async startStep(taskId: string, stepKey: string, currentAction?: string): Promise<void> {
        await this.updateStep(taskId, stepKey, {
            status: 'processing',
            progress: 0,
            current_action: currentAction || '正在初始化...',
        });
    }

    /**
     * 更新步骤进度
     */
    async updateProgress(
        taskId: string,
        stepKey: string,
        progress: number,
        currentAction?: string,
        eta?: string
    ): Promise<void> {
        await this.updateStep(taskId, stepKey, {
            progress: Math.min(100, Math.max(0, progress)),
            current_action: currentAction,
            eta,
        });
    }

    /**
     * 完成步骤
     */
    async completeStep(
        taskId: string,
        stepKey: string,
        output?: Record<string, unknown>,
        timeTaken?: string
    ): Promise<void> {
        await this.updateStep(taskId, stepKey, {
            status: 'completed',
            progress: 100,
            output,
            time_taken: timeTaken,
            current_action: undefined,
            eta: undefined,
        });
    }

    /**
     * 步骤失败
     */
    async failStep(taskId: string, stepKey: string, error: string): Promise<void> {
        await this.updateStep(taskId, stepKey, {
            status: 'failed',
            error,
            current_action: undefined,
        });
    }

    /**
     * 获取任务的所有步骤
     */
    async getSteps(taskId: string): Promise<WorkflowStep[]> {
        const { data, error } = await this.supabase
            .from('xhs_workflow_steps')
            .select('*')
            .eq('task_id', taskId)
            .order('created_at', { ascending: true });

        if (error) {
            console.error(`[WorkflowProgressService] Get steps error:`, error);
            return [];
        }

        return data || [];
    }

    /**
     * 获取工作流整体状态
     */
    async getWorkflowStatus(taskId: string): Promise<{
        overallStatus: StepStatus;
        overallProgress: number;
        steps: WorkflowStep[];
        mode: string;
    }> {
        // 优先从内存获取
        let steps: WorkflowStep[] = [];
        const memMap = stepsCache.get(taskId);

        if (memMap) {
            steps = Array.from(memMap.values());
        } else {
            // 缓存没命中，尝试从数据库恢复
            console.log(`[WorkflowProgressService] Cache miss for status ${taskId}, fetching from DB...`);
            steps = await this.getSteps(taskId);
        }

        if (steps.length === 0) {
            const mode = taskModes.get(taskId) || 'IMAGE_TEXT';
            return { overallStatus: 'pending', overallProgress: 0, steps: [], mode };
        }

        // 计算整体进度
        const totalProgress = steps.reduce((sum, s) => sum + (s.progress || 0), 0);
        const overallProgress = Math.round(totalProgress / steps.length);

        // 确定整体状态
        let overallStatus: StepStatus = 'pending';
        if (steps.some(s => s.status === 'failed')) {
            overallStatus = 'failed';
        } else if (steps.every(s => s.status === 'completed')) {
            overallStatus = 'completed';
        } else if (steps.some(s => s.status === 'processing')) {
            overallStatus = 'processing';
        }

        const mode = taskModes.get(taskId) || 'IMAGE_TEXT';
        return { overallStatus, overallProgress, steps, mode };
    }

    /**
     * 注册 WebSocket 连接
     */
    registerConnection(taskId: string, ws: WebSocket): void {
        if (!taskConnections.has(taskId)) {
            taskConnections.set(taskId, new Set());
        }
        taskConnections.get(taskId)!.add(ws);
        console.log(`[WorkflowProgressService] WebSocket registered for task ${taskId}`);
    }

    /**
     * 移除 WebSocket 连接
     */
    unregisterConnection(taskId: string, ws: WebSocket): void {
        const connections = taskConnections.get(taskId);
        if (connections) {
            connections.delete(ws);
            if (connections.size === 0) {
                taskConnections.delete(taskId);
            }
        }
    }

    /**
     * 广播步骤更新
     */
    private broadcastStepUpdate(taskId: string, step: WorkflowStep): void {
        const connections = taskConnections.get(taskId);
        if (!connections || connections.size === 0) {
            console.log(`[WorkflowProgressService] No connections for task ${taskId}, update not broadcasted`);
            return;
        }

        const message = JSON.stringify({
            type: 'node_update',
            taskId,
            data: {
                id: step.step_key,
                title: step.step_title,
                agent: step.agent_name,
                status: step.status,
                details: {
                    progress: step.progress,
                    currentAction: step.current_action,
                    eta: step.eta,
                    timeTaken: step.time_taken,
                    output: step.output ? JSON.stringify(step.output).slice(0, 5000) : undefined,
                    error: step.error,
                },
            },
        });

        console.log(`[WorkflowProgressService] Broadcasting node_update to ${connections.size} clients: ${step.step_key} -> ${step.status}`);

        for (const ws of connections) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            }
        }
    }

    /**
     * 广播完整状态
     */
    async broadcastFullStatus(taskId: string): Promise<void> {
        const connections = taskConnections.get(taskId);
        if (!connections || connections.size === 0) return;

        const status = await this.getWorkflowStatus(taskId);

        const message = JSON.stringify({
            type: 'status_update',
            taskId,
            data: {
                taskId,
                mode: status.mode,
                overallStatus: status.overallStatus,
                overallProgress: status.overallProgress,
                nodes: status.steps.map(s => ({
                    id: s.step_key,
                    title: s.step_title,
                    agent: s.agent_name,
                    status: s.status,
                    details: {
                        progress: s.progress,
                        currentAction: s.current_action,
                        eta: s.eta,
                        timeTaken: s.time_taken,
                        output: s.output, // 不截断，给状态更新完整的
                        error: s.error,
                    },
                })),
            },
        });

        for (const ws of connections) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            }
        }
    }

    /**
     * 标记工作流完成并发送结果
     */
    async completeWorkflow(taskId: string, result: any): Promise<void> {
        const connections = taskConnections.get(taskId);
        if (!connections || connections.size === 0) return;

        const status = await this.getWorkflowStatus(taskId);

        const message = JSON.stringify({
            type: 'completed',
            taskId,
            data: {
                ...status,
                overallStatus: 'completed',
                overallProgress: 100,
                result // 最终产物
            },
        });

        for (const ws of connections) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            }
        }

        console.log(`[WorkflowProgressService] ✅ Workflow ${taskId} marked as completed with results`);
    }
}
