/**
 * 小红书矩阵账号管理服务
 * 支持一个用户绑定多个小红书账号
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

export interface XhsAccount {
    id: string;
    xhs_session_hash: string;
    xhs_real_user_id?: string;
    nickname?: string;
    red_id?: string;
    avatar_url?: string;
    created_at: string;
    updated_at: string;
}

export interface AccountBinding {
    id: string;
    supabase_uuid: string;
    xhs_account_id: string;
    alias?: string;
    is_default: boolean;
    created_at: string;
    account?: XhsAccount;
}

export interface AccountCookie {
    id: string;
    xhs_account_id: string;
    cookies: any[];
    is_valid: boolean;
    last_validated_at?: string;
}

export class AccountService {
    private supabase: SupabaseClient;
    private static readonly MAX_ACCOUNTS_PER_USER = 10;

    constructor() {
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
            process.env.SUPABASE_ANON_KEY ||
            process.env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Supabase credentials not configured');
        }

        this.supabase = createClient(supabaseUrl, supabaseKey);
        console.log('[AccountService] ✅ 初始化成功');
    }

    /**
     * 从 web_session Cookie 生成稳定的账号哈希
     */
    static generateSessionHash(webSession: string): string {
        return crypto
            .createHash('sha256')
            .update(webSession)
            .digest('hex')
            .substring(0, 32);
    }

    /**
     * 从 Cookie 数组中提取 web_session
     */
    static extractWebSession(cookies: any[]): string | null {
        const webSessionCookie = cookies.find(c => c.name === 'web_session');
        return webSessionCookie?.value || null;
    }

    /**
     * 获取或创建小红书账号
     * 如果账号已存在，返回现有记录；否则创建新记录
     */
    async getOrCreateAccount(cookies: any[], accountInfo?: {
        nickname?: string;
        redId?: string;
        avatarUrl?: string;
        realUserId?: string;
    }): Promise<XhsAccount | null> {
        try {
            const webSession = AccountService.extractWebSession(cookies);
            if (!webSession) {
                console.error('[AccountService] Cookie中没有web_session');
                return null;
            }

            const sessionHash = AccountService.generateSessionHash(webSession);
            console.log(`[AccountService] 会话哈希: ${sessionHash.substring(0, 8)}...`);

            // 查找现有账号
            const { data: existing, error: findError } = await this.supabase
                .from('xhs_accounts')
                .select('*')
                .eq('xhs_session_hash', sessionHash)
                .single();

            if (existing && !findError) {
                console.log(`[AccountService] 找到现有账号: ${existing.id}`);

                // 更新账号信息（如果提供了新信息）
                if (accountInfo) {
                    await this.updateAccountInfo(existing.id, accountInfo);
                }

                return existing as XhsAccount;
            }

            // 创建新账号
            console.log('[AccountService] 创建新账号...');
            const { data: newAccount, error: createError } = await this.supabase
                .from('xhs_accounts')
                .insert({
                    xhs_session_hash: sessionHash,
                    xhs_real_user_id: accountInfo?.realUserId,
                    nickname: accountInfo?.nickname,
                    red_id: accountInfo?.redId,
                    avatar_url: accountInfo?.avatarUrl,
                })
                .select()
                .single();

            if (createError) {
                console.error('[AccountService] 创建账号失败:', createError);
                return null;
            }

            console.log(`[AccountService] ✅ 新账号创建成功: ${newAccount.id}`);
            return newAccount as XhsAccount;

        } catch (error: any) {
            console.error('[AccountService] getOrCreateAccount 失败:', error.message);
            return null;
        }
    }

    /**
     * 更新账号信息
     */
    private async updateAccountInfo(accountId: string, info: {
        nickname?: string;
        redId?: string;
        avatarUrl?: string;
        realUserId?: string;
    }): Promise<void> {
        try {
            const updateData: any = {};
            if (info.nickname) updateData.nickname = info.nickname;
            if (info.redId) updateData.red_id = info.redId;
            if (info.avatarUrl) updateData.avatar_url = info.avatarUrl;
            if (info.realUserId) updateData.xhs_real_user_id = info.realUserId;

            if (Object.keys(updateData).length > 0) {
                await this.supabase
                    .from('xhs_accounts')
                    .update(updateData)
                    .eq('id', accountId);
            }
        } catch (error) {
            console.error('[AccountService] 更新账号信息失败:', error);
        }
    }

    /**
     * 绑定账号到用户
     */
    async bindAccountToUser(
        supabaseUuid: string,
        xhsAccountId: string,
        options?: { alias?: string; isDefault?: boolean }
    ): Promise<boolean> {
        try {
            // 检查绑定数量
            const { count } = await this.supabase
                .from('user_xhs_account_bindings')
                .select('*', { count: 'exact', head: true })
                .eq('supabase_uuid', supabaseUuid);

            if ((count || 0) >= AccountService.MAX_ACCOUNTS_PER_USER) {
                console.error(`[AccountService] 用户已达到${AccountService.MAX_ACCOUNTS_PER_USER}个账号上限`);
                return false;
            }

            // 如果设为默认账号，先取消其他默认
            if (options?.isDefault) {
                await this.supabase
                    .from('user_xhs_account_bindings')
                    .update({ is_default: false })
                    .eq('supabase_uuid', supabaseUuid);
            }

            // 创建绑定
            const { error } = await this.supabase
                .from('user_xhs_account_bindings')
                .upsert({
                    supabase_uuid: supabaseUuid,
                    xhs_account_id: xhsAccountId,
                    alias: options?.alias,
                    is_default: options?.isDefault || false,
                }, {
                    onConflict: 'supabase_uuid,xhs_account_id',
                });

            if (error) {
                console.error('[AccountService] 绑定失败:', error);
                return false;
            }

            console.log(`[AccountService] ✅ 账号绑定成功`);
            return true;

        } catch (error: any) {
            console.error('[AccountService] bindAccountToUser 失败:', error.message);
            return false;
        }
    }

    /**
     * 获取用户的所有绑定账号
     */
    async getUserAccounts(supabaseUuid: string): Promise<AccountBinding[]> {
        try {
            const { data, error } = await this.supabase
                .from('user_xhs_account_bindings')
                .select(`
          *,
          account:xhs_accounts(*)
        `)
                .eq('supabase_uuid', supabaseUuid)
                .order('is_default', { ascending: false })
                .order('created_at', { ascending: true });

            if (error) {
                console.error('[AccountService] 获取用户账号失败:', error);
                return [];
            }

            return (data || []) as AccountBinding[];

        } catch (error: any) {
            console.error('[AccountService] getUserAccounts 失败:', error.message);
            return [];
        }
    }

    /**
     * 获取用户的默认账号
     */
    async getDefaultAccount(supabaseUuid: string): Promise<XhsAccount | null> {
        try {
            const { data, error } = await this.supabase
                .from('user_xhs_account_bindings')
                .select(`
          xhs_accounts(*)
        `)
                .eq('supabase_uuid', supabaseUuid)
                .eq('is_default', true)
                .single();

            if (error || !data) {
                // 如果没有默认账号，返回第一个
                const accounts = await this.getUserAccounts(supabaseUuid);
                return accounts[0]?.account || null;
            }

            return (data as any).xhs_accounts as XhsAccount;

        } catch (error: any) {
            console.error('[AccountService] getDefaultAccount 失败:', error.message);
            return null;
        }
    }

    /**
     * 设置默认账号
     */
    async setDefaultAccount(supabaseUuid: string, xhsAccountId: string): Promise<boolean> {
        try {
            // 取消所有默认
            await this.supabase
                .from('user_xhs_account_bindings')
                .update({ is_default: false })
                .eq('supabase_uuid', supabaseUuid);

            // 设置新默认
            const { error } = await this.supabase
                .from('user_xhs_account_bindings')
                .update({ is_default: true })
                .eq('supabase_uuid', supabaseUuid)
                .eq('xhs_account_id', xhsAccountId);

            return !error;

        } catch (error: any) {
            console.error('[AccountService] setDefaultAccount 失败:', error.message);
            return false;
        }
    }

    /**
     * 解绑账号
     */
    async unbindAccount(supabaseUuid: string, xhsAccountId: string): Promise<boolean> {
        try {
            const { error } = await this.supabase
                .from('user_xhs_account_bindings')
                .delete()
                .eq('supabase_uuid', supabaseUuid)
                .eq('xhs_account_id', xhsAccountId);

            return !error;

        } catch (error: any) {
            console.error('[AccountService] unbindAccount 失败:', error.message);
            return false;
        }
    }

    /**
     * 保存账号Cookie
     */
    async saveAccountCookies(xhsAccountId: string, cookies: any[]): Promise<boolean> {
        try {
            const cookieSize = Buffer.byteLength(JSON.stringify(cookies), 'utf8');

            const { error } = await this.supabase
                .from('xhs_account_cookies')
                .upsert({
                    xhs_account_id: xhsAccountId,
                    cookies: cookies,
                    cookie_count: cookies.length,
                    cookie_size: cookieSize,
                    is_valid: true,
                    last_validated_at: new Date().toISOString(),
                }, {
                    onConflict: 'xhs_account_id',
                });

            if (error) {
                console.error('[AccountService] 保存Cookie失败:', error);
                return false;
            }

            console.log(`[AccountService] ✅ Cookie保存成功 (${cookies.length}个)`);
            return true;

        } catch (error: any) {
            console.error('[AccountService] saveAccountCookies 失败:', error.message);
            return false;
        }
    }

    /**
     * 获取账号Cookie
     */
    async getAccountCookies(xhsAccountId: string): Promise<any[] | null> {
        try {
            const { data, error } = await this.supabase
                .from('xhs_account_cookies')
                .select('cookies, is_valid')
                .eq('xhs_account_id', xhsAccountId)
                .single();

            if (error || !data || !data.is_valid) {
                return null;
            }

            return data.cookies;

        } catch (error: any) {
            console.error('[AccountService] getAccountCookies 失败:', error.message);
            return null;
        }
    }
}

export default AccountService;
