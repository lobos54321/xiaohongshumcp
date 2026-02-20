/**
 * ConfigService - 集中配置管理
 *
 * 单例模式，三级读取：内存缓存 → Supabase → process.env
 * 支持运行时动态更新，无需重启服务
 */

import { supabaseAdmin } from '../orchestrator/db/supabase.js';

interface ConfigRow {
    key: string;
    value: string;
    category: string;
    description: string | null;
    is_secret: boolean;
    updated_at: string;
    updated_by: string | null;
}

class ConfigService {
    private cache: Map<string, string> = new Map();
    private initialized = false;

    /**
     * 获取配置值：缓存 → Supabase → process.env
     */
    async get(key: string): Promise<string> {
        // 1. 内存缓存
        const cached = this.cache.get(key);
        if (cached !== undefined) return cached;

        // 2. Supabase
        try {
            const { data, error } = await supabaseAdmin
                .from('system_config')
                .select('value')
                .eq('key', key)
                .single();

            if (!error && data?.value) {
                this.cache.set(key, data.value);
                return data.value;
            }
        } catch (e) {
            // DB 不可用，fallback 到 env
        }

        // 3. process.env
        const envVal = process.env[key] || '';
        if (envVal) {
            this.cache.set(key, envVal);
        }
        return envVal;
    }

    /**
     * 设置配置值：写 DB + 更新缓存
     */
    async set(key: string, value: string, updatedBy?: string): Promise<void> {
        const { error } = await supabaseAdmin
            .from('system_config')
            .upsert({
                key,
                value,
                updated_at: new Date().toISOString(),
                updated_by: updatedBy || 'system',
            }, { onConflict: 'key' });

        if (error) {
            console.error(`[ConfigService] Failed to set ${key}:`, error.message);
            throw new Error(`Failed to set config: ${error.message}`);
        }

        this.cache.set(key, value);
        console.log(`[ConfigService] Updated ${key}`);
    }

    /**
     * 列出所有配置（secret 脱敏）
     */
    async getAll(): Promise<Array<ConfigRow>> {
        const { data, error } = await supabaseAdmin
            .from('system_config')
            .select('*')
            .order('category')
            .order('key');

        if (error) {
            console.error('[ConfigService] Failed to getAll:', error.message);
            throw new Error(`Failed to get configs: ${error.message}`);
        }

        return (data || []).map((row: ConfigRow) => ({
            ...row,
            value: row.is_secret ? '****' : row.value,
        }));
    }

    /**
     * 清除缓存
     */
    invalidateCache(key?: string): void {
        if (key) {
            this.cache.delete(key);
        } else {
            this.cache.clear();
        }
    }

    /**
     * 预热缓存：启动时加载所有配置到内存
     */
    async warmup(): Promise<void> {
        if (this.initialized) return;
        try {
            const { data } = await supabaseAdmin
                .from('system_config')
                .select('key, value');

            if (data) {
                for (const row of data) {
                    if (row.value) {
                        this.cache.set(row.key, row.value);
                    }
                }
                console.log(`[ConfigService] Warmed up ${data.length} config entries`);
            }
            this.initialized = true;
        } catch (e) {
            console.warn('[ConfigService] Warmup failed, will use env fallback');
        }
    }
}

export const configService = new ConfigService();
