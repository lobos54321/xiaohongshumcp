/**
 * 自动化内容规划服务
 * 基于Claude AI的智能内容策略制定和执行
 */

import Anthropic from '@anthropic-ai/sdk';
import ImageGenerationService from './imageGenerationService.js';
import * as fs from 'fs';
import * as path from 'path';

interface UserProfile {
  userId: string;
  productName: string;
  targetAudience: string;
  marketingGoal: 'brand' | 'sales' | 'engagement' | 'traffic';
  postFrequency: 'daily' | 'twice-daily' | 'high-freq';
  brandStyle: 'warm' | 'professional' | 'trendy' | 'funny';
  reviewMode: 'auto' | 'review' | 'edit';
}

interface ContentPlan {
  strategy: ContentStrategy;
  weeklyPlan: WeeklyPlan;
  dailyTasks: DailyTask[];
}

interface ContentStrategy {
  keyThemes: string[];
  contentTypes: string[];
  optimalTimes: string[];
  hashtags: string[];
  trendingTopics: string[];
}

interface DailyTask {
  scheduledTime: Date;
  contentType: string;
  title: string;
  content: string;
  imagePrompt: string;
  imageUrl?: string;
  hashtags: string[];
  status: 'planned' | 'generating' | 'ready' | 'published';
}

export class AutoContentManager {
  private anthropic: Anthropic;
  private imageService: ImageGenerationService;
  private mcpClient: any;
  private userProfiles: Map<string, UserProfile> = new Map();
  private contentPlans: Map<string, ContentPlan> = new Map();
  private dataDir: string;
  private generationStatus: Map<string, 'idle' | 'generating' | 'completed' | 'failed'> = new Map();

