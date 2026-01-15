/**
 * Supabase Database Service
 *
 * 数据库服务层，提供所有数据库操作的封装
 * 支持双用户ID系统：supabase_uuid (前端) + xhs_user_id (后端)
 */

import { SupabaseClient } from '@supabase/supabase-js';

// ==================== 类型定义 ====================

export interface UserProfile {
  id?: string;
  supabase_uuid: string;
  xhs_user_id: string;
  product_name: string;
  target_audience?: string;
  marketing_goal?: string;
  post_frequency?: string;
  brand_style?: string;
  review_mode?: string;
  target_platforms?: string[];  // 目标发布平台 ['xiaohongshu', 'douyin', 'weibo']
  avatar_photo_url?: string;    // 数字人头像照片
  voice_sample_url?: string;    // 数字人语音样本
  created_at?: string;
  updated_at?: string;
}

export interface ContentStrategy {
  id?: string;
  supabase_uuid: string;
  xhs_user_id: string;
  key_themes?: string[];  // 将JSONB转为数组
  trending_topics?: string[];
  hashtags?: string[];
  optimal_times?: string[];
  created_at?: string;
  updated_at?: string;
}

export interface DailyTask {
  id?: string;
  supabase_uuid: string;
  xhs_user_id: string;
  theme: string;
  title?: string;
  content?: string;
  scheduled_time?: string;
  status?: string;  // 'planned' | 'generating' | 'ready' | 'published' | 'failed'
  image_urls?: string[];
  cover_image_url?: string;
  post_url?: string;
  error_message?: string;
  retry_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface WeeklyPlan {
  id?: string;
  supabase_uuid: string;
  xhs_user_id: string;
  week_start_date: string;
  week_end_date: string;
  plan_data: any;  // JSONB，存储完整的周计划
  created_at?: string;
  updated_at?: string;
}

export interface AutomationStatus {
  supabase_uuid: string;
  xhs_user_id: string;
  is_running?: boolean;
  is_logged_in?: boolean;
  has_config?: boolean;
  last_activity?: string;
  uptime_seconds?: number;
  next_scheduled_task?: string;
  hasPlan?: boolean;
  hasStrategy?: boolean;
  lastGenerated?: string;
  totalTasks?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ActivityLog {
  id?: string;
  supabase_uuid: string;
  xhs_user_id: string;
  activity_type: string;
  message: string;
  metadata?: any;
  created_at?: string;
}

// ==================== 数据库服务类 ====================

export class DatabaseService {
  constructor(private supabase: SupabaseClient) {}

  // ==================== User Profile ====================

  /**
   * 保存或更新用户配置
   */
  async saveUserProfile(profile: UserProfile): Promise<void> {
    const { error } = await this.supabase
      .from('xhs_user_profiles')
      .upsert({
        supabase_uuid: profile.supabase_uuid,
        xhs_user_id: profile.xhs_user_id,
        product_name: profile.product_name,
        target_audience: profile.target_audience,
        marketing_goal: profile.marketing_goal,
        post_frequency: profile.post_frequency,
        brand_style: profile.brand_style,
        review_mode: profile.review_mode,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'xhs_user_id'
      });

    if (error) {
      console.error('❌ [DB] 保存用户配置失败:', error);
      throw error;
    }
    console.log(`✅ [DB] 用户配置已保存: ${profile.xhs_user_id}`);
  }

  /**
   * 获取用户配置（通过 xhs_user_id）
   */
  async getUserProfile(xhsUserId: string): Promise<UserProfile | null> {
    const { data, error } = await this.supabase
      .from('xhs_user_profiles')
      .select('*')
      .eq('xhs_user_id', xhsUserId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('❌ [DB] 获取用户配置失败:', error);
      throw error;
    }

    return data;
  }

