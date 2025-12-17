/**
 * Orchestrator - Task Factory
 * 
 * 负责创建 Task 和 Steps
 * 🔥 只有 Orchestrator 允许 INSERT tasks/steps
 */

import { supabaseAdmin } from '../db/supabase.js';
import {
    CreateTaskInput,
    CreateStepInput,
    DailyTask,
    TaskStep,
    ContentMode,
    StepInputSnapshot,
    TaskMetadata,
} from '../types/contracts.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * 生成 orchestrator_run_id
 */
export function generateRunId(): string {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
    return `run_${dateStr}_${timeStr}_${uuidv4().slice(0, 8)}`;
}

/**
 * 创建 Task
 */
export async function createTask(input: CreateTaskInput): Promise<DailyTask> {
    const { data, error } = await supabaseAdmin
        .from('xhs_daily_tasks')
        .insert({
            supabase_uuid: input.supabase_uuid,
            xhs_account_id: input.xhs_account_id,
            xhs_user_id: input.xhs_user_id,
            theme: input.theme,
            orchestrator_run_id: input.orchestrator_run_id,
            strategy_version: input.strategy_version,
            plan_version: input.plan_version,
            scheduled_time: input.scheduled_time.toISOString(),
            content_mode: input.content_mode,
            title: input.title || null,
            content: input.content || null,
            status: 'pending',
            metadata: input.metadata,
        })
        .select()
        .single();

    if (error) {
        console.error('[TaskFactory] Failed to create task:', error);
        throw new Error(`Failed to create task: ${error.message}`);
    }

    console.log('[TaskFactory] Task created:', data.id);
    return data as DailyTask;
}

/**
 * 创建 Step
 */
export async function createStep(input: CreateStepInput, provider: string = 'chrome_extension'): Promise<TaskStep> {
    const { data, error } = await supabaseAdmin
        .from('xhs_task_steps')
        .insert({
            task_id: input.task_id,
            supabase_uuid: input.supabase_uuid,
            xhs_account_id: input.xhs_account_id,
            step_type: input.step_type,
            step_key: input.step_key || null,
            status: 'pending',
            scheduled_at: input.scheduled_at?.toISOString() || null,
            input_snapshot: input.input_snapshot,
            provider: provider,  // 执行器类型
        })
        .select()
        .single();

    if (error) {
        console.error('[TaskFactory] Failed to create step:', error);
        throw new Error(`Failed to create step: ${error.message}`);
    }

    console.log('[TaskFactory] Step created:', data.id, data.step_type, 'provider:', provider);
    return data as TaskStep;
}

/**
 * 创建 IMAGE_TEXT 模式的标准 Steps
 * 包含：generate_copy, publish
 */
export async function createImageTextSteps(
    task: DailyTask,
    options: { topic?: string; provider?: string } = {}
): Promise<TaskStep[]> {
    const baseSnapshot: StepInputSnapshot = {
        strategy_version: task.strategy_version,
        plan_version: task.plan_version,
        orchestrator_run_id: task.orchestrator_run_id,
        sentiment_brief_id: task.metadata.trace.sentiment_brief_id,
        material_analysis_id: task.metadata.trace.material_analysis_id,
        task_mode: task.content_mode,
        topic: options.topic,
    };

    const provider = options.provider || 'chrome_extension';
    const steps: TaskStep[] = [];

    // Step 1: generate_copy (always chrome_extension or dify)
    const copyStep = await createStep({
        task_id: task.id,
        supabase_uuid: task.supabase_uuid,
        xhs_account_id: task.xhs_account_id,
        step_type: 'generate_copy',
        input_snapshot: { ...baseSnapshot },
    }, 'dify');  // generate_copy always uses dify
    steps.push(copyStep);

    // Step 2: publish (uses provider from account)
    const publishStep = await createStep({
        task_id: task.id,
        supabase_uuid: task.supabase_uuid,
        xhs_account_id: task.xhs_account_id,
        step_type: 'publish',
        input_snapshot: { ...baseSnapshot },
    }, provider);
    steps.push(publishStep);

    return steps;
}

/**
 * 创建 UGC_VIDEO 模式的标准 Steps
 * 包含：generate_copy, compress_script, generate_video, publish
 */
export async function createUgcVideoSteps(
    task: DailyTask,
    options: { topic?: string } = {}
): Promise<TaskStep[]> {
    const baseSnapshot: StepInputSnapshot = {
        strategy_version: task.strategy_version,
        plan_version: task.plan_version,
        orchestrator_run_id: task.orchestrator_run_id,
        sentiment_brief_id: task.metadata.trace.sentiment_brief_id,
        material_analysis_id: task.metadata.trace.material_analysis_id,
        task_mode: task.content_mode,
        topic: options.topic,
    };

    const steps: TaskStep[] = [];

    // Step 1: generate_copy
    steps.push(await createStep({
        task_id: task.id,
        supabase_uuid: task.supabase_uuid,
        xhs_account_id: task.xhs_account_id,
        step_type: 'generate_copy',
        input_snapshot: { ...baseSnapshot },
    }));

    // Step 2: compress_script
    steps.push(await createStep({
        task_id: task.id,
        supabase_uuid: task.supabase_uuid,
        xhs_account_id: task.xhs_account_id,
        step_type: 'compress_script',
        input_snapshot: { ...baseSnapshot },
    }));

    // Step 3: generate_video
    steps.push(await createStep({
        task_id: task.id,
        supabase_uuid: task.supabase_uuid,
        xhs_account_id: task.xhs_account_id,
        step_type: 'generate_video',
        input_snapshot: { ...baseSnapshot },
    }));

    // Step 4: publish
    steps.push(await createStep({
        task_id: task.id,
        supabase_uuid: task.supabase_uuid,
        xhs_account_id: task.xhs_account_id,
        step_type: 'publish',
        input_snapshot: { ...baseSnapshot },
    }));

    return steps;
}

/**
 * 根据 content_mode 创建对应的 Steps
 */
export async function createStepsForTask(
    task: DailyTask,
    options: { topic?: string; provider?: string } = {}
): Promise<TaskStep[]> {
    switch (task.content_mode) {
        case 'IMAGE_TEXT':
            return createImageTextSteps(task, options);
        case 'UGC_VIDEO':
            return createUgcVideoSteps(task, options);
        case 'AVATAR_VIDEO':
        case 'AVATAR_MIXCUT':
            // Phase 1: 暂时使用 UGC_VIDEO 流程
            return createUgcVideoSteps(task, options);
        default:
            return createImageTextSteps(task, options);
    }
}