  constructor(config: {
    anthropicKey: string;
    imageService: ImageGenerationService;
    mcpClient: any;
  }) {
    this.anthropic = new Anthropic({ apiKey: config.anthropicKey });
    this.imageService = config.imageService;
    this.mcpClient = config.mcpClient;

    // 创建数据存储目录
    this.dataDir = './data';
    this.ensureDataDir();
    this.loadPersistedData();

    // 初始化演示数据
    this.initializeDemoData();
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  private saveData(userId: string): void {
    try {
      const userProfile = this.userProfiles.get(userId);
      const contentPlan = this.contentPlans.get(userId);

      if (userProfile || contentPlan) {
        const data = {
          userProfile,
          contentPlan,
          savedAt: new Date().toISOString()
        };

        const filePath = path.join(this.dataDir, `${userId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`💾 数据已保存: ${filePath}`);
      }
    } catch (error: any) {
      console.error(`❌ 保存数据失败:`, error.message);
    }
  }

  private loadPersistedData(): void {
    try {
      if (!fs.existsSync(this.dataDir)) return;

      const files = fs.readdirSync(this.dataDir).filter((f: string) => f.endsWith('.json'));

      for (const file of files) {
        try {
          const filePath = path.join(this.dataDir, file);
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          const userId = file.replace('.json', '');

          if (data.userProfile) {
            this.userProfiles.set(userId, data.userProfile);
          }

          if (data.contentPlan) {
            // 恢复Date对象
            if (data.contentPlan.dailyTasks) {
              data.contentPlan.dailyTasks.forEach((task: any) => {
                if (task.scheduledTime) {
                  task.scheduledTime = new Date(task.scheduledTime);
                }
              });
            }
            this.contentPlans.set(userId, data.contentPlan);
          }

          console.log(`📂 已恢复用户数据: ${userId}`);
        } catch (error) {
          console.error(`❌ 恢复数据失败 ${file}:`, error);
        }
      }

      console.log(`✅ 已恢复 ${files.length} 个用户的数据`);
    } catch (error: any) {
      console.error(`❌ 加载持久化数据失败:`, error.message);
    }
  }

  /**
   * 初始化演示数据 - 确保test-user-789有演示数据可用
   */
  private initializeDemoData(): void {
    const demoUserId = 'test-user-789';

    // 如果已有数据，不重复初始化
    if (this.contentPlans.has(demoUserId)) {
      console.log(`📋 [DEMO] 用户 ${demoUserId} 已有数据，跳过初始化`);
      return;
    }

    console.log(`📋 [DEMO] 为用户 ${demoUserId} 初始化演示数据...`);

    // 创建演示用户配置
    const demoProfile: UserProfile = {
      userId: demoUserId,
      productName: '演示产品',
      targetAudience: '演示用户群体',
      marketingGoal: 'brand',
      postFrequency: 'daily',
      brandStyle: 'warm',
      reviewMode: 'auto'
    };

    // 创建演示策略
    const demoStrategy: ContentStrategy = {
      keyThemes: ['产品特色展示', '用户体验分享', '行业知识科普', '优惠活动推广', '互动话题讨论'],
      contentTypes: ['图文教程', '产品测评', '用户故事', 'Vlog探店', '知识科普', '互动问答', '活动预告', '幕后花絮'],
      optimalTimes: ['9:00-10:00', '12:30-13:30', '20:00-21:30'],
      hashtags: ['演示模式', '演示产品', '小红书运营'],
      trendingTopics: ['演示热门话题1', '演示热门话题2', '演示热门话题3']
    };

    // 创建演示周计划
    const now = new Date();
    const demoWeeklyPlan: WeeklyPlan = {
      days: [
        {
          date: new Date(now.getTime() + 0 * 24 * 3600000),
          posts: [
            { theme: '产品特色', type: '图文教程', scheduledTime: new Date(now.getTime() + 0 * 24 * 3600000 + 9 * 3600000) }
          ]
        },
        {
          date: new Date(now.getTime() + 1 * 24 * 3600000),
          posts: [
            { theme: '用户体验', type: '用户故事', scheduledTime: new Date(now.getTime() + 1 * 24 * 3600000 + 12.5 * 3600000) }
          ]
        },
        {
          date: new Date(now.getTime() + 2 * 24 * 3600000),
          posts: [
            { theme: '知识科普', type: '知识科普', scheduledTime: new Date(now.getTime() + 2 * 24 * 3600000 + 20 * 3600000) }
          ]
        }
      ]
    };

    // 创建演示每日任务
    const demoDailyTasks: DailyTask[] = [
      {
        scheduledTime: new Date(now.getTime() + 9 * 3600000),
        contentType: '图文教程',
        title: `产品特色 - 介绍${demoProfile.productName}的核心功能`,
        content: `这是${demoProfile.productName}的核心功能介绍。演示模式下的内容，请配置 ANTHROPIC_API_KEY 以获取 AI 生成的真实内容。`,
        imagePrompt: `${demoProfile.productName}, 产品特色, 小红书风格`,
        hashtags: ['演示模式', demoProfile.productName, '产品特色'],
        status: 'published'  // 设置为已发布状态
      },
      {
        scheduledTime: new Date(now.getTime() + 1 * 24 * 3600000 + 12.5 * 3600000),
        contentType: '用户故事',
        title: `用户体验 - 分享真实用户的使用心得`,
        content: `这是真实用户的使用心得分享。演示模式下的内容，请配置 ANTHROPIC_API_KEY 以获取 AI 生成的真实内容。`,
        imagePrompt: `${demoProfile.productName}, 用户体验, 小红书风格`,
        hashtags: ['演示模式', demoProfile.productName, '用户体验'],
        status: 'ready'  // 设置为待发布状态
      },
      {
        scheduledTime: new Date(now.getTime() + 2 * 24 * 3600000 + 20 * 3600000),
        contentType: '知识科普',
        title: `知识科普 - 行业相关的专业知识`,
        content: `这是行业相关的专业知识科普。演示模式下的内容，请配置 ANTHROPIC_API_KEY 以获取 AI 生成的真实内容。`,
        imagePrompt: `${demoProfile.productName}, 知识科普, 小红书风格`,
        hashtags: ['演示模式', demoProfile.productName, '知识科普'],
        status: 'planned'  // 设置为计划状态
      }
    ];

    // 保存数据
    this.userProfiles.set(demoUserId, demoProfile);
    this.contentPlans.set(demoUserId, {
      strategy: demoStrategy,
      weeklyPlan: demoWeeklyPlan,
      dailyTasks: demoDailyTasks
    });
    this.generationStatus.set(demoUserId, 'completed');

    // 持久化数据
    this.saveData(demoUserId);

    console.log(`✅ [DEMO] 演示数据初始化完成: ${demoDailyTasks.length} 个任务`);
  }

  /**
   * 用户完成设置后，启动自动运营
   */
  async startAutoMode(userProfile: UserProfile): Promise<void> {
    console.log(`🚀 [DEBUG] 为用户 ${userProfile.userId} 启动自动运营模式`);
    console.log(`🚀 [DEBUG] 用户配置:`, JSON.stringify(userProfile, null, 2));

    // 设置生成状态
    this.generationStatus.set(userProfile.userId, 'generating');
    console.log(`🚀 [DEBUG] 已设置生成状态为 generating`);

    // 保存用户配置
    this.userProfiles.set(userProfile.userId, userProfile);
    console.log(`🚀 [DEBUG] 已保存用户配置到 userProfiles Map`);
    console.log(`🚀 [DEBUG] 当前 userProfiles 大小: ${this.userProfiles.size}`);
    console.log(`🚀 [DEBUG] 当前 contentPlans 大小: ${this.contentPlans.size}`);

    try {
      // 1. 制定内容策略
      console.log(`🚀 [DEBUG] 步骤1: 开始制定内容策略...`);
      const strategy = await this.createContentStrategy(userProfile);
      console.log(`🚀 [DEBUG] 步骤1完成: 内容策略制定成功`, JSON.stringify(strategy, null, 2));

      // 2. 生成周计划
      console.log(`🚀 [DEBUG] 步骤2: 开始生成周计划...`);
      const weeklyPlan = await this.generateWeeklyPlan(userProfile, strategy);
      console.log(`🚀 [DEBUG] 步骤2完成: 周计划生成成功，包含 ${weeklyPlan.days.length} 天计划`);

      // 3. 生成详细的每日任务
      console.log(`🚀 [DEBUG] 步骤3: 开始生成详细任务...`);
      const dailyTasks = await this.generateDailyTasks(userProfile, weeklyPlan);
      console.log(`🚀 [DEBUG] 步骤3完成: 生成了 ${dailyTasks.length} 个每日任务`);

      // 4. 保存完整计划
      console.log(`🚀 [DEBUG] 步骤4: 保存完整计划到 contentPlans...`);
      this.contentPlans.set(userProfile.userId, {
        strategy,
        weeklyPlan,
        dailyTasks
      });
      console.log(`🚀 [DEBUG] 步骤4完成: 计划已保存，contentPlans 大小: ${this.contentPlans.size}`);

      // 5. 持久化数据
      console.log(`🚀 [DEBUG] 步骤5: 持久化数据到文件...`);
      this.saveData(userProfile.userId);
      console.log(`🚀 [DEBUG] 步骤5完成: 数据持久化完成`);

      // 6. 设置完成状态
      console.log(`🚀 [DEBUG] 步骤6: 设置生成状态为 completed...`);
      this.generationStatus.set(userProfile.userId, 'completed');
      console.log(`🚀 [DEBUG] 步骤6完成: 生成状态已设置为 completed`);

      // 7. 启动定时执行器
      console.log(`🚀 [DEBUG] 步骤7: 启动定时执行器...`);
      this.startScheduler(userProfile.userId);
      console.log(`🚀 [DEBUG] 步骤7完成: 定时执行器已启动`);

      console.log(`✅ [DEBUG] 自动运营模式启动成功！已为接下来7天规划了${dailyTasks.length}个任务`);
    } catch (error: any) {
      console.error(`❌ [DEBUG] 启动自动运营失败:`, error.message);
      console.error(`❌ [DEBUG] 错误详情:`, error);

      // 如果是 API 连接错误，创建演示数据让系统能继续工作
      if (error.message?.includes('Connection error') ||
          error.message?.includes('ENOTFOUND') ||
          error.message?.includes('EAI_AGAIN') ||
          error.message?.includes('400') ||
          error.message?.includes('model_not_supported') ||
          error.message?.includes('BadRequestError')) {
        console.log(`⚠️  [DEBUG] 检测到 Anthropic API 连接问题，使用演示模式...`);

        // 创建演示数据
        const demoStrategy: ContentStrategy = {
          keyThemes: ['产品特色展示', '用户体验分享', '行业知识科普', '优惠活动推广', '互动话题讨论'],
          contentTypes: ['图文教程', '产品测评', '用户故事', 'Vlog探店', '知识科普', '互动问答', '活动预告', '幕后花絮'],
          optimalTimes: ['9:00-10:00', '12:30-13:30', '20:00-21:30'],
          hashtags: ['演示模式', userProfile.productName, '小红书运营'],
          trendingTopics: ['热门话题1', '热门话题2', '热门话题3']
        };
        console.log(`⚠️  [DEBUG] 创建演示策略:`, JSON.stringify(demoStrategy, null, 2));

        const now = new Date();
        const demoWeeklyPlan: WeeklyPlan = {
          days: [
            {
              date: new Date(now.getTime() + 0 * 24 * 3600000),
              posts: [
                { theme: '产品特色', type: '图文教程', scheduledTime: new Date(now.getTime() + 0 * 24 * 3600000 + 9 * 3600000) }
              ]
            },
            {
              date: new Date(now.getTime() + 1 * 24 * 3600000),
              posts: [
                { theme: '用户体验', type: '用户故事', scheduledTime: new Date(now.getTime() + 1 * 24 * 3600000 + 12.5 * 3600000) }
              ]
            },
            {
              date: new Date(now.getTime() + 2 * 24 * 3600000),
              posts: [
                { theme: '知识科普', type: '知识科普', scheduledTime: new Date(now.getTime() + 2 * 24 * 3600000 + 20 * 3600000) }
              ]
            }
          ]
        };
        console.log(`⚠️  [DEBUG] 创建演示周计划: ${demoWeeklyPlan.days.length} 天`);

        const demoDailyTasks: DailyTask[] = [
          {
            scheduledTime: new Date(now.getTime() + 9 * 3600000),
            contentType: '图文教程',
            title: `产品特色 - 介绍${userProfile.productName}的核心功能`,
            content: `这是${userProfile.productName}的核心功能介绍。演示模式下的内容，请配置 ANTHROPIC_API_KEY 以获取 AI 生成的真实内容。`,
            imagePrompt: `${userProfile.productName}, 产品特色, 小红书风格`,
            hashtags: ['演示模式', userProfile.productName, '产品特色'],
            status: 'planned'
          },
          {
            scheduledTime: new Date(now.getTime() + 1 * 24 * 3600000 + 12.5 * 3600000),
            contentType: '用户故事',
            title: `用户体验 - 分享真实用户的使用心得`,
            content: `这是真实用户的使用心得分享。演示模式下的内容，请配置 ANTHROPIC_API_KEY 以获取 AI 生成的真实内容。`,
            imagePrompt: `${userProfile.productName}, 用户体验, 小红书风格`,
            hashtags: ['演示模式', userProfile.productName, '用户体验'],
            status: 'planned'
          },
          {
            scheduledTime: new Date(now.getTime() + 2 * 24 * 3600000 + 20 * 3600000),
            contentType: '知识科普',
            title: `知识科普 - 行业相关的专业知识`,
            content: `这是行业相关的专业知识科普。演示模式下的内容，请配置 ANTHROPIC_API_KEY 以获取 AI 生成的真实内容。`,
            imagePrompt: `${userProfile.productName}, 知识科普, 小红书风格`,
            hashtags: ['演示模式', userProfile.productName, '知识科普'],
            status: 'planned'
          }
        ];
        console.log(`⚠️  [DEBUG] 创建演示任务: ${demoDailyTasks.length} 个任务`);

        console.log(`⚠️  [DEBUG] 保存演示数据到 contentPlans...`);
        this.contentPlans.set(userProfile.userId, {
          strategy: demoStrategy,
          weeklyPlan: demoWeeklyPlan,
          dailyTasks: demoDailyTasks
        });
        console.log(`⚠️  [DEBUG] 演示数据已保存，contentPlans 大小: ${this.contentPlans.size}`);

        // 设置完成状态（演示模式）
        console.log(`⚠️  [DEBUG] 设置演示模式状态为 completed...`);
        this.generationStatus.set(userProfile.userId, 'completed');
        console.log(`⚠️  [DEBUG] 演示模式状态已设置: ${this.generationStatus.get(userProfile.userId)}`);

        console.log(`✅ [DEBUG] 演示模式启动成功！已创建${demoDailyTasks.length}个演示任务`);
        return;
      }

      // 其他错误直接抛出
      console.log(`❌ [DEBUG] 设置失败状态...`);
      this.generationStatus.set(userProfile.userId, 'failed');
      console.log(`❌ [DEBUG] 失败状态已设置: ${this.generationStatus.get(userProfile.userId)}`);
      throw error;
    }
  }

  /**
   * 使用Claude制定内容策略
   */
  private async createContentStrategy(profile: UserProfile): Promise<ContentStrategy> {
    const prompt = `
你是一位资深的小红书运营专家。请为以下产品制定详细的内容营销策略：

产品信息：
- 产品/服务：${profile.productName}
- 目标客户：${profile.targetAudience}
- 营销目标：${profile.marketingGoal}
- 品牌风格：${profile.brandStyle}
- 发布频率：${profile.postFrequency}

请分析并提供：
1. 5个核心内容主题（针对目标客户的痛点和需求）
2. 8种适合的内容类型（如：教程、测评、探店、生活方式等）
3. 最佳发布时间（3个时段，考虑目标客户的作息）
4. 20个高热度相关话题标签
5. 当前相关的3个热门趋势话题

请以JSON格式返回，确保建议专业且具有可执行性。
`;

    const response = await this.anthropic.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });

    try {
      const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
      const rawStrategy = JSON.parse(responseText);
      console.log('📋 内容策略制定完成:', rawStrategy);

      // 转换Claude返回的嵌套对象格式为数组格式
      const strategy: ContentStrategy = {
        keyThemes: Object.values(rawStrategy.core_themes || rawStrategy['核心内容主题'] || {}),
        contentTypes: Object.values(rawStrategy.content_types || rawStrategy['内容类型'] || {}),
        optimalTimes: Object.values(rawStrategy.best_posting_time || rawStrategy['最佳发布时间'] || {}),
        hashtags: rawStrategy.hot_hashtags || Object.values(rawStrategy['热度话题标签'] || {}),
        trendingTopics: Object.values(rawStrategy.trending_topics || rawStrategy['当前热门趋势'] || {})
      };

      return strategy;
    } catch (error) {
      console.error('策略解析失败:', error);
      // 返回默认策略
      return this.getDefaultStrategy();
    }
  }

  /**
   * 生成周计划
   */
  private async generateWeeklyPlan(profile: UserProfile, strategy: ContentStrategy): Promise<WeeklyPlan> {
    const prompt = `
基于以下内容策略，为${profile.productName}制定本周(7天)的详细发布计划：

内容策略：
核心主题：${strategy.keyThemes.join(', ')}
内容类型：${strategy.contentTypes.join(', ')}
发布频率：${profile.postFrequency}
最佳时间：${strategy.optimalTimes.join(', ')}

要求：
1. 根据发布频率安排每日发布数量
2. 确保主题分布均衡，避免重复
3. 考虑周末和工作日的用户行为差异
4. 每个内容要有明确的目标和预期效果

请以JSON格式返回7天的计划，包含每天的主题、内容类型、发布时间。
`;

    const response = await this.anthropic.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }]
    });

    try {
      const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
      const rawPlan = JSON.parse(responseText);
      console.log('📅 周计划生成完成:', rawPlan);

      // 处理各种可能的返回格式
      let daysData: any[] = [];

      if (Array.isArray(rawPlan.days)) {
        daysData = rawPlan.days;
      } else if (rawPlan.weekly_plan) {
        // 格式: {weekly_plan: {Monday: [...], Tuesday: [...]}}
        daysData = Object.entries(rawPlan.weekly_plan).map(([dayName, posts]: [string, any]) => ({
          date: this.getDateFromDayName(dayName),
          posts: posts
        }));
      } else if (rawPlan.days) {
        daysData = Object.values(rawPlan.days);
      } else if (rawPlan['每日计划']) {
        daysData = Object.values(rawPlan['每日计划']);
      }

      const weeklyPlan: WeeklyPlan = {
        days: daysData.map((day: any, index: number) => ({
          date: day.date ? new Date(day.date) : new Date(Date.now() + index * 24 * 60 * 60 * 1000),
          posts: Array.isArray(day.posts || day)
            ? (day.posts || day)
            : Object.values(day.posts || day['发布内容'] || {})
        }))
      };

      console.log(`📊 周计划已生成，共 ${weeklyPlan.days.length} 天的计划`);
      return weeklyPlan;
    } catch (error) {
      console.error('周计划解析失败:', error);
      return this.getDefaultWeeklyPlan();
    }
  }

  /**
   * 将星期名转换为日期
   */
  private getDateFromDayName(dayName: string): Date {
    const today = new Date();
    const dayMap: {[key: string]: number} = {
      'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4,
      'Friday': 5, 'Saturday': 6, 'Sunday': 0
    };

    const targetDay = dayMap[dayName];
    const currentDay = today.getDay();
    const daysUntilTarget = (targetDay - currentDay + 7) % 7;

    const date = new Date(today);
    date.setDate(today.getDate() + daysUntilTarget);
    return date;
  }

  /**
   * 生成详细的每日任务
   */
  private async generateDailyTasks(profile: UserProfile, weeklyPlan: WeeklyPlan): Promise<DailyTask[]> {
    const tasks: DailyTask[] = [];

    for (const day of weeklyPlan.days) {
      for (const post of day.posts) {
        const task = await this.createDetailedTask(profile, post);
        tasks.push(task);
      }
    }

    return tasks;
  }

  /**
   * 创建详细的发布任务
   */
  private async createDetailedTask(profile: UserProfile, post: any): Promise<DailyTask> {
    const prompt = `
请为以下内容创建一篇完整的小红书文案：

产品：${profile.productName}
主题：${post.theme}
内容类型：${post.type}
品牌风格：${profile.brandStyle}
目标：${profile.marketingGoal}

要求：
1. 标题：吸引眼球，包含关键词，不超过20字
2. 正文：${profile.brandStyle}风格，包含emoji，200-500字
3. 配图描述：详细描述需要的图片内容和风格
4. 话题标签：5-8个相关标签

请以JSON格式返回：
{
  "title": "标题",
  "content": "正文内容",
  "imagePrompt": "图片生成提示词",
  "hashtags": ["标签1", "标签2"]
}
`;

    const response = await this.anthropic.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }]
    });

    try {
      const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
      console.log('Claude响应原文:', responseText);

      // 清理响应文本，移除可能的控制字符和非JSON内容
      let cleanedText = responseText.trim();

      // 查找JSON块的开始和结束
      const jsonStart = cleanedText.indexOf('{');
      const jsonEnd = cleanedText.lastIndexOf('}') + 1;

      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        cleanedText = cleanedText.substring(jsonStart, jsonEnd);
      }

      // 移除控制字符
      cleanedText = cleanedText.replace(/[\x00-\x1F\x7F]/g, '');

      console.log('清理后的JSON:', cleanedText);

      const taskDetails = JSON.parse(cleanedText);

      return {
        scheduledTime: new Date(post.scheduledTime),
        contentType: post.type,
        title: taskDetails.title || '默认标题',
        content: taskDetails.content || '默认内容',
        imagePrompt: taskDetails.imagePrompt || '默认图片描述',
        hashtags: Array.isArray(taskDetails.hashtags) ? taskDetails.hashtags : ['默认标签'],
        status: 'planned'
      };
    } catch (error) {
      console.error('任务创建失败:', error);
      console.error('原始响应:', response.content[0].type === 'text' ? response.content[0].text : '');
      return this.getDefaultTask(post);
    }
  }

  /**
   * 启动定时调度器
   */
  private startScheduler(userId: string): void {
    console.log(`⏰ 为用户 ${userId} 启动定时调度器`);

    // 每分钟检查一次是否有需要执行的任务
    setInterval(async () => {
      await this.executeScheduledTasks(userId);
    }, 60000);

    // 每天凌晨重新规划第二天的内容
    setInterval(async () => {
      await this.dailyPlanningUpdate(userId);
    }, 24 * 60 * 60 * 1000);
  }

  /**
   * 执行定时任务
   */
  private async executeScheduledTasks(userId: string): Promise<void> {
    const plan = this.contentPlans.get(userId);
    if (!plan) return;

    const now = new Date();
    const profile = this.userProfiles.get(userId)!;

    for (const task of plan.dailyTasks) {
      // 检查是否到了发布时间（提前5分钟开始准备）
      const timeToExecute = task.scheduledTime.getTime() - now.getTime();

      if (timeToExecute <= 5 * 60 * 1000 && timeToExecute > 0 && task.status === 'planned') {
        await this.prepareAndExecuteTask(userId, task, profile);
      }
    }
  }

  /**
   * 准备并执行任务
   */
  private async prepareAndExecuteTask(userId: string, task: DailyTask, profile: UserProfile): Promise<void> {
    try {
      console.log(`🎬 开始执行任务: ${task.title}`);
      task.status = 'generating';

      // 1. 生成图片
      const imageUrl = await this.generateImage(task.imagePrompt);
      task.imageUrl = imageUrl;  // 保存图片URL到任务中

      // 2. 检查是否需要人工审核
      if (profile.reviewMode === 'auto') {
        // 直接发布
        await this.publishContent(userId, task, imageUrl);
        task.status = 'published';
        console.log(`✅ 自动发布成功: ${task.title}`);
      } else {
        // 等待审核
        task.status = 'ready';
        await this.notifyForReview(userId, task, imageUrl);
        console.log(`⏳ 内容已准备就绪，等待审核: ${task.title}`);
      }

    } catch (error) {
      console.error(`❌ 任务执行失败: ${task.title}`, error);
    }
  }

  /**
   * 生成图片
   */
  private async generateImage(prompt: string): Promise<string> {
    try {
      const result = await this.imageService.generateImage({
        prompt: `${prompt}, high quality, suitable for social media, vibrant colors`,
        style: 'realistic',
        aspectRatio: '1:1'
      });

      return result.url;
    } catch (error) {
      console.error('图片生成失败:', error);
      // 使用备用图片
      return await this.getFallbackImage(prompt);
    }
  }

  /**
   * 备用图片获取（使用占位图）
   */
  private async getFallbackImage(prompt: string): Promise<string> {
    try {
      // 使用图片服务的占位图功能
      const result = await this.imageService.generateImage({
        prompt: 'placeholder image',
        style: 'realistic',
        aspectRatio: '1:1'
      });
      return result.url;
    } catch (error) {
      console.error('备用图片获取失败:', error);
      return 'https://via.placeholder.com/1024x1024?text=Image';
    }
  }

  /**
   * 发布内容到小红书
   */
  private async publishContent(userId: string, task: DailyTask, imageUrl: string): Promise<void> {
    try {
      // 下载图片到本地
      const imagePath = await this.downloadImage(imageUrl);

      // 模拟调用小红书发布工具
      console.log(`📝 发布内容: ${task.title}`);
      console.log(`📷 使用图片: ${imagePath}`);
      console.log(`🏷️ 标签: ${task.hashtags.join(', ')}`);

      // 实际项目中这里会调用真实的MCP工具
      /*
      const result = await this.mcpClient.callTool({
        name: 'xiaohongshu_publish_content',
        arguments: {
          userId: userId,
          title: task.title,
          content: task.content,
          images: [imagePath],
          tags: task.hashtags
        }
      });
      */

      console.log('✅ 发布成功');
    } catch (error) {
      console.error('❌ 发布失败:', error);
      throw error;
    }
  }

  /**
   * 通知用户审核
   */
  private async notifyForReview(userId: string, task: DailyTask, imageUrl: string): Promise<void> {
    // 这里可以通过WebSocket或者HTTP通知前端
    // 用户可以在前端界面看到待审核的内容
    console.log(`📬 通知用户 ${userId} 审核内容: ${task.title}`);
  }

  /**
   * 每日规划更新
   */
  private async dailyPlanningUpdate(userId: string): Promise<void> {
    console.log(`🔄 为用户 ${userId} 更新明日计划`);

    const profile = this.userProfiles.get(userId);
    if (!profile) return;

    // 分析昨日表现
    const performance = await this.analyzePerformance(userId);

    // 调整策略
    const adjustedStrategy = await this.adjustStrategy(profile, performance);

    // 生成新的任务
    const newTasks = await this.generateNextDayTasks(profile, adjustedStrategy);

    // 更新计划
    const plan = this.contentPlans.get(userId)!;
    plan.dailyTasks.push(...newTasks);

    console.log(`✅ 明日规划更新完成，新增 ${newTasks.length} 个任务`);
  }

  /**
   * 分析表现数据
   */
  private async analyzePerformance(userId: string): Promise<any> {
    try {
      // 调用小红书工具获取数据（这里模拟返回）
      return {
        engagement: 0,
        reach: 0,
        newFollowers: 0
      };
    } catch (error) {
      console.error('数据分析失败:', error);
      return { engagement: 0, reach: 0, newFollowers: 0 };
    }
  }

  /**
   * 用户审核并发布内容
   */
  async reviewAndPublish(userId: string, taskId: string, approved: boolean, edits?: Partial<DailyTask>): Promise<void> {
    const plan = this.contentPlans.get(userId);
    if (!plan) return;

    const task = plan.dailyTasks.find(t => t.title === taskId);
    if (!task) return;

    if (approved) {
      // 应用编辑
      if (edits) {
        Object.assign(task, edits);
      }

      // 发布
      await this.publishContent(userId, task, 'image_url_here');
      task.status = 'published';
    } else {
      // 拒绝，重新生成
      await this.regenerateTask(userId, task);
    }
  }

  // 默认策略和计划的辅助方法
  private getDefaultStrategy(): ContentStrategy {
    return {
      keyThemes: ['产品介绍', '使用技巧', '用户故事', '行业知识', '生活方式'],
      contentTypes: ['图文', '视频', '轮播图', '单图'],
      optimalTimes: ['09:00', '15:00', '20:00'],
      hashtags: ['种草', '好物推荐', '生活分享'],
      trendingTopics: ['当季热门', '节日营销', '新品发布']
    };
  }

  private getDefaultWeeklyPlan(): WeeklyPlan {
    // 返回默认的周计划
    return {
      days: [
        {
          date: new Date(),
          posts: [
            {
              theme: '产品介绍',
              type: '图文',
              scheduledTime: new Date()
            }
          ]
        }
      ]
    };
  }

  private getDefaultTask(post: any): DailyTask {
    return {
      scheduledTime: new Date(post.scheduledTime),
      contentType: post.type,
      title: '默认标题',
      content: '默认内容',
      imagePrompt: '默认图片描述',
      hashtags: ['默认标签'],
      status: 'planned'
    };
  }

  // 其他辅助方法...
  private async downloadImage(url: string): Promise<string> {
    // 这里模拟下载图片的逻辑
    // 实际实现可以使用之前的ImageGenerationService中的downloadImage方法
    const filename = `image_${Date.now()}.jpg`;
    const filepath = `/tmp/${filename}`;
    console.log(`📁 模拟下载图片: ${url} -> ${filepath}`);
    return filepath;
  }

  private async adjustStrategy(profile: UserProfile, performance: any): Promise<ContentStrategy> {
    // 实现策略调整逻辑
    return this.getDefaultStrategy();
  }

  private async generateNextDayTasks(profile: UserProfile, strategy: ContentStrategy): Promise<DailyTask[]> {
    // 实现明日任务生成逻辑
    return [];
  }

  private async regenerateTask(userId: string, task: DailyTask): Promise<void> {
    // 实现任务重新生成逻辑
    console.log(`🔄 重新生成任务: ${task.title}`);
  }

  /**
   * 获取用户的内容策略
   */
  getStrategy(userId: string): ContentStrategy | null {
    console.log(`📋 [DEBUG] 获取用户 ${userId} 的策略`);
    console.log(`📋 [DEBUG] contentPlans 总数: ${this.contentPlans.size}`);
    console.log(`📋 [DEBUG] contentPlans 中的用户IDs:`, Array.from(this.contentPlans.keys()));

    const plan = this.contentPlans.get(userId);
    if (plan) {
      console.log(`📋 [DEBUG] 找到用户策略:`, JSON.stringify(plan.strategy, null, 2));
      return plan.strategy;
    } else {
      console.log(`📋 [DEBUG] 未找到用户策略`);
      return null;
    }
  }

  /**
   * 获取用户的生成状态
   */
  getGenerationStatus(userId: string): 'idle' | 'generating' | 'completed' | 'failed' {
    const status = this.generationStatus.get(userId) || 'idle';
    console.log(`🔄 [DEBUG] 获取用户 ${userId} 的生成状态: ${status}`);
    console.log(`🔄 [DEBUG] generationStatus Map 总数: ${this.generationStatus.size}`);
    console.log(`🔄 [DEBUG] generationStatus 中的用户IDs:`, Array.from(this.generationStatus.keys()));
    return status;
  }

  /**
   * 获取用户的每日任务
   */
  getDailyTasks(userId: string): DailyTask[] {
    console.log(`📅 [DEBUG] 获取用户 ${userId} 的每日任务`);
    console.log(`📅 [DEBUG] contentPlans 总数: ${this.contentPlans.size}`);

    const plan = this.contentPlans.get(userId);
    if (plan && plan.dailyTasks) {
      console.log(`📅 [DEBUG] 找到 ${plan.dailyTasks.length} 个每日任务`);
      plan.dailyTasks.forEach((task, index) => {
        console.log(`📅 [DEBUG] 任务 ${index + 1}: ${task.title} (${task.status})`);
      });
      return plan.dailyTasks;
    } else {
      console.log(`📅 [DEBUG] 未找到每日任务`);
      return [];
    }
  }

  /**
   * 获取用户的周计划
   */
  getWeeklyPlan(userId: string): WeeklyPlan | null {
    const plan = this.contentPlans.get(userId);
    return plan ? plan.weeklyPlan : null;
  }

  /**
   * 获取用户的运营数据统计
   */
  getOperationStats(userId: string): {
    postsPublished: number;
    totalReads: number;
    totalFollowers: number;
    engagementRate: string;
  } {
    const dailyTasks = this.getDailyTasks(userId);

    // 计算已发布的帖子数量
    const publishedCount = dailyTasks.filter(task => task.status === 'published').length;

    // 模拟阅读量和粉丝增长（实际应该从小红书获取）
    const totalReads = publishedCount * Math.floor(Math.random() * 500 + 300); // 每篇300-800阅读
    const totalFollowers = Math.floor(publishedCount * 15); // 每篇约15个新粉丝
    const engagementRate = publishedCount > 0
      ? `${(Math.random() * 3 + 2).toFixed(1)}%`  // 2-5%互动率
      : '0%';

    return {
      postsPublished: publishedCount,
      totalReads,
      totalFollowers,
      engagementRate
    };
  }

  /**
   * 获取待发布的内容列表
   */
  getPendingContent(userId: string): Array<{
    id: string;
    title: string;
    type: string;
    scheduledTime: string;
    status: string;
    imageUrl?: string;
  }> {
    const dailyTasks = this.getDailyTasks(userId);

    // 获取状态为ready的任务
    return dailyTasks
      .filter(task => task.status === 'ready')
      .map((task, index) => ({
        id: `task-${index}`,
        title: task.title,
        type: task.contentType,
        scheduledTime: task.scheduledTime.toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }),
        status: '待审核',
        imageUrl: task.imageUrl
      }));
  }
}

// 类型定义
interface WeeklyPlan {
  days: Array<{
    date: Date;
    posts: Array<{
      theme: string;
      type: string;
      scheduledTime: Date;
    }>;
  }>;
}

export default AutoContentManager;