  /**
   * 获取用户配置（通过 supabase_uuid）
   */
  async getUserProfileByUuid(supabaseUuid: string): Promise<UserProfile | null> {
    const { data, error } = await this.supabase
      .from('xhs_user_profiles')
      .select('*')
      .eq('supabase_uuid', supabaseUuid)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('❌ [DB] 获取用户配置失败:', error);
      throw error;
    }

    return data;
  }

  // ==================== Content Strategy ====================

  /**
   * 保存内容策略
   */
  async saveContentStrategy(strategy: ContentStrategy): Promise<void> {
    const { error } = await this.supabase
      .from('xhs_content_strategies')
      .upsert({
        supabase_uuid: strategy.supabase_uuid,
        xhs_user_id: strategy.xhs_user_id,
        key_themes: strategy.key_themes || [],
        trending_topics: strategy.trending_topics || [],
        hashtags: strategy.hashtags || [],
        optimal_times: strategy.optimal_times || [],
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'xhs_user_id'
      });

    if (error) {
      console.error('❌ [DB] 保存内容策略失败:', error);
      throw error;
    }
    console.log(`✅ [DB] 内容策略已保存: ${strategy.xhs_user_id}`);
  }

  /**
   * 获取内容策略
   */
  async getContentStrategy(xhsUserId: string): Promise<ContentStrategy | null> {
    const { data, error } = await this.supabase
      .from('xhs_content_strategies')
      .select('*')
      .eq('xhs_user_id', xhsUserId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('❌ [DB] 获取内容策略失败:', error);
      throw error;
    }

    return data;
  }

  // ==================== Daily Tasks ====================

  /**
   * 保存每日任务（批量）
   */
  async saveDailyTasks(tasks: DailyTask[]): Promise<void> {
    if (!tasks || tasks.length === 0) return;

    // 先删除该用户的所有旧任务
    const xhsUserId = tasks[0].xhs_user_id;
    await this.supabase
      .from('xhs_daily_tasks')
      .delete()
      .eq('xhs_user_id', xhsUserId);

    // 插入新任务
    const { error } = await this.supabase
      .from('xhs_daily_tasks')
      .insert(tasks.map(task => ({
        supabase_uuid: task.supabase_uuid,
        xhs_user_id: task.xhs_user_id,
        theme: task.theme,
        title: task.title,
        content: task.content,
        scheduled_time: task.scheduled_time,
        status: task.status || 'planned',
        image_urls: task.image_urls || [],
        cover_image_url: task.cover_image_url,
        post_url: task.post_url,
        error_message: task.error_message,
        retry_count: task.retry_count || 0,
      })));

    if (error) {
      console.error('❌ [DB] 保存每日任务失败:', error);
      throw error;
    }
    console.log(`✅ [DB] 已保存 ${tasks.length} 个每日任务`);
  }

  /**
   * 更新单个任务
   */
  async updateDailyTask(taskId: string, updates: Partial<DailyTask>): Promise<void> {
    const { error } = await this.supabase
      .from('xhs_daily_tasks')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    if (error) {
      console.error('❌ [DB] 更新任务失败:', error);
      throw error;
    }
    console.log(`✅ [DB] 任务已更新: ${taskId}`);
  }

  /**
   * 获取用户的所有任务
   */
  async getDailyTasks(xhsUserId: string): Promise<DailyTask[]> {
    const { data, error } = await this.supabase
      .from('xhs_daily_tasks')
      .select('*')
      .eq('xhs_user_id', xhsUserId)
      .order('scheduled_time', { ascending: true });

    if (error) {
      console.error('❌ [DB] 获取每日任务失败:', error);
      throw error;
    }

    return data || [];
  }

  /**
   * 获取特定状态的任务
   */
  async getTasksByStatus(xhsUserId: string, status: string): Promise<DailyTask[]> {
    const { data, error } = await this.supabase
      .from('xhs_daily_tasks')
      .select('*')
      .eq('xhs_user_id', xhsUserId)
      .eq('status', status)
      .order('scheduled_time', { ascending: true });

    if (error) {
      console.error('❌ [DB] 获取特定状态任务失败:', error);
      throw error;
    }

    return data || [];
  }

