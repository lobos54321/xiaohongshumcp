/**
 * BrainService - 大脑规划层
 *
 * 用 Claude Opus 4.6 作为推理引擎：
 * 1. analyze() - 分析产品 + 用户素材，推荐内容形态，生成统一 brief
 * 2. execute() - 调 Dify 生成母文案，更新 brief
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '../orchestrator/db/supabase.js';
import { difyClient } from './DifyClient.js';
import { configService } from './ConfigService.js';

// ============ 类型定义 ============

export interface BrainBrief {
    id?: string;
    userId: string;
    taskId: string;
    productDescription: string;
    productAnalysis: {
        productType: 'visual' | 'educational' | 'service' | 'physical' | 'digital';
        visualAppeal: 'high' | 'medium' | 'low';
        contentComplexity: 'simple' | 'moderate' | 'complex';
        targetDemographic: string;
    };
    recommendedModes: string[];
    selectedModes: string[];
    modeReasoning: string;
    coreMessage: string;
    keySellingPoints: string[];
    toneAndStyle: string;
    targetAudience: string;
    contentAngle: string;
    motherCopyTitle?: string;
    motherCopyText?: string;
    motherCopyEmotion?: string;
    pipelineStatus: Record<string, string>;
}

export interface AnalyzeInput {
    productDescription: string;
    userId: string;
    taskId: string;
    targetAudience?: string;
    marketingGoal?: string;
    brandStyle?: string;
    sentimentData?: {
        topics: string[];
        keywords: string[];
        insights: any;
        riskSignals: string[];
    } | null;
}

// ============ BrainService 实现 ============

class BrainService {
    private getClient(): Anthropic {
        return new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY || '',
        });
    }

    /**
     * 分析产品并生成统一 brief
     */
    async analyze(input: AnalyzeInput): Promise<BrainBrief> {
        console.log(`[BrainService] Analyzing product for user ${input.userId}...`);

        // 1. 读取用户最新素材
        const materials = await this.getUserMaterials(input.userId);
        const materialsSummary = materials.length > 0
            ? materials.map(m => `- [${m.type}] ${m.title || m.url || m.content?.substring(0, 100)}`).join('\n')
            : '无素材';

        // 2. 检查数字人资产
        const hasAvatarAssets = await this.checkAvatarAssets(input.userId);

        // 3. 调用 Claude 分析
        const model = await configService.get('CLAUDE_MODEL') || 'claude-opus-4-6';
        const client = this.getClient();

        const response = await client.messages.create({
            model,
            max_tokens: 4096,
            messages: [{
                role: 'user',
                content: `你是一个专业的社交媒体内容策略师。请分析以下产品信息和用户素材，生成一份内容策划 brief。

## 产品信息
${input.productDescription}

## 目标受众
${input.targetAudience || '未指定'}

## 营销目标
${input.marketingGoal || '未指定'}

## 品牌调性
${input.brandStyle || '未指定'}

## 用户已有素材
${materialsSummary}

## 数字人资产
${hasAvatarAssets ? '已有数字人照片和语音样本' : '无数字人资产'}

## 舆情数据
${input.sentimentData ? `热门话题: ${input.sentimentData.topics.join(', ')}\n关键词: ${input.sentimentData.keywords.join(', ')}` : '无舆情数据'}

请以 JSON 格式返回分析结果（不要包含 markdown 代码块标记）：
{
  "productAnalysis": {
    "productType": "visual|educational|service|physical|digital",
    "visualAppeal": "high|medium|low",
    "contentComplexity": "simple|moderate|complex",
    "targetDemographic": "描述目标人群特征"
  },
  "recommendedModes": ["IMAGE_TEXT", "AVATAR_VIDEO", "UGC_VIDEO"],
  "modeReasoning": "推荐理由",
  "coreMessage": "核心传播信息（一句话）",
  "keySellingPoints": ["卖点1", "卖点2", "卖点3"],
  "toneAndStyle": "内容调性描述",
  "contentAngle": "内容切入角度"
}

注意：
- recommendedModes 按推荐优先级排序
- 如果没有数字人资产，不要推荐 AVATAR_VIDEO
- coreMessage 要简洁有力，适合社交媒体传播
- contentAngle 要具体，不要泛泛而谈`
            }],
        });

        // 4. 解析结果
        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        let analysis: any;
        try {
            const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            analysis = JSON.parse(cleaned);
        } catch (e) {
            console.error('[BrainService] Failed to parse Claude response:', text);
            // Fallback
            analysis = {
                productAnalysis: {
                    productType: 'service',
                    visualAppeal: 'medium',
                    contentComplexity: 'moderate',
                    targetDemographic: input.targetAudience || '通用受众',
                },
                recommendedModes: ['IMAGE_TEXT'],
                modeReasoning: '默认推荐图文模式',
                coreMessage: input.productDescription.substring(0, 50),
                keySellingPoints: [],
                toneAndStyle: input.brandStyle || 'professional',
                contentAngle: '产品介绍',
            };
        }

        // 5. 构建 brief
        const brief: BrainBrief = {
            userId: input.userId,
            taskId: input.taskId,
            productDescription: input.productDescription,
            productAnalysis: analysis.productAnalysis,
            recommendedModes: analysis.recommendedModes || ['IMAGE_TEXT'],
            selectedModes: analysis.recommendedModes || ['IMAGE_TEXT'],
            modeReasoning: analysis.modeReasoning || '',
            coreMessage: analysis.coreMessage || '',
            keySellingPoints: analysis.keySellingPoints || [],
            toneAndStyle: analysis.toneAndStyle || '',
            targetAudience: input.targetAudience || analysis.productAnalysis?.targetDemographic || '',
            contentAngle: analysis.contentAngle || '',
            pipelineStatus: {},
        };

        // 6. 保存到 DB
        brief.id = await this.saveBrief(brief);
        console.log(`[BrainService] Brief created: ${brief.id}`);

        return brief;
    }

    /**
     * 执行 brief：调 Dify 生成母文案
     */
    async execute(brief: BrainBrief): Promise<BrainBrief> {
        console.log(`[BrainService] Executing brief ${brief.id}...`);

        try {
            const result = await difyClient.generateMarketingCopy({
                productInfo: brief.productDescription,
                targetAudience: brief.targetAudience,
                marketingGoal: brief.contentAngle,
                platform: 'xiaohongshu',
                userId: brief.userId,
            });

            brief.motherCopyTitle = result.title;
            brief.motherCopyText = result.text;
            brief.motherCopyEmotion = result.emotion;

            // 更新 DB
            if (brief.id) {
                await supabaseAdmin
                    .from('brain_briefs')
                    .update({
                        mother_copy_title: brief.motherCopyTitle,
                        mother_copy_text: brief.motherCopyText,
                        mother_copy_emotion: brief.motherCopyEmotion,
                    })
                    .eq('id', brief.id);
            }

            console.log(`[BrainService] Mother copy generated: "${brief.motherCopyTitle}"`);
        } catch (e) {
            console.error('[BrainService] Failed to generate mother copy:', e);
            throw e;
        }

        return brief;
    }

    /**
     * 更新 brief 的 selectedModes（用户调整后）
     */
    async updateSelectedModes(briefId: string, modes: string[]): Promise<void> {
        await supabaseAdmin
            .from('brain_briefs')
            .update({ selected_modes: modes })
            .eq('id', briefId);
    }

    /**
     * 获取 brief
     */
    async getBrief(taskId: string): Promise<BrainBrief | null> {
        const { data, error } = await supabaseAdmin
            .from('brain_briefs')
            .select('*')
            .eq('task_id', taskId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error || !data) return null;

        return {
            id: data.id,
            userId: data.user_id,
            taskId: data.task_id,
            productDescription: data.product_description || '',
            productAnalysis: data.product_analysis || {},
            recommendedModes: data.recommended_modes || [],
            selectedModes: data.selected_modes || [],
            modeReasoning: data.mode_reasoning || '',
            coreMessage: data.core_message || '',
            keySellingPoints: data.key_selling_points || [],
            toneAndStyle: data.tone_and_style || '',
            targetAudience: data.target_audience || '',
            contentAngle: data.content_angle || '',
            motherCopyTitle: data.mother_copy_title,
            motherCopyText: data.mother_copy_text,
            motherCopyEmotion: data.mother_copy_emotion,
            pipelineStatus: data.pipeline_status || {},
        };
    }

    // ============ Private Methods ============

    private async getUserMaterials(userId: string): Promise<any[]> {
        try {
            const { data } = await supabaseAdmin
                .from('user_materials')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(20);
            return data || [];
        } catch {
            return [];
        }
    }

    private async checkAvatarAssets(userId: string): Promise<boolean> {
        try {
            const { data } = await supabaseAdmin
                .from('xhs_user_profiles')
                .select('avatar_photo_url, voice_sample_url')
                .eq('user_id', userId)
                .single();
            return !!(data?.avatar_photo_url && data?.voice_sample_url);
        } catch {
            return false;
        }
    }

    private async saveBrief(brief: BrainBrief): Promise<string> {
        const { data, error } = await supabaseAdmin
            .from('brain_briefs')
            .insert({
                user_id: brief.userId,
                task_id: brief.taskId,
                product_description: brief.productDescription,
                product_analysis: brief.productAnalysis,
                recommended_modes: brief.recommendedModes,
                selected_modes: brief.selectedModes,
                mode_reasoning: brief.modeReasoning,
                core_message: brief.coreMessage,
                key_selling_points: brief.keySellingPoints,
                tone_and_style: brief.toneAndStyle,
                target_audience: brief.targetAudience,
                content_angle: brief.contentAngle,
                pipeline_status: brief.pipelineStatus,
            })
            .select('id')
            .single();

        if (error) {
            console.error('[BrainService] Failed to save brief:', error.message);
            throw error;
        }

        return data.id;
    }
}

export const brainService = new BrainService();
