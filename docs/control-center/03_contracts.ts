/**
 * 智能中控中心 - TypeScript 接口契约
 * 
 * 所有执行器/扩展/前端必须按此契约实现数据交互
 */

// ============================================================
// 1. 输入层类型
// ============================================================

export interface ProductProfile {
    id: string;
    product_name: string;
    target_audience: string;
    marketing_goal: string;
    brand_style: string;
    materials: string[];
    forbidden_words: string[];
    evidence_chains: string[];
}

export interface MaterialAnalysis {
    id: string;
    selling_points: string[];
    differentiation: string[];
    competitor_attacks: string[];
    faq: Array<{ question: string; answer: string }>;
    evidence_chains: string[];
    forbidden_words: string[];
    talking_points: string[];
}

export interface SentimentBrief {
    id: string;
    source: 'bettafish' | 'manual';
    hot_topics: string[];
    controversies: string[];
    sentiment_polarity: 'positive' | 'neutral' | 'negative';
    trends: string[];
    talking_points: string[];
    risks: string[];
    created_at: string;
}

export interface AccountState {
    xhs_account_id: string;
    nickname: string;
    historical_content_count: number;
    cooldown_keys: string[];
    resource_inventory: {
        images: number;
        videos: number;
    };
    publishing_rhythm: {
        posts_per_day: number;
        optimal_times: string[];
    };
}

// ============================================================
// 2. 策略输出类型
// ============================================================

export interface AccountPersona {
    xhs_account_id: string;
    positioning_axis: string;
    voice_style: string;
    content_pillars: string[];
    forbidden_topics: string[];
    dedupe_keys: string[];
}

export interface ContentDirectionStrategy {
    directions: Array<{
        pillar: string;
        topics: string[];
        narrative_framework: string;
        risks: string[];
        evidence_chains: string[];
        forbidden_words: string[];
    }>;
}

export type ContentMode = 'IMAGE_TEXT' | 'UGC_VIDEO' | 'AVATAR_VIDEO' | 'AVATAR_MIXCUT';

export interface ContentModePlan {
    mode: ContentMode;
    dependencies: string[];
    material_requirements: string[];
    fallback_mode: ContentMode | null;
}

// ============================================================
// 3. 计划与任务类型
// ============================================================

export interface WeeklyPlan {
    id: string;
    xhs_account_id: string;
    version: number;
    week_start_date: string; // YYYY-MM-DD
    days: Array<{
        date: string;
        tasks: DailyTaskBrief[];
    }>;
}

export interface DailyTaskBrief {
    pillar: string;
    topic: string;
    mode: ContentMode;
    priority: number;
    scheduled_time: string;
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
    image_urls: string[];
    hashtags: string[];
    cooldown_keys: string[];
    status: TaskStatus;
    metadata: TaskMetadata;
    created_at: string;
    updated_at: string;
}

export type TaskStatus = 'pending' | 'copy_ready' | 'video_ready' | 'published' | 'failed' | 'skipped';

export interface TaskMetadata {
    review_mode: 'auto_publish' | 'manual_confirm';
    trace: TaskTrace;
    note_id?: string;
    note_url?: string;
    effective_mode?: ContentMode;
    fallback_applied?: boolean;
    failure_reason?: string;
}

/**
 * 🔥 追溯字段类型（确保字段名一致）
 */
export interface TaskTrace {
    sentiment_brief_id: string;
    material_analysis_id: string;
}

// ============================================================
// 4. Step 类型
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

export interface TaskStep {
    id: string;
    task_id: string;
    supabase_uuid: string;
    xhs_account_id: string;
    step_type: StepType;
    step_key: string | null;  // 用于 fetch_metrics 窗口
    status: StepStatus;
    attempt: number;
    max_attempts: number;
    scheduled_at: string | null;
    input_snapshot: StepInputSnapshot;
    output_payload: Record<string, unknown> | null;
    usage: StepUsage | null;
    provider: string | null;
    provider_run_id: string | null;
    error: StepError | null;
    locked_by: string | null;
    locked_at: string | null;
    started_at: string | null;
    finished_at: string | null;
    created_at: string;
}

/**
 * 🔥 P0 必须包含的五个追溯字段
 * 禁止使用 'inherit' 等占位符
 */
export interface StepInputSnapshot {
    // 必须字段（DB CHECK 约束）
    strategy_version: number;
    plan_version: number;
    sentiment_brief_id: string;
    material_analysis_id: string;
    orchestrator_run_id: string;

