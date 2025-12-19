/**
 * Content Mode Selector
 * 
 * 根据用户配置、产品分析和舆情数据，决定最佳内容形式
 * 
 * 支持的模式：
 * - IMAGE_TEXT: 图文笔记
 * - UGC_VIDEO: UGC 视频（1分钟内）
 * - AVATAR_VIDEO: 数字人视频（需要数字人照片 + 语音样本）
 * 
 * 决策逻辑：
 * 1. 用户可以选择一个或多个偏好模式
 * 2. 用户可以选择"自动模式"，系统根据素材自动决定
 * 3. AVATAR_VIDEO 需要有数字人照片和语音样本
 * 4. IMAGE_TEXT 和 UGC_VIDEO 随时可用
 */

import { ContentMode } from '../orchestrator/types/contracts.js';
import { SentimentBrief } from './BettaFishClient.js';
import { UserProfile, ExtractedKeywords } from './UserProfileService.js';
import { supabaseAdmin } from '../orchestrator/db/supabase.js';

export interface ContentModeDecision {
    selectedMode: ContentMode;
    reasoning: string;
    alternativeModes: ContentMode[];
    confidence: number;  // 0-1
    availableModes: ContentMode[];
}

export interface ContentModeContext {
    profile: UserProfile;
    keywords: ExtractedKeywords;
    sentiment: SentimentBrief | null;
    hasDigitalHumanAsset: boolean;
    hasVoiceAsset: boolean;
    userPreferredModes: ContentMode[];
    autoMode: boolean;
}

export class ContentModeSelector {
    /**
     * 根据上下文决定最佳内容形式
     */
    selectMode(context: ContentModeContext): ContentModeDecision {
        const {
            profile,
            hasDigitalHumanAsset,
            hasVoiceAsset,
            userPreferredModes,
            autoMode,
            sentiment
        } = context;

        // 1. 确定可用的模式
        const availableModes: ContentMode[] = ['IMAGE_TEXT', 'UGC_VIDEO'];
        if (hasDigitalHumanAsset && hasVoiceAsset) {
            availableModes.push('AVATAR_VIDEO');
        }

        let selectedMode: ContentMode = 'IMAGE_TEXT';
        let reasoning = '';
        let confidence = 0.8;
        const alternativeModes: ContentMode[] = [];

        // 2. 如果用户选择了自动模式，系统智能决策
        if (autoMode) {
            // 自动模式下，根据舆情和素材决定
            if (hasDigitalHumanAsset && hasVoiceAsset) {
                // 有数字人素材，优先数字人视频
                selectedMode = 'AVATAR_VIDEO';
                reasoning = '自动模式：检测到数字人素材，优先使用数字人视频';
                alternativeModes.push('IMAGE_TEXT', 'UGC_VIDEO');
                confidence = 0.85;
            } else if (sentiment && sentiment.topics.length > 0) {
                // 有热点话题，根据话题类型决定
                const videoTopics = ['测评', '开箱', '教程', '分享', '体验', 'vlog'];
                const hasVideoTopic = sentiment.topics.some(t =>
                    videoTopics.some(vt => t.toLowerCase().includes(vt))
                );

                if (hasVideoTopic) {
                    selectedMode = 'UGC_VIDEO';
                    reasoning = `自动模式：检测到视频类热点话题 (${sentiment.topics.slice(0, 2).join(', ')})`;
                    alternativeModes.push('IMAGE_TEXT');
                    confidence = 0.75;
                } else {
                    selectedMode = 'IMAGE_TEXT';
                    reasoning = '自动模式：图文内容更适合当前话题';
                    alternativeModes.push('UGC_VIDEO');
                    confidence = 0.8;
                }
            } else {
                // 默认图文
                selectedMode = 'IMAGE_TEXT';
                reasoning = '自动模式：默认使用图文模式';
                alternativeModes.push('UGC_VIDEO');
                confidence = 0.9;
            }
        } else {
            // 3. 用户手动选择模式
            if (userPreferredModes.length === 0) {
                // 没有选择任何模式，默认图文
                selectedMode = 'IMAGE_TEXT';
                reasoning = '用户未选择偏好，默认使用图文模式';
                confidence = 0.9;
            } else if (userPreferredModes.length === 1) {
                // 用户只选了一个模式
                const preferredMode = userPreferredModes[0];

                // 检查是否可用
                if (availableModes.includes(preferredMode)) {
                    selectedMode = preferredMode;
                    reasoning = `使用用户选择的 ${this.getModeLabel(preferredMode)} 模式`;
                    confidence = 0.95;
                } else {
                    // 用户选了 AVATAR_VIDEO 但没有素材，降级
                    selectedMode = 'IMAGE_TEXT';
                    reasoning = '数字人素材不完整，降级为图文模式';
                    confidence = 0.7;
                }
            } else {
                // 用户选了多个模式，轮换选择
                // 简单策略：按优先级选择第一个可用的
                const priority: ContentMode[] = ['AVATAR_VIDEO', 'UGC_VIDEO', 'IMAGE_TEXT'];

                for (const mode of priority) {
                    if (userPreferredModes.includes(mode) && availableModes.includes(mode)) {
                        selectedMode = mode;
                        reasoning = `从用户选择的模式中选择 ${this.getModeLabel(mode)}`;

                        // 其他用户选择的模式作为备选
                        userPreferredModes
                            .filter(m => m !== mode && availableModes.includes(m))
                            .forEach(m => alternativeModes.push(m));

                        confidence = 0.85;
                        break;
                    }
                }
            }
        }

        // 4. 根据营销目标微调（仅在自动模式下）
        if (autoMode) {
            const marketingGoal = profile.marketing_goal?.toLowerCase() || '';

            if (marketingGoal.includes('brand') || marketingGoal.includes('品牌')) {
                // 品牌曝光需要量大，图文更高效
                if (selectedMode !== 'IMAGE_TEXT' && !userPreferredModes.includes(selectedMode)) {
                    alternativeModes.unshift(selectedMode);
                    selectedMode = 'IMAGE_TEXT';
                    reasoning += '，品牌曝光目标倾向图文';
                }
            } else if (marketingGoal.includes('sales') || marketingGoal.includes('转化')) {
                // 销售转化，视频更有说服力
                if (selectedMode === 'IMAGE_TEXT' && availableModes.includes('UGC_VIDEO')) {
                    alternativeModes.unshift(selectedMode);
                    selectedMode = 'UGC_VIDEO';
                    reasoning += '，销售转化目标倾向视频';
                }
            }
        }

        console.log('[ContentModeSelector] Decision:', {
            selectedMode,
            reasoning,
            confidence,
            availableModes,
            autoMode,
            userPreferredModes
        });

        return {
            selectedMode,
            reasoning,
            alternativeModes,
            confidence,
            availableModes
        };
    }

