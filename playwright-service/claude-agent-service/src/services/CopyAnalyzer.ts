/**
 * CopyAnalyzer - 母文案分析服务
 * 
 * 职责：
 * 1. 分析母文案特点（字数、结构、风格）
 * 2. 提取金句
 * 3. 决定处理策略（变体扩展 vs 拆分使用）
 * 
 * @version 1.0.0
 */

// ============ 类型定义 ============

/**
 * 母文案结构分析结果
 */
export interface CopyStructure {
    /** 开头吸引段 */
    hook?: string;
    /** 痛点揭露段 */
    painPoint?: string;
    /** 解决方案段 */
    solution?: string;
    /** 方法论段 */
    method?: string;
    /** 案例故事段 */
    caseStudy?: string;
    /** 行动号召段 */
    callToAction?: string;
}

/**
 * 母文案分析结果
 */
export interface CopyAnalysisResult {
    /** 字数统计 */
    wordCount: number;
    /** 结构类型 */
    structureType: 'short' | 'medium' | 'deep';
    /** 是否有清晰分段 */
    hasClearSections: boolean;
    /** 提取的金句 */
    goldenQuotes: string[];
    /** 核心论点 */
    coreArguments: string[];
    /** 文案结构拆解 */
    structure: CopyStructure;
    /** 处理策略建议 */
    strategy: 'variant' | 'split';
    /** 策略原因 */
    strategyReason: string;
}

/**
 * 拆分结果
 */
export interface CopySplitResult {
    /** 拆分出的独立片段 */
    segments: Array<{
        type: 'hook' | 'pain_point' | 'method' | 'case_study' | 'cta';
        title: string;
        content: string;
        goldenQuote?: string;
        estimatedWords: number;
    }>;
}

/**
 * 变体生成结果
 */
export interface CopyVariantResult {
    /** 生成的变体 */
    variants: Array<{
        type: 'pain_focused' | 'method_focused' | 'story_focused';
        title: string;
        content: string;
        goldenQuote?: string;
    }>;
}

// ============ CopyAnalyzer 实现 ============

export class CopyAnalyzer {

    /**
     * 分析母文案
     */
    async analyze(motherCopy: { title: string; text: string }): Promise<CopyAnalysisResult> {
        console.log('[CopyAnalyzer] Analyzing mother copy...');

        const wordCount = this.countWords(motherCopy.text);
        const structureType = this.determineStructureType(wordCount);
        const goldenQuotes = this.extractGoldenQuotes(motherCopy.text);
        const coreArguments = this.extractCoreArguments(motherCopy.text);
        const structure = this.parseStructure(motherCopy.text);
        const hasClearSections = this.checkClearSections(motherCopy.text);

        // 决定策略
        const { strategy, strategyReason } = this.determineStrategy(
            wordCount,
            structureType,
            hasClearSections
        );

        const result: CopyAnalysisResult = {
            wordCount,
            structureType,
            hasClearSections,
            goldenQuotes,
            coreArguments,
            structure,
            strategy,
            strategyReason,
        };

        console.log('[CopyAnalyzer] Analysis complete:', {
            wordCount,
            structureType,
            strategy,
            goldenQuotesCount: goldenQuotes.length,
        });

        return result;
    }

    /**
     * 拆分母文案（用于深度文案）
     */
    async split(
        motherCopy: { title: string; text: string },
        analysis: CopyAnalysisResult
    ): Promise<CopySplitResult> {
        console.log('[CopyAnalyzer] Splitting deep copy into segments...');

        const segments: CopySplitResult['segments'] = [];
        const { structure, goldenQuotes } = analysis;

        // 拆分痛点段
        if (structure.painPoint && structure.painPoint.length > 100) {
            segments.push({
                type: 'pain_point',
                title: this.generateSegmentTitle(structure.painPoint, 'pain'),
                content: this.refineContent(structure.painPoint),
                goldenQuote: goldenQuotes[0],
                estimatedWords: this.countWords(structure.painPoint),
            });
        }

        // 拆分方法论段
        if (structure.method && structure.method.length > 100) {
            segments.push({
                type: 'method',
                title: this.generateSegmentTitle(structure.method, 'method'),
                content: this.refineContent(structure.method),
                goldenQuote: goldenQuotes[1],
                estimatedWords: this.countWords(structure.method),
            });
        }

        // 拆分案例故事段
        if (structure.caseStudy && structure.caseStudy.length > 100) {
            segments.push({
                type: 'case_study',
                title: this.generateSegmentTitle(structure.caseStudy, 'story'),
                content: this.refineContent(structure.caseStudy),
                goldenQuote: goldenQuotes[2],
                estimatedWords: this.countWords(structure.caseStudy),
            });
        }

        // 拆分行动召唤段
        if (structure.callToAction && structure.callToAction.length > 50) {
            segments.push({
                type: 'cta',
                title: this.generateSegmentTitle(structure.callToAction, 'cta'),
                content: this.refineContent(structure.callToAction),
                estimatedWords: this.countWords(structure.callToAction),
            });
        }

        console.log('[CopyAnalyzer] Split into', segments.length, 'segments');

        return { segments };
    }