    // 可选字段（根据 step_type）
    task_mode?: ContentMode;
    pillar?: string;
    topic?: string;
    title?: string;
    content?: string;
    image_urls?: string[];
    hashtags?: string[];
    metrics_window?: '1h' | '24h' | '7d';
    note_id?: string;
    note_url?: string;
    fallback_from?: string;
}

export interface StepUsage {
    input_tokens?: number;
    output_tokens?: number;
    cost_usd?: number;
    duration_ms?: number;
}

export interface StepError {
    message: string;
    code?: string;
    details?: Record<string, unknown>;
    [key: string]: unknown;  // 允许追加历史错误
}

// ============================================================
// 5. API 契约
// ============================================================

// POST /agent/auto/start
export interface StartOrchestratorRequest {
    xhs_account_id: string;
    dry_run?: boolean;
    force_regenerate?: boolean;
}

export interface StartOrchestratorResponse {
    success: boolean;
    orchestrator_run_id: string;
    strategy_version: number;
    plan_version: number;
    status: 'generating' | 'completed' | 'failed';
    tasks_created?: number;
    steps_created?: number;
    error?: string;
}

// GET /agent/orchestrator/status
export interface OrchestratorStatusResponse {
    orchestrator_run_id: string;
    has_strategy: boolean;
    has_plan: boolean;
    tasks_created: number;
    steps_created: number;
    steps_by_status: {
        pending: number;
        running: number;
        succeeded: number;
        failed: number;
        skipped: number;
    };
    last_activity_at: string;
}

// POST /agent/orchestrator/maintenance/tick
export interface MaintenanceTickResponse {
    recovered_count: number;
    fallbacks_applied: number;
    tasks_refreshed: number;
    timestamp: string;
}

// ============================================================
// 6. Chrome Extension 契约
// ============================================================

export interface PublishStepInput {
    title: string;
    content: string;
    image_urls: string[];
    hashtags: string[];
}

export interface PublishStepOutput {
    note_id: string;
    note_url: string;
    published_at: string;
}

export interface FetchMetricsInput {
    note_id: string;
    note_url: string;
    metrics_window: '1h' | '24h' | '7d';
}

export interface FetchMetricsOutput {
    likes: number;
    collects: number;
    comments: number;
    shares: number;
    views: number;
    fetched_at: string;
}

// ============================================================
// 7. n8n UGC 工作流契约
// ============================================================

export interface UGCGenerationParams {
    desc: string;
    img: string;
    gender: 'male' | 'female';
    duration: string;
    language: 'zh-CN' | 'en-US' | 'ja-JP';
    sessionId: string;  // = step_id
    callbackUrl: string;
}

export interface UGCCallbackPayload {
    sessionId: string;
    videoUrl: string;
    status: 'success' | 'failed';
    error?: string;
}

// ============================================================
// 8. 内容签名（P2 去重）
// ============================================================

export type SignatureType = 'topic' | 'pillar' | 'hook' | 'title';

export interface ContentSignature {
    id: string;
    supabase_uuid: string;
    xhs_account_id: string;
    signature_hash: string;
    signature_type: SignatureType;
    task_id: string | null;
    created_at: string;
}

/**
 * 生成签名 hash 的标准算法
 * 
 * 🔥 注意：不同环境使用不同实现
 * - Chrome Extension: 使用 Web Crypto API (crypto.subtle)
 * - Node.js (Orchestrator/prome-platform): 使用 crypto 模块
 * 
 * @param text 需要签名的文本
 * @returns SHA256 hash 的前 16 位 hex
 */
export async function generateSignatureHash(text: string): Promise<string> {
    // 1. 标准化文本：去除空白、转小写
    const normalized = text.replace(/\s+/g, '').toLowerCase();
    const encoder = new TextEncoder();
    const data = encoder.encode(normalized);

    // 2. 计算 SHA256
    if (typeof crypto !== 'undefined' && crypto.subtle) {
        // Chrome Extension / Browser 环境
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex.substring(0, 16);
    } else {
        // Node.js 环境
        const cryptoNode = await import('crypto');
        const hash = cryptoNode.createHash('sha256').update(normalized).digest('hex');
        return hash.substring(0, 16);
    }
}

/**
 * 同步版本（仅限 Node.js）
 */
export function generateSignatureHashSync(text: string): string {
    // 仅限 Node.js 环境使用
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require('crypto');
    const normalized = text.replace(/\s+/g, '').toLowerCase();
    return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

