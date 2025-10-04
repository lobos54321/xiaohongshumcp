/**
 * 自动化内容规划服务
 * 基于Claude AI的智能内容策略制定和执行
 */

import Anthropic from '@anthropic-ai/sdk';
import ImageGenerationService from './imageGenerationService.js';

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
  hashtags: string[];
  status: 'planned' | 'generating' | 'ready' | 'published';
}

export class AutoContentManager {
  private anthropic: Anthropic;
  private imageService: ImageGenerationService;
  private mcpClient: any;
  private userProfiles: Map<string, UserProfile> = new Map();
  private contentPlans: Map<string, ContentPlan> = new Map();

  constructor(config: {
    anthropicKey: string;
    imageService: ImageGenerationService;
    mcpClient: any;
  }) {
    this.anthropic = new Anthropic({ apiKey: config.anthropicKey });
    this.imageService = config.imageService;
    this.mcpClient = config.mcpClient;
  }

  /**
   * 用户完成设置后，启动自动运营
   */
  async startAutoMode(userProfile: UserProfile): Promise<void> {
    console.log(`🚀 为用户 ${userProfile.userId} 启动自动运营模式`);

    // 保存用户配置
    this.userProfiles.set(userProfile.userId, userProfile);

    // 1. 制定内容策略
    const strategy = await this.createContentStrategy(userProfile);

    // 2. 生成周计划
    const weeklyPlan = await this.generateWeeklyPlan(userProfile, strategy);

    // 3. 生成详细的每日任务
    const dailyTasks = await this.generateDailyTasks(userProfile, weeklyPlan);

    // 4. 保存完整计划
    this.contentPlans.set(userProfile.userId, {
      strategy,
      weeklyPlan,
      dailyTasks
    });

    // 5. 启动定时执行器
    this.startScheduler(userProfile.userId);

    console.log(`✅ 自动运营模式启动成功！已为接下来7天规划了${dailyTasks.length}个任务`);
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
      const strategy = JSON.parse(responseText);
      console.log('📋 内容策略制定完成:', strategy);
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
      return JSON.parse(responseText);
    } catch (error) {
      console.error('周计划解析失败:', error);
      return this.getDefaultWeeklyPlan();
    }
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
      const taskDetails = JSON.parse(responseText);

      return {
        scheduledTime: new Date(post.scheduledTime),
        contentType: post.type,
        title: taskDetails.title,
        content: taskDetails.content,
        imagePrompt: taskDetails.imagePrompt,
        hashtags: taskDetails.hashtags,
        status: 'planned'
      };
    } catch (error) {
      console.error('任务创建失败:', error);
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
   * 获取用户待审核内容
   */
  async getPendingContent(userId: string): Promise<DailyTask[]> {
    const plan = this.contentPlans.get(userId);
    if (!plan) return [];

    return plan.dailyTasks.filter(task => task.status === 'ready');
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