    /**
     * 生成变体（用于短/中等文案）
     */
    async generateVariants(
        motherCopy: { title: string; text: string },
        analysis: CopyAnalysisResult,
        variantType?: 'pain_focused' | 'method_focused' | 'story_focused'
    ): Promise<CopyVariantResult> {
        console.log('[CopyAnalyzer] Generating variants...');

        const variants: CopyVariantResult['variants'] = [];
        const { structure, goldenQuotes, coreArguments } = analysis;

        // 痛点角度变体
        if (!variantType || variantType === 'pain_focused') {
            if (structure.painPoint || structure.hook) {
                const sourceText = structure.painPoint || structure.hook || '';
                variants.push({
                    type: 'pain_focused',
                    title: this.generateVariantTitle(sourceText, 'pain'),
                    content: this.expandWithDensity(sourceText, coreArguments[0]),
                    goldenQuote: goldenQuotes[0],
                });
            }
        }

        // 方法角度变体
        if (!variantType || variantType === 'method_focused') {
            if (structure.method || structure.solution) {
                const sourceText = structure.method || structure.solution || '';
                variants.push({
                    type: 'method_focused',
                    title: this.generateVariantTitle(sourceText, 'method'),
                    content: this.expandWithDensity(sourceText, coreArguments[1]),
                    goldenQuote: goldenQuotes[1],
                });
            }
        }

        // 故事角度变体
        if (!variantType || variantType === 'story_focused') {
            if (structure.caseStudy) {
                variants.push({
                    type: 'story_focused',
                    title: this.generateVariantTitle(structure.caseStudy, 'story'),
                    content: this.expandWithDensity(structure.caseStudy, coreArguments[0]),
                    goldenQuote: goldenQuotes[2] || goldenQuotes[0],
                });
            }
        }

        console.log('[CopyAnalyzer] Generated', variants.length, 'variants');

        return { variants };
    }

    // ============ 私有方法 ============

    /**
     * 统计字数
     */
    private countWords(text: string): number {
        // 移除空白字符后统计
        return text.replace(/\s/g, '').length;
    }

    /**
     * 判断结构类型
     */
    private determineStructureType(wordCount: number): 'short' | 'medium' | 'deep' {
        if (wordCount < 500) return 'short';
        if (wordCount < 1500) return 'medium';
        return 'deep';
    }

    /**
     * 提取金句
     * 
     * 金句特征：
     * - 引号包裹的内容
     * - 带有强调标记的内容
     * - 独立成段的短句
     * - 包含对比的句子
     */
    private extractGoldenQuotes(text: string): string[] {
        const quotes: string[] = [];

        // 1. 提取引号内容
        const quoteMatches = text.match(/[""「」『』]([^""「」『』]{10,50})[""「」『』]/g);
        if (quoteMatches) {
            quotes.push(...quoteMatches.map(q => q.replace(/[""「」『』]/g, '')));
        }

        // 2. 提取带有强调标记的内容
        const boldMatches = text.match(/\*\*([^*]{10,80})\*\*/g);
        if (boldMatches) {
            quotes.push(...boldMatches.map(b => b.replace(/\*\*/g, '')));
        }

        // 3. 提取包含对比的短句（如"不是...而是..."）
        const contrastMatches = text.match(/不是[^，。]{5,20}[，,]而是[^。]{5,30}/g);
        if (contrastMatches) {
            quotes.push(...contrastMatches);
        }

        // 4. 提取破折号后的独立句
        const dashMatches = text.match(/——[^。\n]{10,50}/g);
        if (dashMatches) {
            quotes.push(...dashMatches.map(d => d.replace('——', '')));
        }

        // 去重并限制数量
        const uniqueQuotes = [...new Set(quotes)];
        return uniqueQuotes.slice(0, 5);
    }

    /**
     * 提取核心论点
     */
    private extractCoreArguments(text: string): string[] {
        const arguments_: string[] = [];

        // 提取"核心是..."、"关键在于..."等模式
        const patterns = [
            /核心是[^，。]{5,30}/g,
            /关键在于[^，。]{5,30}/g,
            /本质是[^，。]{5,30}/g,
            /问题在于[^，。]{5,30}/g,
            /秘诀是[^，。]{5,30}/g,
        ];

        for (const pattern of patterns) {
            const matches = text.match(pattern);
            if (matches) {
                arguments_.push(...matches);
            }
        }

        return [...new Set(arguments_)].slice(0, 3);
    }

    /**
     * 解析文案结构
     */
    private parseStructure(text: string): CopyStructure {
        const structure: CopyStructure = {};

        // 按段落分割
        const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 20);

        if (paragraphs.length === 0) {
            return structure;
        }

        // 第一段通常是开头
        structure.hook = paragraphs[0];