  // ==================== Weekly Plan ====================

  /**
   * 保存周计划
   */
  async saveWeeklyPlan(plan: WeeklyPlan): Promise<void> {
    const { error } = await this.supabase
      .from('xhs_weekly_plans')
      .upsert({
        supabase_uuid: plan.supabase_uuid,
        xhs_user_id: plan.xhs_user_id,
        week_start_date: plan.week_start_date,
        week_end_date: plan.week_end_date,
        plan_data: plan.plan_data,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'xhs_user_id,week_start_date'
      });

    if (error) {
      console.error('❌ [DB] 保存周计划失败:', error);
      throw error;
    }
    console.log(`✅ [DB] 周计划已保存: ${plan.xhs_user_id}`);
  }

  /**
   * 获取周计划
   */
  async getWeeklyPlan(xhsUserId: string): Promise<WeeklyPlan | null> {
    // 获取最新的周计划
    const { data, error } = await this.supabase
      .from('xhs_weekly_plans')
      .select('*')
      .eq('xhs_user_id', xhsUserId)
      .order('week_start_date', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('❌ [DB] 获取周计划失败:', error);
      throw error;
    }

    return data;
  }

  // ==================== Automation Status ====================

  /**
   * 更新运营状态
   */
  async updateAutomationStatus(status: AutomationStatus): Promise<void> {
    const { error } = await this.supabase
      .from('xhs_automation_status')
      .upsert({
        supabase_uuid: status.supabase_uuid,
        xhs_user_id: status.xhs_user_id,
        is_running: status.is_running,
        is_logged_in: status.is_logged_in,
        has_config: status.has_config,
        last_activity: status.last_activity || new Date().toISOString(),
        uptime_seconds: status.uptime_seconds,
        next_scheduled_task: status.next_scheduled_task,
        hasPlan: status.hasPlan,
        hasStrategy: status.hasStrategy,
        lastGenerated: status.lastGenerated,
        totalTasks: status.totalTasks,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'xhs_user_id'
      });

    if (error) {
      console.error('❌ [DB] 更新运营状态失败:', error);
      throw error;
    }
  }

  /**
   * 获取运营状态
   */
  async getAutomationStatus(xhsUserId: string): Promise<AutomationStatus | null> {
    const { data, error } = await this.supabase
      .from('xhs_automation_status')
      .select('*')
      .eq('xhs_user_id', xhsUserId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('❌ [DB] 获取运营状态失败:', error);
      throw error;
    }

    return data;
  }

  // ==================== Activity Logs ====================

  /**
   * 添加活动日志
   */
  async addActivityLog(log: ActivityLog): Promise<void> {
    const { error } = await this.supabase
      .from('xhs_activity_logs')
      .insert({
        supabase_uuid: log.supabase_uuid,
        xhs_user_id: log.xhs_user_id,
        activity_type: log.activity_type,
        message: log.message,
        metadata: log.metadata || {},
      });

    if (error) {
      console.error('❌ [DB] 添加活动日志失败:', error);
      // 不抛出错误，日志失败不应该影响主流程
    }
  }

  /**
   * 获取用户活动日志
   */
  async getActivityLogs(xhsUserId: string, limit: number = 100): Promise<ActivityLog[]> {
    const { data, error } = await this.supabase
      .from('xhs_activity_logs')
      .select('*')
      .eq('xhs_user_id', xhsUserId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('❌ [DB] 获取活动日志失败:', error);
      return [];
    }

    return data || [];
  }

  // ==================== 批量操作 ====================

