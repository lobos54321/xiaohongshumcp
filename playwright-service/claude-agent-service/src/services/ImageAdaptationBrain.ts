/**
 * ImageAdaptationBrain - 图片适配大脑
 * 
 * 职责：
 * 1. 评估用户图片质量（产品信息70%、场景匹配20%、清晰度10%）
 * 2. 决定使用现有图片还是生成新图
 * 3. 生成 Gemini 图片生成请求
 * 
 * @version 1.0.0
 */

// ============ 类型定义 ============

/**
 * 图片分析结果（来自 AI 预分析）
 */
export interface ImageAnalysis {
    /** 图片 URL */
    imageUrl: string;
    /** AI 生成的描述 */
    description: string;
    /** 图片中的主要元素 */
    mainElements: string[];
    /** 是否包含产品 */
    hasProduct: boolean;
    /** 是否包含人物 */
    hasPerson: boolean;
    /** 场景类型 */
    sceneType: 'product' | 'lifestyle' | 'studio' | 'outdoor' | 'text' | 'other';
}

/**
 * 图片评估结果
 */
export interface ImageEvaluation {
    /** 图片 URL */
    imageUrl: string;
    /** 总评分 (0-100) */
    totalScore: number;
    /** 各维度评分 */
    scores: {
        productInfoScore: number;    // 产品/服务核心信息可见 (权重70%)
        sceneMatchScore: number;     // 场景与文案匹配度 (权重20%)
        clarityScore: number;        // 清晰度 (权重10%)
    };
    /** 是否可用 */
    usable: boolean;
    /** 评估原因 */
    reason: string;
}

/**
 * 大脑决策结果
 */
export interface BrainDecision {
    /** 可直接使用的图片 */
    usableImages: ImageEvaluation[];
    /** 需要替换的图片 */
    imagesToReplace: ImageEvaluation[];
    /** 需要 Gemini 生成的图片请求 */
    generationRequests: GenerationRequest[];
    /** 决策摘要 */
    summary: string;
}

/**
 * 图片生成请求
 */
export interface GenerationRequest {
    /** 生成类型 */
    type: 'product_showcase' | 'usage_scene' | 'benefit_display' | 'replacement';
    /** 生成描述（传给 Gemini） */
    prompt: string;
    /** 参考图片 URL（如果有） */
    referenceImageUrl?: string;
    /** 原因 */
    reason: string;
}

// ============ ImageAdaptationBrain 实现 ============

export class ImageAdaptationBrain {

    // 评分阈值
    private readonly USABLE_THRESHOLD = 60;

    // 权重配置
    private readonly WEIGHTS = {
        productInfo: 0.70,    // 产品/服务核心信息可见
        sceneMatch: 0.20,     // 场景与文案匹配度
        clarity: 0.10,        // 清晰度
    };

    /**
     * 分析并决策
     */
    async analyze(params: {
        /** 用户上传的图片及其 AI 分析 */
        images: ImageAnalysis[];
        /** 文案标题 */
        copyTitle: string;
        /** 文案正文 */
        copyText: string;
        /** 产品信息 */
        productInfo: string;
    }): Promise<BrainDecision> {
        console.log('[ImageAdaptationBrain] Analyzing', params.images.length, 'images...');

        const { images, copyTitle, copyText, productInfo } = params;

        // 处理无图片场景
        if (!images || images.length === 0) {
            console.log('[ImageAdaptationBrain] No images provided, generating all');
            return this.handleNoImages(copyText, productInfo);
        }

        // 评估每张图片
        const evaluations: ImageEvaluation[] = [];
        for (const image of images) {
            const evaluation = this.evaluateImage(image, copyText, productInfo);
            evaluations.push(evaluation);
        }

        // 分类
        const usableImages = evaluations.filter(e => e.usable);
        const imagesToReplace = evaluations.filter(e => !e.usable);

        // 生成替换请求
        const generationRequests: GenerationRequest[] = [];

        for (const img of imagesToReplace) {
            generationRequests.push({
                type: 'replacement',
                prompt: this.generateReplacementPrompt(img, productInfo, copyText),
                referenceImageUrl: img.imageUrl,
                reason: img.reason,
            });
        }

        // 检查是否缺少必要的图片类型
        const missingTypes = this.checkMissingImageTypes(usableImages, copyText);
        for (const missing of missingTypes) {
            generationRequests.push(missing);
        }

        const decision: BrainDecision = {
            usableImages,
            imagesToReplace,
            generationRequests,
            summary: this.generateSummary(usableImages, imagesToReplace, generationRequests),
        };

        console.log('[ImageAdaptationBrain] Decision:', {
            usable: usableImages.length,
            toReplace: imagesToReplace.length,
            toGenerate: generationRequests.length,
        });

        return decision;
    }