        // 遍历段落，根据关键词判断类型
        for (let i = 1; i < paragraphs.length; i++) {
            const p = paragraphs[i];

            // 痛点段落
            if (this.containsPainKeywords(p) && !structure.painPoint) {
                structure.painPoint = p;
                continue;
            }

            // 方法论段落
            if (this.containsMethodKeywords(p) && !structure.method) {
                structure.method = p;
                continue;
            }

            // 案例故事段落
            if (this.containsStoryKeywords(p) && !structure.caseStudy) {
                structure.caseStudy = p;
                continue;
            }

            // 解决方案段落
            if (this.containsSolutionKeywords(p) && !structure.solution) {
                structure.solution = p;
                continue;
            }
        }

        // 最后一段通常是行动号召
        if (paragraphs.length > 1) {
            const lastPara = paragraphs[paragraphs.length - 1];
            if (this.containsCTAKeywords(lastPara)) {
                structure.callToAction = lastPara;
            }
        }

        return structure;
    }

    /**
     * 检查是否有清晰分段
     */
    private checkClearSections(text: string): boolean {
        // 检查分段数量和标记
        const hasParagraphs = (text.match(/\n\n+/g) || []).length >= 3;
        const hasHeaders = /^#{1,3}\s/m.test(text) || /^\*\*[^*]+\*\*$/m.test(text);
        const hasNumbering = /^[1-9][.、]/m.test(text);

        return hasParagraphs || hasHeaders || hasNumbering;
    }

    /**
     * 决定处理策略
     */
    private determineStrategy(
        wordCount: number,
        structureType: 'short' | 'medium' | 'deep',
        hasClearSections: boolean
    ): { strategy: 'variant' | 'split'; strategyReason: string } {
        // 深度文案（≥2000字）且有清晰分段 → 拆分
        if (structureType === 'deep' && hasClearSections) {
            return {
                strategy: 'split',
                strategyReason: `文案${wordCount}字，结构清晰，适合拆分为独立片段`,
            };
        }

        // 深度文案但无清晰分段 → 仍然拆分，但需要AI辅助
        if (structureType === 'deep') {
            return {
                strategy: 'split',
                strategyReason: `文案${wordCount}字，建议拆分使用，每段独立成篇`,
            };
        }

        // 短/中等文案 → 变体扩展
        return {
            strategy: 'variant',
            strategyReason: `文案${wordCount}字，适合选取角度做变体扩展`,
        };
    }

    /**
     * 生成片段标题
     */
    private generateSegmentTitle(content: string, type: string): string {
        // 提取第一句或前30个字
        const firstSentence = content.match(/^[^。！？]+[。！？]/);
        if (firstSentence && firstSentence[0].length <= 30) {
            return firstSentence[0].replace(/[。！？]$/, '');
        }
        return content.substring(0, 25) + '...';
    }

    /**
     * 生成变体标题
     */
    private generateVariantTitle(content: string, type: string): string {
        return this.generateSegmentTitle(content, type);
    }

    /**
     * 精炼内容（确保信息密度）
     */
    private refineContent(content: string): string {
        // 移除冗余的连接词
        let refined = content
            .replace(/其实[，,]?/g, '')
            .replace(/但是[，,]?/g, '但')
            .replace(/然后[，,]?/g, '')
            .replace(/所以说[，,]?/g, '所以')
            .replace(/我觉得[，,]?/g, '')
            .replace(/就是说[，,]?/g, '');

        return refined.trim();
    }

    /**
     * 扩展内容（保持信息密度）
     */
    private expandWithDensity(sourceText: string, coreArgument?: string): string {
        // 保持原文核心，添加具体化
        let expanded = this.refineContent(sourceText);

        // 如果有核心论点，确保包含
        if (coreArgument && !expanded.includes(coreArgument)) {
            expanded = coreArgument + '\n\n' + expanded;
        }

        return expanded;
    }

    // ============ 关键词检测 ============

    private containsPainKeywords(text: string): boolean {
        const keywords = ['问题', '痛点', '困扰', '难题', '焦虑', '担心', '害怕', '失败', '错误'];
        return keywords.some(k => text.includes(k));
    }

    private containsMethodKeywords(text: string): boolean {
        const keywords = ['方法', '步骤', '技巧', '秘诀', '诀窍', '第一步', '第二步', '首先', '其次'];
        return keywords.some(k => text.includes(k));
    }

    private containsStoryKeywords(text: string): boolean {
        const keywords = ['案例', '故事', '经历', '曾经', '之前', '后来', '证明', '学员', '客户'];
        return keywords.some(k => text.includes(k));
    }

    private containsSolutionKeywords(text: string): boolean {
        const keywords = ['解决', '方案', '办法', '做法', '策略', '我们的'];
        return keywords.some(k => text.includes(k));
    }

    private containsCTAKeywords(text: string): boolean {
        const keywords = ['私信', '咨询', '联系', '点击', '关注', '评论', '体验', '预约'];
        return keywords.some(k => text.includes(k));
    }
}

// 单例导出
export const copyAnalyzer = new CopyAnalyzer();
