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
import { bettaFishClient, SentimentBrief } from '../services/BettaFishClient.js';
import { userProfileService, UserProfile, ExtractedKeywords } from '../services/UserProfileService.js';
import { contentModeSelector, ContentModeDecision } from '../services/ContentModeSelector.js';
import { contentPipelineService, ContentPipelineResult } from '../services/ContentPipelineService.js';


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

            // 4. 获取用户配置并提取关键词
            let userProfile: UserProfile | null = null;
            let extractedKeywords: ExtractedKeywords | null = null;
            try {
                userProfile = await userProfileService.getProfile(account.supabase_uuid);
                if (userProfile) {
                    extractedKeywords = userProfileService.extractKeywordsFromAnalysis(userProfile);
                    console.log('[ControlCenter] Keywords extracted:', extractedKeywords.searchQuery);
                }
            } catch (profileError) {
                console.warn('[ControlCenter] Profile fetch failed (non-blocking):', profileError);
            }

            // 5. 获取舆情数据（使用提取的关键词）
            let sentimentBrief: SentimentBrief | null = null;
            try {
                // 优先使用从 AI 分析提取的关键词，否则使用请求中的 theme
                const searchQuery = extractedKeywords?.searchQuery || req.theme || '小红书热门';
                console.log('[ControlCenter] Fetching sentiment for:', searchQuery);

                const searchResult = await bettaFishClient.search(searchQuery);
                if (searchResult.success) {
                    sentimentBrief = bettaFishClient.extractSentimentBrief(searchResult);
                    console.log('[ControlCenter] Sentiment brief extracted:', {
                        topics: sentimentBrief.topics.slice(0, 3),
                        keywords: sentimentBrief.keywords.slice(0, 5),
                    });

                    // 存入 xhs_sentiment_briefs 表
                    await supabaseAdmin.from('xhs_sentiment_briefs').insert({
                        supabase_uuid: account.supabase_uuid,
                        brief_data: sentimentBrief,
                        source: 'bettafish',
                    });
                }
            } catch (sentimentError) {
                console.warn('[ControlCenter] Sentiment fetch failed (non-blocking):', sentimentError);
            }

            // 6. 决策内容形式
            let contentModeDecision: ContentModeDecision | null = null;
            let selectedContentMode: ContentMode = 'IMAGE_TEXT';  // 默认图文

            if (userProfile && extractedKeywords) {
                // 检查是否有数字人/语音素材
                const hasDigitalHumanAsset = await contentModeSelector.checkDigitalHumanAsset(account.supabase_uuid);
                const hasVoiceAsset = await contentModeSelector.checkVoiceAsset(account.supabase_uuid);

                // 获取用户偏好设置
                const { modes: userPreferredModes, autoMode } = await contentModeSelector.getUserPreferredModes(account.supabase_uuid);

                contentModeDecision = contentModeSelector.selectMode({
                    profile: userProfile,
                    keywords: extractedKeywords,
                    sentiment: sentimentBrief,
                    hasDigitalHumanAsset,
                    hasVoiceAsset,
                    userPreferredModes,
                    autoMode
                });

                selectedContentMode = contentModeDecision.selectedMode;
                console.log('[ControlCenter] Content mode selected:', selectedContentMode, '-', contentModeDecision.reasoning);
                console.log('[ControlCenter] Available modes:', contentModeDecision.availableModes);
            }

            // 7. 构建 metadata（包含内容生成所需的配置）
            const metadata: TaskMetadata = {
                review_mode: userProfile?.review_mode === 'auto' ? 'auto_publish' : 'manual_confirm',
                trace: {
                    sentiment_brief_id: sentimentBrief ? `brief_${orchestrator_run_id}` : 'none',
                    material_analysis_id: userProfile?.material_analysis ? `material_${orchestrator_run_id}` : 'none',
                },
                sentiment: sentimentBrief ? {
                    topics: sentimentBrief.topics,
                    keywords: sentimentBrief.keywords,
                    fetchedAt: sentimentBrief.fetchedAt,
                } : null,
                // 内容生成配置 (用于 Step 执行器异步生成)
                content_generation: {
                    product_info: userProfile?.product_info || req.theme || '',
                    target_audience: userProfile?.target_audience || '',
                    marketing_goal: userProfile?.marketing_goal || '',
                    target_words: userProfile?.target_words || 800,
                    avatar_photo_url: userProfile?.avatar_photo_url,
                    voice_sample_url: userProfile?.voice_sample_url,
                    content_mode: selectedContentMode,
                },
            };

            // 8. 创建 Task（使用决策者选择的内容形式）
            const task = await createTask({
                supabase_uuid: account.supabase_uuid,
                xhs_account_id: account.id,
                xhs_user_id: account.red_id || 'unknown',
                theme: req.theme || '默认主题',
                orchestrator_run_id,
                strategy_version: 1,  // Phase 1 固定为 1
                plan_version: 1,      // Phase 1 固定为 1
                scheduled_time: new Date(Date.now() + 60 * 60 * 1000),  // 1 小时后
                content_mode: selectedContentMode,
                title: req.title,
                content: req.content,
                metadata,
            });

            // 9. 创建 Steps (使用账号配置的执行器)
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
