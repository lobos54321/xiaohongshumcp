/**
 * Orchestrator - 类型定义
 * 
 * 从 03_contracts.ts 精简而来，只包含 Phase 1 需要的类型
 */

// ============================================================
// Content Mode
// ============================================================
export type ContentMode = 'IMAGE_TEXT' | 'UGC_VIDEO' | 'AVATAR_VIDEO' | 'AVATAR_MIXCUT';

// ============================================================
// Task
// ============================================================
export type TaskStatus = 'pending' | 'copy_ready' | 'video_ready' | 'published' | 'failed' | 'skipped';

export interface TaskTrace {
    sentiment_brief_id: string;
    material_analysis_id: string;
}

export interface TaskMetadata {
    review_mode: 'auto_publish' | 'manual_confirm';
    trace: TaskTrace;
    note_id?: string;
    note_url?: string;
    effective_mode?: ContentMode;
    fallback_applied?: boolean;
    failure_reason?: string;
    sentiment?: {
        topics: string[];
        keywords: string[];
        fetchedAt: string;
    } | null;
    // 内容生成配置 (用于 Step 执行器异步生成)
    content_generation?: {
        product_info: string;
        target_audience: string;
        marketing_goal: string;
        target_words: number;
        avatar_photo_url?: string;
        voice_sample_url?: string;
        content_mode: ContentMode;
    };
    // 生成的内容结果 (由 content generation step 填充)
    generated_content?: {
        title: string;
        text: string;
        emotion: string;
        hashtags: string[];
        video_url?: string;
        audio_url?: string;
        // IMAGE_TEXT 模式额外字段
        image_urls?: string[];           // finalImages - 最终使用的图片 URLs
        golden_quotes?: string[];         // 金句列表
        copy_strategy?: 'variant' | 'split';  // 文案策略
        copy_variants?: object;           // 变体或拆分数据
        image_decision_summary?: string;  // 图片决策摘要
    };
}

export interface CreateTaskInput {
    supabase_uuid: string;
    xhs_account_id: string;
    xhs_user_id: string;  // 原有表必填字段
    theme: string;        // 原有表必填字段
    orchestrator_run_id: string;
    strategy_version: number;
    plan_version: number;
    scheduled_time: Date;
    content_mode: ContentMode;
    title?: string;
    content?: string;
    metadata: TaskMetadata;
}

export interface DailyTask {
    id: string;
    supabase_uuid: string;
    xhs_account_id: string;
    orchestrator_run_id: string;
    strategy_version: number;
    plan_version: number;
    scheduled_time: string;
    content_mode: ContentMode;
    title: string | null;
    content: string | null;
    status: TaskStatus;
    metadata: TaskMetadata;
    created_at: string;
}

// ============================================================
// Step
// ============================================================
export type StepType =
    | 'generate_copy'
    | 'refine_title'
    | 'compress_script'
    | 'generate_video'
    | 'publish'
    | 'fetch_metrics'
    | 'review'
    | 'fallback_image_text';

export type StepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'cancelled';

export interface StepInputSnapshot {
    strategy_version: number;
    plan_version: number;
    sentiment_brief_id: string;
    material_analysis_id: string;
    orchestrator_run_id: string;
    task_mode?: ContentMode;
    pillar?: string;
    topic?: string;
    title?: string;
    content?: string;
    metrics_window?: '1h' | '24h' | '7d';
    note_id?: string;
}

export interface CreateStepInput {
    task_id: string;
    supabase_uuid: string;
    xhs_account_id: string;
    step_type: StepType;
    step_key?: string;
    scheduled_at?: Date;
    input_snapshot: StepInputSnapshot;
}

export interface TaskStep {
    id: string;
    task_id: string;
    supabase_uuid: string;
    xhs_account_id: string;
    step_type: StepType;
    step_key: string | null;
    status: StepStatus;
    attempt: number;
    max_attempts: number;
    scheduled_at: string | null;
    input_snapshot: StepInputSnapshot;
    output_payload: Record<string, unknown> | null;
    created_at: string;
}

// ============================================================
// API Request/Response
// ============================================================
export interface StartOrchestratorRequest {
    xhs_account_id: string;
    theme?: string;
    title?: string;
    content?: string;
    dry_run?: boolean;
}

export interface StartOrchestratorResponse {
    success: boolean;
    orchestrator_run_id: string;
    strategy_version: number;
    plan_version: number;
    task_id?: string;
    tasks_created: number;
    steps_created: number;
    error?: string;
}

export interface MaintenanceTickResponse {
    recovered_count: number;
    fallbacks_applied: number;
    tasks_refreshed: number;
    timestamp: string;
}

// ============================================================
// Account
// ============================================================
export type ExecutionProvider = 'chrome_extension' | 'skyvern';

export interface XhsAccount {
    id: string;
    supabase_uuid: string;
    nickname: string | null;
    red_id: string | null;
    disabled_until: string | null;
    execution_provider: ExecutionProvider;
    skyvern_profile_id: string | null;
}
