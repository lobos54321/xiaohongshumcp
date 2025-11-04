import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface CookieRecord {
  xhs_user_id: string;
  cookies: any[];
  cookie_count: number;
  cookie_size: number;
  last_validated_at?: string;
}

export class CookieDatabaseService {
  private supabase: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    // 🔥 后端服务使用 Service Role Key 绕过RLS
    // Service Role Key 有完全访问权限，可以绕过RLS策略
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * 保存Cookie到数据库
   */
  async saveCookies(xhsUserId: string, cookies: any[]): Promise<void> {
    try {
      const cookieJson = JSON.stringify(cookies);
      const cookieSize = Buffer.byteLength(cookieJson, 'utf8');

      console.log(`[CookieDB] 保存Cookie: userId=${xhsUserId}, count=${cookies.length}, size=${cookieSize}`);

      // 🔥 从xhs_user_id解析supabase_uuid
      // user_9dee489189a644ee8fe869097846e97d_prome -> 9dee4891-89a6-44ee-8fe8-69097846e97d
      let supabaseUuid: string;
      
      if (xhsUserId.startsWith('user_') && xhsUserId.endsWith('_prome')) {
        // 提取中间的UUID部分
        const uuidPart = xhsUserId.replace('user_', '').replace('_prome', '');
        // 添加连字符: 9dee489189a644ee8fe869097846e97d -> 9dee4891-89a6-44ee-8fe8-69097846e97d
        supabaseUuid = uuidPart.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
        console.log(`[CookieDB] 从xhs_user_id解析UUID: ${supabaseUuid}`);
      } else {
        // 不是标准格式，尝试从映射表查询
        const { data: mappingData, error: mappingError } = await this.supabase
          .from('xhs_user_mapping')
          .select('supabase_uuid')
          .eq('xhs_user_id', xhsUserId)
          .single();

        if (mappingError || !mappingData) {
          console.warn(`[CookieDB] ⚠️ 无法获取UUID，跳过数据库保存: ${xhsUserId}`);
          return; // 静默失败，不影响登录流程
        }

        supabaseUuid = mappingData.supabase_uuid;
        console.log(`[CookieDB] 从mapping表查到UUID: ${supabaseUuid}`);
      }

      const { error } = await this.supabase
        .from('xhs_user_cookies')
        .upsert({
          supabase_uuid: supabaseUuid,
          xhs_user_id: xhsUserId,
          cookies: cookies,
          cookie_count: cookies.length,
          cookie_size: cookieSize,
          last_validated_at: new Date().toISOString(),
        }, {
          onConflict: 'xhs_user_id'
        });

      if (error) {
        console.error('[CookieDB] 保存失败:', error);
        return; // 静默失败，不影响登录流程
      }

      console.log(`[CookieDB] ✅ 保存成功`);
    } catch (error) {
      console.error('[CookieDB] 保存Cookie失败:', error);
      // 不抛错，不影响登录流程
    }
  }

  /**
   * 从数据库加载Cookie
   */
  async loadCookies(xhsUserId: string): Promise<any[]> {
    try {
      console.log(`[CookieDB] 加载Cookie: userId=${xhsUserId}`);

      const { data, error } = await this.supabase
        .from('xhs_user_cookies')
        .select('cookies, cookie_count, cookie_size, last_validated_at')
        .eq('xhs_user_id', xhsUserId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // 记录不存在
          console.log(`[CookieDB] 未找到Cookie记录`);
          return [];
        }
        throw error;
      }

      if (!data || !data.cookies) {
        console.log(`[CookieDB] Cookie为空`);
        return [];
      }

      console.log(`[CookieDB] ✅ 加载成功: count=${data.cookie_count}, size=${data.cookie_size}`);
      return data.cookies;
    } catch (error) {
      console.error('[CookieDB] 加载Cookie失败:', error);
      return [];
    }
  }

  /**
   * 删除Cookie
   */
  async deleteCookies(xhsUserId: string): Promise<void> {
    try {
      console.log(`[CookieDB] 删除Cookie: userId=${xhsUserId}`);

      const { error } = await this.supabase
        .from('xhs_user_cookies')
        .delete()
        .eq('xhs_user_id', xhsUserId);

      if (error) {
        throw error;
      }

      console.log(`[CookieDB] ✅ 删除成功`);
    } catch (error) {
      console.error('[CookieDB] 删除Cookie失败:', error);
      throw error;
    }
  }

  /**
   * 检查Cookie是否存在
   */
  async hasCookies(xhsUserId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('xhs_user_cookies')
        .select('cookie_count')
        .eq('xhs_user_id', xhsUserId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data !== null && data.cookie_count > 0;
    } catch (error) {
      console.error('[CookieDB] 检查Cookie失败:', error);
      return false;
    }
  }
}