    /**
     * 从 Supabase 检查用户是否有数字人素材
     */
    async checkDigitalHumanAsset(supabaseUuid: string): Promise<boolean> {
        try {
            const { data, error } = await supabaseAdmin
                .from('xhs_user_profiles')
                .select('avatar_photo_url')
                .eq('supabase_uuid', supabaseUuid)
                .single();

            if (error || !data) return false;

            return !!data.avatar_photo_url && data.avatar_photo_url.length > 0;
        } catch (err) {
            console.error('[ContentModeSelector] Failed to check avatar asset:', err);
            return false;
        }
    }

    /**
     * 从 Supabase 检查用户是否有语音素材
     */
    async checkVoiceAsset(supabaseUuid: string): Promise<boolean> {
        try {
            const { data, error } = await supabaseAdmin
                .from('xhs_user_profiles')
                .select('voice_sample_url')
                .eq('supabase_uuid', supabaseUuid)
                .single();

            if (error || !data) return false;

            return !!data.voice_sample_url && data.voice_sample_url.length > 0;
        } catch (err) {
            console.error('[ContentModeSelector] Failed to check voice asset:', err);
            return false;
        }
    }

    /**
     * 获取用户配置的偏好模式
     */
    async getUserPreferredModes(supabaseUuid: string): Promise<{
        modes: ContentMode[];
        autoMode: boolean;
    }> {
        try {
            const { data, error } = await supabaseAdmin
                .from('xhs_user_profiles')
                .select('content_mode_preference')
                .eq('supabase_uuid', supabaseUuid)
                .single();

            if (error || !data) {
                return { modes: ['IMAGE_TEXT'], autoMode: false };
            }

            const preference = data.content_mode_preference;

            // 如果是 null 或空，默认图文
            if (!preference) {
                return { modes: ['IMAGE_TEXT'], autoMode: false };
            }

            // 如果是 'AUTO'，启用自动模式
            if (preference === 'AUTO') {
                return { modes: ['IMAGE_TEXT', 'UGC_VIDEO', 'AVATAR_VIDEO'], autoMode: true };
            }

            // 单选模式
            return {
                modes: [preference as ContentMode],
                autoMode: false
            };
        } catch (err) {
            console.error('[ContentModeSelector] Failed to get user preferences:', err);
            return { modes: ['IMAGE_TEXT'], autoMode: false };
        }
    }

    /**
     * 获取模式的中文标签
     */
    private getModeLabel(mode: ContentMode): string {
        switch (mode) {
            case 'IMAGE_TEXT': return '图文';
            case 'UGC_VIDEO': return 'UGC视频';
            case 'AVATAR_VIDEO': return '数字人视频';
            default: return mode;
        }
    }
}

// 单例导出
export const contentModeSelector = new ContentModeSelector();
