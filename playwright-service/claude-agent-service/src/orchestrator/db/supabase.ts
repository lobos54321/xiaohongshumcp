/**
 * Orchestrator - Supabase Service Role Client
 * 
 * 用于 Orchestrator 的 service_role 权限 Supabase 客户端
 * 只有 Orchestrator 可以创建 tasks/steps
 * 
 * 🔥 使用延迟初始化避免 ES module import 时机问题
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _supabaseAdmin: SupabaseClient | null = null;

/**
 * 获取 Supabase Admin Client（延迟初始化）
 */
export function getSupabaseAdmin(): SupabaseClient {
    if (_supabaseAdmin) {
        return _supabaseAdmin;
    }

    // 读取环境变量（支持 VITE_ 前缀和无前缀两种格式）
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        console.error('[Orchestrator] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
        console.error('[Orchestrator] Available env vars:', Object.keys(process.env).filter(k => k.includes('SUPABASE')));
        throw new Error('Supabase credentials not configured');
    }

    console.log('[Orchestrator] Initializing Supabase client with URL:', SUPABASE_URL);

    _supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    return _supabaseAdmin;
}

// 向后兼容的导出（延迟代理）
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
    get(_target, prop) {
        return (getSupabaseAdmin() as any)[prop];
    }
});

/**
 * 检查 Supabase 连接
 */
export async function checkSupabaseConnection(): Promise<boolean> {
    try {
        const client = getSupabaseAdmin();
        const { error } = await client.from('xhs_accounts').select('id').limit(1);
        if (error) {
            console.error('[Orchestrator] Supabase connection error:', error.message);
            return false;
        }
        console.log('[Orchestrator] Supabase connection OK');
        return true;
    } catch (e) {
        console.error('[Orchestrator] Supabase connection failed:', e);
        return false;
    }
}