  /**
   * 保存所有用户数据（一次性保存所有相关数据）
   */
  async saveAllUserData(data: {
    supabaseUuid: string;
    xhsUserId: string;
    userProfile?: Partial<UserProfile>;
    strategy?: Partial<ContentStrategy>;
    tasks?: Partial<DailyTask>[];
    weeklyPlan?: Partial<WeeklyPlan>;
    automationStatus?: Partial<AutomationStatus>;
  }): Promise<void> {
    try {
      // 保存用户配置
      if (data.userProfile) {
        await this.saveUserProfile({
          supabase_uuid: data.supabaseUuid,
          xhs_user_id: data.xhsUserId,
          ...data.userProfile,
        } as UserProfile);
      }

      // 保存内容策略
      if (data.strategy) {
        await this.saveContentStrategy({
          supabase_uuid: data.supabaseUuid,
          xhs_user_id: data.xhsUserId,
          ...data.strategy,
        } as ContentStrategy);
      }

      // 保存每日任务
      if (data.tasks && data.tasks.length > 0) {
        await this.saveDailyTasks(data.tasks.map(task => ({
          supabase_uuid: data.supabaseUuid,
          xhs_user_id: data.xhsUserId,
          ...task,
        })) as DailyTask[]);
      }

      // 保存周计划
      if (data.weeklyPlan) {
        await this.saveWeeklyPlan({
          supabase_uuid: data.supabaseUuid,
          xhs_user_id: data.xhsUserId,
          ...data.weeklyPlan,
        } as WeeklyPlan);
      }

      // 更新运营状态
      if (data.automationStatus) {
        await this.updateAutomationStatus({
          supabase_uuid: data.supabaseUuid,
          xhs_user_id: data.xhsUserId,
          ...data.automationStatus,
        } as AutomationStatus);
      }

      console.log(`✅ [DB] 所有用户数据已保存: ${data.xhsUserId}`);
    } catch (error) {
      console.error('❌ [DB] 保存用户数据失败:', error);
      throw error;
    }
  }

  /**
   * 获取所有用户数据
   */
  async getAllUserData(xhsUserId: string): Promise<{
    userProfile: UserProfile | null;
    strategy: ContentStrategy | null;
    tasks: DailyTask[];
    weeklyPlan: WeeklyPlan | null;
    automationStatus: AutomationStatus | null;
  }> {
    try {
      const [userProfile, strategy, tasks, weeklyPlan, automationStatus] = await Promise.all([
        this.getUserProfile(xhsUserId),
        this.getContentStrategy(xhsUserId),
        this.getDailyTasks(xhsUserId),
        this.getWeeklyPlan(xhsUserId),
        this.getAutomationStatus(xhsUserId),
      ]);

      return {
        userProfile,
        strategy,
        tasks,
        weeklyPlan,
        automationStatus,
      };
    } catch (error) {
      console.error('❌ [DB] 获取用户数据失败:', error);
      throw error;
    }
  }

  /**
   * 获取所有用户的 xhs_user_id 列表
   */
  async getAllUserIds(): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('xhs_user_profiles')
      .select('xhs_user_id');

    if (error) {
      console.error('❌ [DB] 获取用户列表失败:', error);
      return [];
    }

    return (data || []).map((row: any) => row.xhs_user_id);
  }

  /**
   * 清除用户所有数据
   */
  async clearUserData(xhsUserId: string): Promise<void> {
    try {
      await Promise.all([
        this.supabase.from('xhs_daily_tasks').delete().eq('xhs_user_id', xhsUserId),
        this.supabase.from('xhs_weekly_plans').delete().eq('xhs_user_id', xhsUserId),
        this.supabase.from('xhs_content_strategies').delete().eq('xhs_user_id', xhsUserId),
        this.supabase.from('xhs_automation_status').delete().eq('xhs_user_id', xhsUserId),
        this.supabase.from('xhs_activity_logs').delete().eq('xhs_user_id', xhsUserId),
        this.supabase.from('xhs_user_profiles').delete().eq('xhs_user_id', xhsUserId),
      ]);

      console.log(`✅ [DB] 用户数据已清除: ${xhsUserId}`);
    } catch (error) {
      console.error('❌ [DB] 清除用户数据失败:', error);
      throw error;
    }
  }
}
