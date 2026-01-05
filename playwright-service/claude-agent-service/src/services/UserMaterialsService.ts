/**
 * UserMaterialsService - 用户素材管理服务
 * 
 * 功能：
 * 1. 获取用户素材列表（按时间线排序）
 * 2. 添加/更新素材
 * 3. 记录素材使用情况
 */

import { supabaseAdmin } from '../orchestrator/db/supabase.js';

// ============ 类型定义 ============

export type MaterialType = 'image' | 'document' | 'text' | 'video';
export type MaterialCategory = 'product_image' | 'scene_image' | 'testimonial' | 'copy_fragment' | 'product_doc' | 'other';

export interface UserMaterial {
    id: string;
    user_id: string;
    type: MaterialType;
    url?: string;
    content?: string;
    title?: string;
    category?: MaterialCategory;
    tags?: string[];
    created_at: string;
    updated_at: string;
    last_used_at?: string;
    use_count: number;
}

export interface CreateMaterialInput {
    type: MaterialType;
    url?: string;
    content?: string;
    title?: string;
    category?: MaterialCategory;
    tags?: string[];
}

// ============ 爆款参考类型 ============

export type ReferencePlatform = 'xiaohongshu' | 'douyin' | 'weibo' | 'bilibili' | 'other';
export type ReferenceCategory = 'same_product' | 'competitor' | 'industry' | 'trending';

export interface CreativeReference {
    id: string;
    user_id: string;
    platform: ReferencePlatform;
    original_url?: string;
    title?: string;
    content?: string;
    engagement_count: number;
    category?: ReferenceCategory;
    relevance_score: number;
    success_factors?: string[];
    key_phrases?: string[];
    rewritable_parts?: string;
    collected_at: string;
}

export interface CreateReferenceInput {
    platform: ReferencePlatform;
    original_url?: string;
    title?: string;
    content?: string;
    engagement_count?: number;
    like_count?: number;
    comment_count?: number;
    collect_count?: number;
    category?: ReferenceCategory;
    relevance_score?: number;
    success_factors?: string[];
    key_phrases?: string[];
    rewritable_parts?: string;
}

// ============ UserMaterialsService 实现 ============

export class UserMaterialsService {

    /**
     * 获取用户最新素材（按时间线排序）
     */
    async getRecentMaterials(
        userId: string,
        limit: number = 10,
        category?: MaterialCategory
    ): Promise<UserMaterial[]> {
        let query = supabaseAdmin
            .from('user_materials')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (category) {
            query = query.eq('category', category);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[UserMaterialsService] Failed to get materials:', error);
            return [];
        }

        return data as UserMaterial[];
    }

    /**
     * 添加素材
     */
    async addMaterial(userId: string, input: CreateMaterialInput): Promise<UserMaterial | null> {
        const { data, error } = await supabaseAdmin
            .from('user_materials')
            .insert({
                user_id: userId,
                ...input,
            })
            .select()
            .single();

        if (error) {
            console.error('[UserMaterialsService] Failed to add material:', error);
            return null;
        }

        return data as UserMaterial;
    }

    /**
     * 记录素材使用
     */
    async recordUsage(materialId: string): Promise<void> {
        await supabaseAdmin
            .from('user_materials')
            .update({
                last_used_at: new Date().toISOString(),
                use_count: supabaseAdmin.rpc('increment', { row_id: materialId }),
            })
            .eq('id', materialId);
    }

    /**
     * 批量记录素材使用
     */
    async recordBulkUsage(materialIds: string[]): Promise<void> {
        for (const id of materialIds) {
            await supabaseAdmin
                .from('user_materials')
                .update({
                    last_used_at: new Date().toISOString(),
                })
                .eq('id', id);
        }
    }

    // ============ 爆款参考相关 ============

    /**
     * 获取相关爆款参考
     */
    async getRelevantReferences(
        userId: string,
        limit: number = 5
    ): Promise<CreativeReference[]> {
        const { data, error } = await supabaseAdmin
            .from('creative_references')
            .select('*')
            .eq('user_id', userId)
            .order('relevance_score', { ascending: false })
            .order('engagement_count', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('[UserMaterialsService] Failed to get references:', error);
            return [];
        }

        return data as CreativeReference[];
    }

    /**
     * 获取最新采集的爆款参考
     */
    async getRecentReferences(
        userId: string,
        limit: number = 5
    ): Promise<CreativeReference[]> {
        const { data, error } = await supabaseAdmin
            .from('creative_references')
            .select('*')
            .eq('user_id', userId)
            .order('collected_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('[UserMaterialsService] Failed to get recent references:', error);
            return [];
        }

        return data as CreativeReference[];
    }

    /**
     * 添加爆款参考
     */
    async addReference(userId: string, input: CreateReferenceInput): Promise<CreativeReference | null> {
        const { data, error } = await supabaseAdmin
            .from('creative_references')
            .insert({
                user_id: userId,
                ...input,
            })
            .select()
            .single();

        if (error) {
            console.error('[UserMaterialsService] Failed to add reference:', error);
            return null;
        }

        return data as CreativeReference;
    }
}

// 单例导出
export const userMaterialsService = new UserMaterialsService();
