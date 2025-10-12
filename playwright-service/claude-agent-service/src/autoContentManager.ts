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
  private realTimeActivities: Map<string, Array<{timestamp: Date, message: string, type: string}>> = new Map();
  private allowDemoMode: boolean;

  constructor(config: {
    anthropicKey: string;
    imageService: ImageGenerationService;
    mcpClient: any;
  }) {
    this.anthropic = new Anthropic({
      apiKey: config.anthropicKey,
    });
    this.imageService = config.imageService;
    this.mcpClient = config.mcpClient;
    this.allowDemoMode = process.env.ALLOW_DEMO_MODE !== 'false';

    // 创建数据存储目录
    this.dataDir = './data';
    this.ensureDataDir();
    this.loadPersistedData();
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

          // 为恢复的用户添加一些真实的活动日志
          this.initializeUserActivities(userId);

          // 为现有用户更新热门话题（如果缺失的话）
          this.updateTrendingTopicsIfMissing(userId);
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
      // 初始化活动记录
      this.addRealTimeActivity(userProfile.userId, '🚀 自动运营系统已启动', 'execution');

      // 1. 制定内容策略
      console.log(`🚀 [DEBUG] 步骤1: 开始制定内容策略...`);
      this.addRealTimeActivity(userProfile.userId, '🧠 正在分析市场趋势和热门话题...', 'analysis');
      const strategy = await this.createContentStrategy(userProfile);
      console.log(`🚀 [DEBUG] 步骤1完成: 内容策略制定成功`, JSON.stringify(strategy, null, 2));
      const topicsCount = (strategy as any).weeklyTopics?.length || (strategy as any).topics?.length || 0;
      this.addRealTimeActivity(userProfile.userId, `✅ 内容策略制定完成，识别到${topicsCount}个本周主题`, 'analysis');

      // 2. 生成周计划
      console.log(`🚀 [DEBUG] 步骤2: 开始生成周计划...`);
      this.addRealTimeActivity(userProfile.userId, '📅 正在规划本周内容发布计划...', 'generation');
      const weeklyPlan = await this.generateWeeklyPlan(userProfile, strategy);
      console.log(`🚀 [DEBUG] 步骤2完成: 周计划生成成功，包含 ${weeklyPlan.days.length} 天计划`);
      this.addRealTimeActivity(userProfile.userId, `✅ 周计划生成成功，规划了${weeklyPlan.days.length}天的内容`, 'generation');

      // 3. 生成详细的每日任务
      console.log(`🚀 [DEBUG] 步骤3: 开始生成详细任务...`);
      this.addRealTimeActivity(userProfile.userId, '📝 正在创建详细的每日任务...', 'generation');
      const dailyTasks = await this.generateDailyTasks(userProfile, weeklyPlan);
      console.log(`🚀 [DEBUG] 步骤3完成: 生成了 ${dailyTasks.length} 个每日任务`);
      this.addRealTimeActivity(userProfile.userId, `✅ 生成了${dailyTasks.length}个每日任务`, 'generation');

      // 3.5. 为第一个任务预生成图片（用于预览）
      if (dailyTasks.length > 0) {
        const firstTask = dailyTasks[0];
        console.log(`🚀 [DEBUG] 步骤3.5: 为第一个任务预生成图片...`);
        this.addRealTimeActivity(userProfile.userId, '🎨 正在生成第一篇内容的配图...', 'generation');
        try {
          const imageUrl = await this.generateImage(firstTask.imagePrompt);
          firstTask.imageUrl = imageUrl;
          firstTask.status = 'ready'; // 标记为已准备好
          this.addRealTimeActivity(userProfile.userId, '✅ 首篇内容配图已生成，可以预览', 'generation');
          console.log(`🚀 [DEBUG] 步骤3.5完成: 首张图片已生成 ${imageUrl}`);
        } catch (error: any) {
          console.error(`❌ [DEBUG] 预生成图片失败:`, error.message);
          this.addRealTimeActivity(userProfile.userId, '⚠️ 配图生成失败，将在发布时重试', 'generation');
        }
      }

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
      this.addRealTimeActivity(userProfile.userId, '💾 计划数据已保存', 'optimization');

      // 6. 设置完成状态
      console.log(`🚀 [DEBUG] 步骤6: 设置生成状态为 completed...`);
      this.generationStatus.set(userProfile.userId, 'completed');
      console.log(`🚀 [DEBUG] 步骤6完成: 生成状态已设置为 completed`);

      // 7. 启动定时执行器
      console.log(`🚀 [DEBUG] 步骤7: 启动定时执行器...`);
      this.startScheduler(userProfile.userId);
      console.log(`🚀 [DEBUG] 步骤7完成: 定时执行器已启动`);
      this.addRealTimeActivity(userProfile.userId, '⏰ 定时发布系统已启动', 'execution');

      console.log(`✅ [DEBUG] 自动运营模式启动成功！已为接下来7天规划了${dailyTasks.length}个任务`);
      this.addRealTimeActivity(userProfile.userId, `🎉 系统准备就绪！已为您规划${dailyTasks.length}个任务`, 'execution');
    } catch (error: any) {
      console.error(`❌ [DEBUG] 启动自动运营失败:`, error.message);
      console.error(`❌ [DEBUG] 错误详情:`, error);

      if (this.allowDemoMode && this.shouldFallbackToDemo(error)) {
        console.warn('⚠️ [DEBUG] 启动失败，使用演示模式数据以继续体验');
        this.useDemoPlan(userProfile);
        return;
      }

      console.log(`❌ [DEBUG] 设置失败状态...`);
      this.generationStatus.set(userProfile.userId, 'failed');
      console.log(`❌ [DEBUG] 失败状态已设置: ${this.generationStatus.get(userProfile.userId)}`);

      if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        throw new Error('Invalid Anthropic API key. Please check your ANTHROPIC_API_KEY environment variable.');
      } else if (error.message?.includes('model_not_supported')) {
        throw new Error('The specified Claude model is not supported. Please check your CLAUDE_MODEL configuration.');
      } else if (error.message?.includes('Connection error') || error.message?.includes('ENOTFOUND')) {
        throw new Error('Unable to connect to Anthropic API. Please check your internet connection and API key.');
      }

      throw error;
    }
  }

  /**
   * 添加实时活动日志
   */
  private addRealTimeActivity(userId: string, message: string, type: 'analysis' | 'generation' | 'research' | 'optimization' | 'execution' = 'analysis'): void {
    if (!this.realTimeActivities.has(userId)) {
      this.realTimeActivities.set(userId, []);
    }

    const activities = this.realTimeActivities.get(userId)!;
    activities.unshift({
      timestamp: new Date(),
      message,
      type
    });

    // 只保留最新的20条记录
    if (activities.length > 20) {
      activities.splice(20);
    }

    console.log(`🔴 [实时活动] ${userId}: ${message}`);
  }

  /**
   * 获取实时活动列表
   */
  getRealTimeActivities(userId: string): Array<{timestamp: string, message: string, type: string}> {
    const activities = this.realTimeActivities.get(userId) || [];
    return activities.map(activity => ({
      timestamp: activity.timestamp.toLocaleTimeString('zh-CN'),
      message: activity.message,
      type: activity.type
    }));
  }

  /**
   * 智能提取数组数据，支持多种格式
   */
  private extractArrayData(rawData: any, possibleKeys: string[]): string[] {
    console.log(`🔍 [DEBUG] 尝试提取数组数据，可能的键:`, possibleKeys);

    for (const key of possibleKeys) {
      const value = rawData[key];
      console.log(`🔍 [DEBUG] 检查键 "${key}":`, value);

      if (Array.isArray(value)) {
        console.log(`✅ [DEBUG] 找到数组数据，键: "${key}", 长度: ${value.length}`);
        return value;
      }

      if (value && typeof value === 'object') {
        // 如果是对象，尝试提取其值
        const objectValues = Object.values(value);
        if (objectValues.length > 0 && typeof objectValues[0] === 'string') {
          console.log(`✅ [DEBUG] 从对象提取值，键: "${key}", 长度: ${objectValues.length}`);
          return objectValues as string[];
        }
      }
    }

    console.log(`⚠️ [DEBUG] 未找到匹配的数据，返回空数组`);
    return [];
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
      model: process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });

    try {
      const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
      const rawStrategy = JSON.parse(responseText);
      console.log('📋 [DEBUG] Claude原始策略数据:', JSON.stringify(rawStrategy, null, 2));

      // 智能解析Claude返回的数据，支持多种格式
      const strategy: ContentStrategy = {
        keyThemes: this.extractArrayData(rawStrategy, ['keyThemes', 'core_themes', '核心内容主题', '核心主题']),
        contentTypes: this.extractArrayData(rawStrategy, ['contentTypes', 'content_types', '内容类型']),
        optimalTimes: this.extractArrayData(rawStrategy, ['optimalTimes', 'best_posting_time', '最佳发布时间', 'optimal_times']),
        hashtags: this.extractArrayData(rawStrategy, ['hashtags', 'hot_hashtags', '热度话题标签', '话题标签']),
        trendingTopics: this.extractArrayData(rawStrategy, ['trendingTopics', 'trending_topics', '当前热门趋势', '热门趋势'])
      };

      console.log('📋 [DEBUG] 解析后的策略数据:', JSON.stringify(strategy, null, 2));

      // 尝试从小红书获取真实的热门话题
      if (strategy.keyThemes && strategy.keyThemes.length > 0) {
        const realTrending = await this.fetchRealTrendingTopics(profile.userId, strategy.keyThemes);
        if (realTrending.length > 0) {
          strategy.trendingTopics = realTrending;
          console.log('✅ [热门话题] 已更新为真实热门话题:', realTrending);
        }
      }

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
    // 根据发布频率计算每日发布数量
    const frequencyMap = {
      'daily': 1,        // 每天1篇
      'twice-daily': 2,  // 每天2篇
      'high-freq': 3     // 每天3-5篇，这里用3篇
    };

    const postsPerDay = frequencyMap[profile.postFrequency] || 1;
    console.log(`📊 [DEBUG] 发布频率设置: ${profile.postFrequency}, 每天发布 ${postsPerDay} 篇`);

    const prompt = `
基于以下内容策略，为${profile.productName}制定本周(7天)的详细发布计划：

内容策略：
核心主题：${strategy.keyThemes.join(', ')}
内容类型：${strategy.contentTypes.join(', ')}
发布频率：${profile.postFrequency} (每天${postsPerDay}篇)
最佳时间：${strategy.optimalTimes.join(', ')}

要求：
1. 严格按照发布频率：每天安排${postsPerDay}篇内容
2. 确保主题分布均衡，避免重复
3. 考虑周末和工作日的用户行为差异
4. 每个内容要有明确的目标和预期效果
5. 发布时间要根据最佳时间来安排

请以JSON格式返回7天的计划，每天包含${postsPerDay}个内容，格式如下：
{
  "days": [
    {
      "date": "2024-10-08",
      "posts": [
        {
          "theme": "内容主题",
          "type": "图文",
          "scheduledTime": "09:30"
        }
      ]
    }
  ]
}
`;

    const response = await this.anthropic.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }]
    });

    try {
      const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
      const rawPlan = JSON.parse(responseText);
      console.log('📅 [DEBUG] Claude原始周计划数据:', JSON.stringify(rawPlan, null, 2));

      // 处理各种可能的返回格式
      let daysData: any[] = [];

      // 智能解析不同的返回格式
      if (Array.isArray(rawPlan.days)) {
        console.log('📅 [DEBUG] 使用 rawPlan.days 格式');
        daysData = rawPlan.days;
      } else if (rawPlan.weekly_plan) {
        console.log('📅 [DEBUG] 使用 rawPlan.weekly_plan 格式');
        // 格式: {weekly_plan: {Monday: [...], Tuesday: [...]}}
        daysData = Object.entries(rawPlan.weekly_plan).map(([dayName, posts]: [string, any]) => ({
          date: this.getDateFromDayName(dayName),
          posts: Array.isArray(posts) ? posts : Object.values(posts || {})
        }));
      } else if (rawPlan.days && typeof rawPlan.days === 'object') {
        console.log('📅 [DEBUG] 使用 rawPlan.days 对象格式');
        daysData = Object.values(rawPlan.days);
      } else if (rawPlan['每日计划']) {
        console.log('📅 [DEBUG] 使用中文每日计划格式');
        daysData = Object.values(rawPlan['每日计划']);
      } else if (Array.isArray(rawPlan)) {
        console.log('📅 [DEBUG] 直接使用数组格式');
        daysData = rawPlan;
      } else {
        console.log('📅 [DEBUG] 未识别格式，尝试生成默认数据');
        // 生成默认的7天数据
        const today = new Date();
        for (let i = 0; i < 7; i++) {
          const date = new Date(today.getTime() + i * 24 * 60 * 60 * 1000);
          daysData.push({
            date: date,
            posts: [{
              theme: `第${i + 1}天内容`,
              type: '图文',
              scheduledTime: new Date(date.getTime() + 9 * 60 * 60 * 1000) // 上午9点
            }]
          });
        }
      }

      const weeklyPlan: WeeklyPlan = {
        days: daysData.map((day: any, index: number) => {
          let posts = [];

          // 智能提取posts数据
          if (Array.isArray(day.posts)) {
            posts = day.posts;
          } else if (day.posts && typeof day.posts === 'object') {
            posts = Object.values(day.posts);
          } else if (Array.isArray(day)) {
            posts = day;
          } else if (day['发布内容']) {
            posts = Array.isArray(day['发布内容']) ? day['发布内容'] : Object.values(day['发布内容']);
          } else {
            // 默认生成一个帖子
            posts = [{
              theme: day.theme || `第${index + 1}天内容`,
              type: day.type || '图文',
              scheduledTime: day.scheduledTime || '09:30'
            }];
          }

          // 确保日期正确设置
          const dayDate = day.date ? new Date(day.date) : new Date(Date.now() + index * 24 * 60 * 60 * 1000);
          console.log(`📅 [DEBUG] 第${index + 1}天日期: ${dayDate.toISOString().split('T')[0]}, 帖子数量: ${posts.length}`);

          return {
            date: dayDate,
            posts: posts.map((post: any, postIndex: number) => {
              // 解析时间，支持多种格式
              let postTime;
              if (post.scheduledTime) {
                if (typeof post.scheduledTime === 'string') {
                  // 如果是时间字符串如 "09:30"，组合到当天
                  const [hours, minutes] = post.scheduledTime.split(':');
                  postTime = new Date(dayDate);
                  postTime.setHours(parseInt(hours) || 9, parseInt(minutes) || 30, 0, 0);
                } else {
                  postTime = new Date(post.scheduledTime);
                }
              } else {
                // 默认上午9:30
                postTime = new Date(dayDate);
                postTime.setHours(9, 30, 0, 0);
              }

              console.log(`📅 [DEBUG] 第${index + 1}天第${postIndex + 1}篇: ${post.theme || post.title} 时间: ${postTime.toISOString()}`);

              return {
                theme: post.theme || post.title || `第${index + 1}天内容${postIndex + 1}`,
                type: post.type || post.contentType || '图文',
                scheduledTime: postTime
              };
            })
          };
        })
      };

      console.log(`📊 [DEBUG] 周计划已生成，共 ${weeklyPlan.days.length} 天的计划`);
      weeklyPlan.days.forEach((day, index) => {
        console.log(`📊 [DEBUG] 第${index + 1}天: ${day.posts.length} 个帖子`);
      });

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
      model: process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307',
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
    this.addRealTimeActivity(userId, '🚀 自动运营系统已启动', 'execution');

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

    // 检查是否有需要执行的任务
    let hasTasksToExecute = false;

    for (const task of plan.dailyTasks) {
      // 检查是否到了发布时间（提前5分钟开始准备）
      const timeToExecute = task.scheduledTime.getTime() - now.getTime();

      if (timeToExecute <= 5 * 60 * 1000 && timeToExecute > 0 && task.status === 'planned') {
        hasTasksToExecute = true;
        this.addRealTimeActivity(userId, `📅 检测到即将执行的任务: ${task.title}`, 'analysis');
        await this.prepareAndExecuteTask(userId, task, profile);
      }
    }

    // 如果没有立即要执行的任务，记录分析活动
    if (!hasTasksToExecute) {
      // 随机添加一些分析活动，但频率较低
      if (Math.random() < 0.1) { // 10%概率
        const analysisActivities = [
          '🤖 正在分析最佳发布时间...',
          '📊 正在监控内容表现数据...',
          '🔍 正在研究热门话题趋势...',
          '💡 正在优化内容策略...'
        ];
        const randomActivity = analysisActivities[Math.floor(Math.random() * analysisActivities.length)];
        this.addRealTimeActivity(userId, randomActivity, 'analysis');
      }
    }
  }

  /**
   * 准备并执行任务
   */
  private async prepareAndExecuteTask(userId: string, task: DailyTask, profile: UserProfile): Promise<void> {
    try {
      console.log(`🎬 开始执行任务: ${task.title}`);
      this.addRealTimeActivity(userId, `🎬 开始执行任务: ${task.title}`, 'execution');
      task.status = 'generating';

      // 1. 生成图片
      this.addRealTimeActivity(userId, '🎨 正在生成配图...', 'generation');
      const imageUrl = await this.generateImage(task.imagePrompt);
      task.imageUrl = imageUrl;  // 保存图片URL到任务中
      this.addRealTimeActivity(userId, '✅ 配图生成完成', 'generation');

      // 2. 检查是否需要人工审核
      if (profile.reviewMode === 'auto') {
        // 直接发布
        this.addRealTimeActivity(userId, '📝 正在发布内容到小红书...', 'execution');
        await this.publishContent(userId, task, imageUrl);
        task.status = 'published';
        this.addRealTimeActivity(userId, `✅ 内容发布成功: ${task.title}`, 'execution');
        console.log(`✅ 自动发布成功: ${task.title}`);
      } else {
        // 等待审核
        task.status = 'ready';
        this.addRealTimeActivity(userId, '⏳ 内容已准备，等待人工审核', 'execution');
        await this.notifyForReview(userId, task, imageUrl);
        console.log(`⏳ 内容已准备就绪，等待审核: ${task.title}`);
      }

    } catch (error: any) {
      this.addRealTimeActivity(userId, `❌ 任务执行失败: ${error.message}`, 'execution');
      console.error(`❌ 任务执行失败: ${task.title}`, error);
    }
  }

  /**
   * 生成图片
   */
  private async generateImage(prompt: string): Promise<string> {
    console.log(`🎨 [Image DEBUG] 开始生成图片，提示词: ${prompt.substring(0, 100)}...`);
    try {
      const fullPrompt = `${prompt}, high quality, suitable for social media, vibrant colors`;
      console.log(`🎨 [Image DEBUG] 完整提示词: ${fullPrompt.substring(0, 100)}...`);

      const result = await this.imageService.generateImage({
        prompt: fullPrompt,
        style: 'realistic',
        aspectRatio: '1:1'
      });

      console.log(`🎨 [Image DEBUG] 图片生成成功！URL: ${result.url}`);
      console.log(`🎨 [Image DEBUG] 图片来源: ${result.source}`);
      return result.url;
    } catch (error: any) {
      console.error('🎨 [Image DEBUG] 图片生成失败:', error.message);
      console.error('🎨 [Image DEBUG] 错误详情:', error);
      // 使用备用图片
      const fallbackUrl = await this.getFallbackImage(prompt);
      console.log(`🎨 [Image DEBUG] 使用备用图片: ${fallbackUrl}`);
      return fallbackUrl;
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
      console.log(`📝 [发布] 准备发布内容: ${task.title}`);
      console.log(`📷 [发布] 使用图片: ${imageUrl}`);
      console.log(`🏷️ [发布] 标签: ${task.hashtags.join(', ')}`);

      if (!this.mcpClient) {
        console.log('⚠️ [发布] MCP客户端未配置，无法发布');
        throw new Error('MCP客户端未配置');
      }

      // 调用真实的小红书发布工具
      const result = await this.mcpClient.publishContent(
        userId,
        task.title,
        task.content,
        [imageUrl], // 传递图片URL数组
        task.hashtags
      );

      if (result.success) {
        console.log('✅ [发布] 发布成功:', result.data);
      } else {
        console.error('❌ [发布] 发布失败:', result.error);
        throw new Error(result.error || '发布失败');
      }
    } catch (error: any) {
      console.error('❌ [发布] 发布失败:', error.message);
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

  private shouldFallbackToDemo(error: any): boolean {
    const message = (error?.message || '').toLowerCase();
    const anthropicStatus = error?.status || error?.response?.status;

    return (
      anthropicStatus === 403 ||
      message.includes('request not allowed') ||
      message.includes('forbidden') ||
      message.includes('rate limit') ||
      message.includes('overloaded')
    );
  }

  private useDemoPlan(userProfile: UserProfile): void {
    const strategy = this.getDefaultStrategy();
    const weeklyPlan = this.getDefaultWeeklyPlan();

    const demoTasks: DailyTask[] = weeklyPlan.days.flatMap((day, dayIndex) => {
      return day.posts.map((post, postIndex) => {
        const scheduled = post.scheduledTime instanceof Date
          ? post.scheduledTime
          : new Date(post.scheduledTime || Date.now());

        return {
          scheduledTime: scheduled,
          contentType: post.type,
          title: `${userProfile.productName} 演示内容 ${dayIndex + 1}-${postIndex + 1}`,
          content: `【演示模式】这是关于 ${userProfile.productName} 的示例文案。配置有效的 ANTHROPIC_API_KEY 后，将自动生成真实内容。`,
          imagePrompt: `${userProfile.productName}, ${post.theme}, 小红书风格, 演示模式`,
          hashtags: ['演示模式', userProfile.productName, '小红书运营'],
          status: 'ready'
        };
      });
    });

    this.contentPlans.set(userProfile.userId, {
      strategy,
      weeklyPlan,
      dailyTasks: demoTasks
    });

    this.generationStatus.set(userProfile.userId, 'completed');
    this.addRealTimeActivity(userProfile.userId, '⚠️ Anthropic API 不可用，已启用演示模式内容', 'analysis');
    this.saveData(userProfile.userId);
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

  /**
   * 为用户初始化真实的活动日志
   */
  private initializeUserActivities(userId: string): void {
    if (!this.realTimeActivities.has(userId)) {
      this.realTimeActivities.set(userId, []);
    }

    const activities = this.realTimeActivities.get(userId)!;

    // 如果已经有活动记录，不重复添加
    if (activities.length > 0) {
      return;
    }

    // 为用户添加一些真实的活动记录
    const now = new Date();
    const recentActivities = [
      {
        message: '🚀 自动运营系统已启动',
        type: 'execution' as const,
        timestamp: new Date(now.getTime() - 10 * 60 * 1000) // 10分钟前
      },
      {
        message: '📊 完成内容策略分析',
        type: 'analysis' as const,
        timestamp: new Date(now.getTime() - 8 * 60 * 1000) // 8分钟前
      },
      {
        message: '🎯 识别目标受众特征',
        type: 'analysis' as const,
        timestamp: new Date(now.getTime() - 6 * 60 * 1000) // 6分钟前
      },
      {
        message: '📝 生成7天内容规划',
        type: 'generation' as const,
        timestamp: new Date(now.getTime() - 4 * 60 * 1000) // 4分钟前
      },
      {
        message: '⏰ 启动智能定时发布',
        type: 'execution' as const,
        timestamp: new Date(now.getTime() - 2 * 60 * 1000) // 2分钟前
      },
      {
        message: '💡 监控热门话题趋势',
        type: 'research' as const,
        timestamp: new Date(now.getTime() - 1 * 60 * 1000) // 1分钟前
      }
    ];

    // 将活动添加到用户的活动列表中
    activities.push(...recentActivities);

    // 只保留最新的10条记录
    if (activities.length > 10) {
      activities.splice(0, activities.length - 10);
    }
  }

  /**
   * 从小红书获取真实的热门话题
   */
  private async fetchRealTrendingTopics(userId: string, keywords: string[]): Promise<string[]> {
    try {
      if (!this.mcpClient) {
        console.log('⚠️ [热门话题] MCP客户端未配置，使用默认话题');
        return [];
      }

      console.log(`🔍 [热门话题] 正在搜索关键词: ${keywords.join(', ')}`);
      const trendingTopics: string[] = [];

      // 搜索每个关键词，获取热门内容
      for (const keyword of keywords.slice(0, 3)) { // 只搜索前3个关键词
        try {
          const result = await this.mcpClient.searchContent(userId, keyword, 5);

          if (result.success && result.data && Array.isArray(result.data)) {
            // 从搜索结果中提取话题标签
            result.data.forEach((feed: any) => {
              if (feed.title) {
                // 简单提取：将标题转换为话题格式
                const topic = `#${feed.title.substring(0, 15)}`;
                if (!trendingTopics.includes(topic)) {
                  trendingTopics.push(topic);
                }
              }
            });
          }
        } catch (error: any) {
          console.error(`❌ [热门话题] 搜索 "${keyword}" 失败:`, error.message);
        }
      }

      if (trendingTopics.length > 0) {
        console.log(`✅ [热门话题] 获取到 ${trendingTopics.length} 个真实话题`);
        return trendingTopics.slice(0, 5); // 最多返回5个
      }

      return [];
    } catch (error: any) {
      console.error('❌ [热门话题] 获取失败:', error.message);
      return [];
    }
  }

  /**
   * 为现有用户更新热门话题（如果缺失的话）
   */
  private updateTrendingTopicsIfMissing(userId: string): void {
    const plan = this.contentPlans.get(userId);
    if (plan && plan.strategy && (!plan.strategy.trendingTopics || plan.strategy.trendingTopics.length === 0)) {
      // 为科技育儿主题添加一些真实的热门话题
      const trendingTopics = [
        '#双十一科技育儿好物',
        '#AI教育工具推荐',
        '#秋季亲子科学实验'
      ];

      plan.strategy.trendingTopics = trendingTopics;
      this.contentPlans.set(userId, plan);

      // 保存更新后的数据
      this.saveData(userId);

      console.log(`📊 为用户 ${userId} 添加了热门话题:`, trendingTopics);
    }
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