    /**
     * 评估单张图片
     */
    private evaluateImage(
        image: ImageAnalysis,
        copyText: string,
        productInfo: string
    ): ImageEvaluation {
        // 1. 产品/服务核心信息可见 (70%)
        const productInfoScore = this.scoreProductInfo(image, productInfo);

        // 2. 场景与文案匹配度 (20%)
        const sceneMatchScore = this.scoreSceneMatch(image, copyText);

        // 3. 清晰度 (10%) - 基于描述判断
        const clarityScore = this.scoreClarityFromDescription(image.description);

        // 计算总分
        const totalScore = Math.round(
            productInfoScore * this.WEIGHTS.productInfo +
            sceneMatchScore * this.WEIGHTS.sceneMatch +
            clarityScore * this.WEIGHTS.clarity
        );

        const usable = totalScore >= this.USABLE_THRESHOLD;
        const reason = this.generateEvaluationReason(
            { productInfoScore, sceneMatchScore, clarityScore },
            totalScore,
            usable
        );

        return {
            imageUrl: image.imageUrl,
            totalScore,
            scores: {
                productInfoScore,
                sceneMatchScore,
                clarityScore,
            },
            usable,
            reason,
        };
    }

    /**
     * 评估产品信息可见性 (0-100)
     */
    private scoreProductInfo(image: ImageAnalysis, productInfo: string): number {
        let score = 0;

        // 是否有产品
        if (image.hasProduct) {
            score += 40;
        }

        // 描述中是否包含产品关键词
        const productKeywords = this.extractKeywords(productInfo);
        const matchedKeywords = productKeywords.filter(kw =>
            image.description.toLowerCase().includes(kw.toLowerCase()) ||
            image.mainElements.some(el => el.toLowerCase().includes(kw.toLowerCase()))
        );

        score += Math.min(matchedKeywords.length * 15, 45);

        // 场景类型加分
        if (image.sceneType === 'product' || image.sceneType === 'studio') {
            score += 15;
        }

        return Math.min(score, 100);
    }

    /**
     * 评估场景匹配度 (0-100)
     */
    private scoreSceneMatch(image: ImageAnalysis, copyText: string): number {
        let score = 50; // 基础分

        // 提取文案中的场景关键词
        const sceneKeywords = this.extractSceneKeywords(copyText);

        // 检查描述中是否匹配
        const matchedScenes = sceneKeywords.filter(kw =>
            image.description.includes(kw)
        );

        score += matchedScenes.length * 15;

        // 人物匹配
        if (copyText.includes('孩子') || copyText.includes('学生') || copyText.includes('学员')) {
            if (image.hasPerson) score += 20;
        }

        // 场景类型匹配
        if (copyText.includes('户外') && image.sceneType === 'outdoor') {
            score += 15;
        }
        if (copyText.includes('教室') || copyText.includes('课堂')) {
            if (image.sceneType === 'studio' || image.sceneType === 'lifestyle') {
                score += 15;
            }
        }

        return Math.min(score, 100);
    }

    /**
     * 从描述评估清晰度 (0-100)
     */
    private scoreClarityFromDescription(description: string): number {
        let score = 70; // 默认假设清晰

        // 负面关键词降分
        const negativeKeywords = ['模糊', '不清晰', '低分辨率', 'blurry', 'unclear', '黑暗', '曝光不足'];
        for (const kw of negativeKeywords) {
            if (description.toLowerCase().includes(kw)) {
                score -= 25;
            }
        }

        // 正面关键词加分
        const positiveKeywords = ['清晰', '高清', '细节', 'sharp', 'clear', '光线好'];
        for (const kw of positiveKeywords) {
            if (description.toLowerCase().includes(kw)) {
                score += 10;
            }
        }

        return Math.max(0, Math.min(score, 100));
    }

    /**
     * 处理无图片场景
     */
    private handleNoImages(copyText: string, productInfo: string): BrainDecision {
        const generationRequests: GenerationRequest[] = [];

        // 必须生成产品主图
        generationRequests.push({
            type: 'product_showcase',
            prompt: this.generateProductShowcasePrompt(productInfo, copyText),
            reason: '用户未提供图片，需要生成产品主图',
        });

        // 生成使用场景图
        generationRequests.push({
            type: 'usage_scene',
            prompt: this.generateUsageScenePrompt(productInfo, copyText),
            reason: '用户未提供图片，需要生成使用场景图',
        });

        // 生成效果展示图
        if (copyText.includes('效果') || copyText.includes('结果') || copyText.includes('改变')) {
            generationRequests.push({
                type: 'benefit_display',
                prompt: this.generateBenefitDisplayPrompt(productInfo, copyText),
                reason: '文案涉及效果展示，需要生成效果图',
            });
        }

        return {
            usableImages: [],
            imagesToReplace: [],
            generationRequests,
            summary: `用户未提供任何图片，需要通过 Gemini 生成 ${generationRequests.length} 张图片`,
        };
    }

