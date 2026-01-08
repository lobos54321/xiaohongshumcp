/**
 * UserProfile Service
 * 
 * 从 xhs_user_profiles 读取用户产品配置和 AI 分析结果
 * 提取关键词用于 BettaFish 舆情搜索
 */

import { supabaseAdmin } from '../orchestrator/db/supabase.js';

export interface UserProfile {
    id: string;
    supabase_uuid: string;
    product_name: string;
    target_audience: string | null;
    region: string | null;
    marketing_goal: string;
    brand_style: string;
    review_mode: string;
    post_frequency: string;
    posts_per_day: number;  // 用户配置的每日发布篇数 (1-10)
    material_images: string[] | null;
    material_documents: string[] | null;
    material_analysis: string | null;
    // 内容生成相关字段
    product_info?: string;           // 产品详细信息（用于 Dify 工作流）
    target_words?: number;           // 目标字数
    avatar_photo_url?: string;       // 数字人照片 URL
    voice_sample_url?: string;       // 语音样本 URL
    content_modes?: string[];        // 用户选择的内容模式
}

export interface ExtractedKeywords {
    productKeywords: string[];      // 产品相关
    audienceKeywords: string[];     // 受众相关
    topicKeywords: string[];        // 话题相关
    searchQuery: string;            // 组合后的 BettaFish 搜索词
}

export class UserProfileService {
    /**
     * 获取用户的产品配置
     */
    async getProfile(supabaseUuid: string): Promise<UserProfile | null> {
        const { data, error } = await supabaseAdmin
            .from('xhs_user_profiles')
            .select('*')
            .eq('supabase_uuid', supabaseUuid)
            .single();

        if (error) {
            console.error('[UserProfileService] Failed to get profile:', error);
            return null;
        }

        return data as UserProfile;
    }

    /**
     * 从 AI 分析结果中提取关键词
     */
    extractKeywordsFromAnalysis(profile: UserProfile): ExtractedKeywords {
        const productKeywords: string[] = [];
        const audienceKeywords: string[] = [];
        const topicKeywords: string[] = [];

        // 1. 从产品名称提取
        if (profile.product_name) {
            // 提取产品名中的核心词（简单分词）
            const cleanedName = profile.product_name
                .replace(/[，。、！？\n\r]/g, ' ')
                .split(' ')
                .filter(w => w.length > 2 && w.length < 20)
                .slice(0, 5);
            productKeywords.push(...cleanedName);
        }

        // 2. 从目标受众提取
        if (profile.target_audience) {
            // 提取"内容创作者"、"营销团队"等关键词
            const audiencePatterns = [
                /内容创作者/g,
                /自媒体/g,
                /运营者?/g,
                /营销/g,
                /品牌/g,
                /企业/g,
                /个人/g,
                /团队/g,
            ];
            audiencePatterns.forEach(pattern => {
                const matches = profile.target_audience?.match(pattern);
                if (matches) {
                    audienceKeywords.push(...matches);
                }
            });
        }

        // 3. 从 AI 分析中提取（如果存在）
        if (profile.material_analysis) {
            // 提取核心卖点关键词
            const analysisText = profile.material_analysis;

            // 尝试提取标记的关键词（如 **关键词**）
            const boldMatches = analysisText.match(/\*\*([^*]+)\*\*/g);
            if (boldMatches) {
                const keywords = boldMatches
                    .map(m => m.replace(/\*\*/g, '').trim())
                    .filter(k => k.length > 2 && k.length < 15)
                    .slice(0, 10);
                topicKeywords.push(...keywords);
            }

            // 尝试提取 #标签
            const hashtagMatches = analysisText.match(/#[\u4e00-\u9fa5a-zA-Z]+/g);
            if (hashtagMatches) {
                const hashtags = hashtagMatches
                    .map(h => h.replace('#', ''))
                    .slice(0, 5);
                topicKeywords.push(...hashtags);
            }

            // 提取常见痛点/卖点关键词模式
            const patterns = [
                '知识管理', '信息整合', '效率', 'AI', '自动化',
                '内容创作', '数据分析', '洞察', '智能', '第二大脑'
            ];
            patterns.forEach(p => {
                if (analysisText.includes(p)) {
                    topicKeywords.push(p);
                }
            });
        }

        // 4. 去重
        const uniqueProduct = [...new Set(productKeywords)];
        const uniqueAudience = [...new Set(audienceKeywords)];
        const uniqueTopics = [...new Set(topicKeywords)];

        // 5. 构建搜索词（优先使用产品名 + 受众）
        const searchParts: string[] = [];

        // 添加产品核心词（最多2个）
        if (uniqueProduct.length > 0) {
            searchParts.push(uniqueProduct.slice(0, 2).join(' '));
        }

        // 添加受众关键词（最多1个）
        if (uniqueAudience.length > 0) {
            searchParts.push(uniqueAudience[0]);
        }

        // 添加话题关键词（最多2个）
        if (uniqueTopics.length > 0 && searchParts.length < 3) {
            searchParts.push(uniqueTopics.slice(0, 2).join(' '));
        }

        // 如果实在没有关键词，使用产品名开头
        if (searchParts.length === 0 && profile.product_name) {
            searchParts.push(profile.product_name.substring(0, 30));
        }

        const searchQuery = searchParts.join(' ').trim();

        console.log('[UserProfileService] Extracted keywords:', {
            productKeywords: uniqueProduct,
            audienceKeywords: uniqueAudience,
            topicKeywords: uniqueTopics.slice(0, 5),
            searchQuery
        });

        return {
            productKeywords: uniqueProduct,
            audienceKeywords: uniqueAudience,
            topicKeywords: uniqueTopics,
            searchQuery
        };
    }
}

// 单例导出
export const userProfileService = new UserProfileService();
