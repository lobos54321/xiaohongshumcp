/**
 * EnhancedProductInfoBuilder - 增强版产品信息构建器
 * 
 * 将用户素材和爆款参考整合到 productInfo 中，
 * 让 DIFY 工作流在生成文案时可以参考这些素材。
 */

import { userMaterialsService, UserMaterial, CreativeReference } from './UserMaterialsService.js';

// ============ 类型定义 ============

export interface EnhancedProductInfoOptions {
    /** 原始产品信息 */
    originalProductInfo: string;
    /** 包含最新素材数量 */
    recentMaterialsCount?: number;
    /** 包含爆款参考数量 */
    referencesCount?: number;
    /** 素材类型筛选 */
    materialCategories?: string[];
}

export interface EnhancedProductInfoResult {
    /** 增强后的 productInfo */
    enhancedInfo: string;
    /** 使用的素材 IDs */
    usedMaterialIds: string[];
    /** 使用的参考 IDs */
    usedReferenceIds: string[];
    /** 增强信息统计 */
    stats: {
        originalLength: number;
        enhancedLength: number;
        materialsIncluded: number;
        referencesIncluded: number;
    };
}

// ============ EnhancedProductInfoBuilder 实现 ============

export class EnhancedProductInfoBuilder {

    /**
     * 构建增强版 productInfo
     */
    async build(
        userId: string,
        options: EnhancedProductInfoOptions
    ): Promise<EnhancedProductInfoResult> {
        const {
            originalProductInfo,
            recentMaterialsCount = 5,
            referencesCount = 3,
        } = options;

        console.log('[EnhancedProductInfoBuilder] Building enhanced productInfo for user:', userId);

        // 1. 获取最新用户素材
        const recentMaterials = await userMaterialsService.getRecentMaterials(
            userId,
            recentMaterialsCount
        );

        // 2. 获取相关爆款参考
        const references = await userMaterialsService.getRelevantReferences(
            userId,
            referencesCount
        );

        // 3. 构建增强版内容
        let enhanced = originalProductInfo;
        const usedMaterialIds: string[] = [];
        const usedReferenceIds: string[] = [];

        // 添加最新素材信息
        if (recentMaterials.length > 0) {
            enhanced += this.formatMaterialsSection(recentMaterials);
            usedMaterialIds.push(...recentMaterials.map(m => m.id));
        }

        // 添加爆款参考
        if (references.length > 0) {
            enhanced += this.formatReferencesSection(references);
            usedReferenceIds.push(...references.map(r => r.id));
        }

        console.log('[EnhancedProductInfoBuilder] Enhanced result:', {
            originalLength: originalProductInfo.length,
            enhancedLength: enhanced.length,
            materialsIncluded: recentMaterials.length,
            referencesIncluded: references.length,
        });

        return {
            enhancedInfo: enhanced,
            usedMaterialIds,
            usedReferenceIds,
            stats: {
                originalLength: originalProductInfo.length,
                enhancedLength: enhanced.length,
                materialsIncluded: recentMaterials.length,
                referencesIncluded: references.length,
            },
        };
    }

    /**
     * 格式化素材部分
     */
    private formatMaterialsSection(materials: UserMaterial[]): string {
        if (materials.length === 0) return '';

        const today = new Date().toLocaleDateString('zh-CN');
        let section = `\n\n## 📦 最新素材 (${today})\n`;
        section += `以下是我最近更新的素材，请在创作时参考使用：\n\n`;

        for (const material of materials) {
            const date = new Date(material.created_at).toLocaleDateString('zh-CN');
            const categoryLabel = this.getCategoryLabel(material.category);

            if (material.content) {
                // 文本类素材
                const preview = material.content.length > 100
                    ? material.content.substring(0, 100) + '...'
                    : material.content;
                section += `- [${categoryLabel}] ${material.title || '素材'} (${date})\n`;
                section += `  内容: ${preview}\n`;
            } else if (material.url) {
                // 文件类素材
                section += `- [${categoryLabel}] ${material.title || '素材'} (${date})\n`;
            }
        }

        return section;
    }

    /**
     * 格式化爆款参考部分
     */
    private formatReferencesSection(references: CreativeReference[]): string {
        if (references.length === 0) return '';

        let section = `\n\n## 🔥 爆款参考 (请借鉴写作风格)\n`;
        section += `以下是同类产品的高互动内容，请参考它们的写作技巧：\n\n`;

        for (let i = 0; i < references.length; i++) {
            const ref = references[i];
            const platformLabel = this.getPlatformLabel(ref.platform);

            section += `### 参考${i + 1} [${platformLabel}] (${ref.engagement_count}+互动)\n`;

            if (ref.title) {
                section += `标题: ${ref.title}\n`;
            }

            if (ref.content) {
                const preview = ref.content.length > 200
                    ? ref.content.substring(0, 200) + '...'
                    : ref.content;
                section += `内容摘要: ${preview}\n`;
            }

            if (ref.success_factors && ref.success_factors.length > 0) {
                section += `成功因素: ${ref.success_factors.join(', ')}\n`;
            }

            if (ref.key_phrases && ref.key_phrases.length > 0) {
                section += `金句: ${ref.key_phrases.slice(0, 3).join(' | ')}\n`;
            }

            section += '\n';
        }

        return section;
    }

    /**
     * 获取素材类别标签
     */
    private getCategoryLabel(category?: string): string {
        const labels: Record<string, string> = {
            'product_image': '产品图',
            'scene_image': '场景图',
            'testimonial': '客户评价',
            'copy_fragment': '文案',
            'product_doc': '文档',
            'other': '其他',
        };
        return labels[category || 'other'] || '素材';
    }

    /**
     * 获取平台标签
     */
    private getPlatformLabel(platform: string): string {
        const labels: Record<string, string> = {
            'xiaohongshu': '小红书',
            'douyin': '抖音',
            'weibo': '微博',
            'bilibili': 'B站',
            'other': '其他',
        };
        return labels[platform] || platform;
    }
}

// 单例导出
export const enhancedProductInfoBuilder = new EnhancedProductInfoBuilder();