    /**
     * 检查缺少的图片类型
     */
    private checkMissingImageTypes(
        usableImages: ImageEvaluation[],
        copyText: string
    ): GenerationRequest[] {
        const requests: GenerationRequest[] = [];

        // 如果没有产品图
        const hasProductImage = usableImages.some(img =>
            img.scores.productInfoScore >= 60
        );

        if (!hasProductImage && usableImages.length > 0) {
            requests.push({
                type: 'product_showcase',
                prompt: '生成一张产品特写图，突出产品核心特点',
                reason: '现有图片缺少产品核心展示',
            });
        }

        return requests;
    }

    // ============ Prompt 生成 ============

    private generateReplacementPrompt(
        image: ImageEvaluation,
        productInfo: string,
        copyText: string
    ): string {
        return `基于参考图片的构图和风格，生成一张更清晰、更能展示产品核心信息的图片。
产品信息：${productInfo.substring(0, 200)}
要求：真实场景、产品/人物合理出现、高清晰度、适合小红书发布`;
    }

    private generateProductShowcasePrompt(productInfo: string, copyText: string): string {
        return `生成一张产品展示图。
产品：${productInfo.substring(0, 200)}
要求：
1. 真实感强，不要卡通风格
2. 产品核心卖点清晰可见
3. 简洁的背景，突出产品
4. 适合小红书图文笔记封面`;
    }

    private generateUsageScenePrompt(productInfo: string, copyText: string): string {
        // 从文案中提取场景关键词
        const sceneHints = this.extractSceneKeywords(copyText).join('、');

        return `生成一张产品使用场景图。
产品：${productInfo.substring(0, 150)}
场景参考：${sceneHints || '日常使用场景'}
要求：
1. 真实自然的使用场景
2. 人物（如有）表情自然
3. 光线明亮，画面清晰
4. 体现产品价值`;
    }

    private generateBenefitDisplayPrompt(productInfo: string, copyText: string): string {
        return `生成一张产品效果/收益展示图。
产品：${productInfo.substring(0, 150)}
要求：
1. 展示使用产品后的积极变化
2. 真实可信，不夸张
3. 视觉对比明显（如适用）
4. 适合作为证明图使用`;
    }

    // ============ 工具方法 ============

    private extractKeywords(text: string): string[] {
        // 简单分词
        const words = text
            .replace(/[，。、！？\n\r]/g, ' ')
            .split(' ')
            .filter(w => w.length >= 2 && w.length <= 10);

        return [...new Set(words)].slice(0, 10);
    }

    private extractSceneKeywords(text: string): string[] {
        const scenePatterns = [
            '户外', '室内', '教室', '课堂', '田野', '街角', '河畔',
            '家里', '办公室', '工作', '画画', '创作', '学习'
        ];

        return scenePatterns.filter(p => text.includes(p));
    }

    private generateEvaluationReason(
        scores: { productInfoScore: number; sceneMatchScore: number; clarityScore: number },
        totalScore: number,
        usable: boolean
    ): string {
        if (usable) {
            if (totalScore >= 80) {
                return '高质量图片，产品信息清晰，与文案高度匹配';
            }
            return '图片可用，产品信息可见';
        }

        const issues: string[] = [];
        if (scores.productInfoScore < 50) {
            issues.push('产品核心信息不够清晰');
        }
        if (scores.sceneMatchScore < 50) {
            issues.push('场景与文案匹配度低');
        }
        if (scores.clarityScore < 50) {
            issues.push('图片清晰度不足');
        }

        return issues.join('；') || '综合评分较低';
    }

    private generateSummary(
        usable: ImageEvaluation[],
        toReplace: ImageEvaluation[],
        toGenerate: GenerationRequest[]
    ): string {
        const parts: string[] = [];

        if (usable.length > 0) {
            parts.push(`${usable.length}张可直接使用`);
        }
        if (toReplace.length > 0) {
            parts.push(`${toReplace.length}张需替换`);
        }
        if (toGenerate.length > 0) {
            parts.push(`需生成${toGenerate.length}张新图`);
        }

        return parts.join('，');
    }
}

// 单例导出
export const imageAdaptationBrain = new ImageAdaptationBrain();
