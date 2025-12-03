/**
 * Auto AI Analysis & Email System
 * Automated daily analysis and email reporting
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as cron from 'node-cron';

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'Prome <noreply@prome.live>';

// Initialize Supabase client (service key for admin access)
let supabaseAdmin: SupabaseClient | null = null;

if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
    supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    console.log('[AUTO-ANALYSIS] Supabase admin client initialized');
} else {
    console.warn('[AUTO-ANALYSIS] Supabase not configured. Auto-analysis disabled.');
}

// Type definitions
interface UserAnalytics {
    userId: string;
    email: string;
    totalNotes: number;
    totalImpressions: number;
    totalViews: number;
    totalLikes: number;
    totalCollects: number;
    avgClickRate: number;
    avgEngagementRate: number;
    topNotes: NotePerformance[];
    trends: TrendData;
}

interface NotePerformance {
    title: string;
    feedId: string;
    publishedAt: string;
    impressions: number;
    views: number;
    likes: number;
    collects: number;
    comments: number;
    clickRate: number;
    engagementRate: number;
}

interface TrendData {
    impressionsTrend: number;
    likesTrend: number;
    collectsTrend: number;
    engagementTrend: number;
}

interface AIAnalysisResult {
    performanceScore: number;
    performanceLevel: 'excellent' | 'good' | 'average' | 'poor';
    insights: string[];
    recommendations: string[];
    highlights: string[];
    warnings: string[];
}

// ==================== Helper Functions ====================

async function getActiveUsers(): Promise<Array<{ userId: string; email: string }>> {
    if (!supabaseAdmin) return [];

    try {
        const { data, error } = await supabaseAdmin
            .from('xhs_note_analytics')
            .select('user_id')
            .gte('collected_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            .order('collected_at', { ascending: false });

        if (error) throw error;

        const userIds = [...new Set(data?.map(d => d.user_id) || [])];
        const users: Array<{ userId: string; email: string }> = [];

        for (const userId of userIds) {
            const { data: profile } = await supabaseAdmin
                .from('user_profiles')
                .select('email, email_enabled')
                .eq('user_id', userId)
                .single();

            if (profile?.email && profile.email_enabled !== false) {
                users.push({ userId, email: profile.email });
            } else {
                users.push({ userId, email: '' });
            }
        }

        console.log(`[CRON] Found ${users.length} active users`);
        return users;
    } catch (error) {
        console.error('[CRON] Failed to get active users:', error);
        return [];
    }
}

async function getUserAnalytics(userId: string): Promise<UserAnalytics | null> {
    if (!supabaseAdmin) return null;

    try {
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        const { data: thisWeekData } = await supabaseAdmin
            .from('xhs_note_analytics')
            .select('*')
            .eq('user_id', userId)
            .gte('collected_at', weekAgo.toISOString());

        const { data: lastWeekData } = await supabaseAdmin
            .from('xhs_note_analytics')
            .select('*')
            .eq('user_id', userId)
            .gte('collected_at', twoWeeksAgo.toISOString())
            .lt('collected_at', weekAgo.toISOString());

        const { data: notesData } = await supabaseAdmin
            .from('xhs_published_notes')
            .select('*')
            .eq('user_id', userId)
            .order('published_at', { ascending: false })
            .limit(20);

        const thisWeek = aggregateAnalytics(thisWeekData || []);
        const lastWeek = aggregateAnalytics(lastWeekData || []);

        const trends: TrendData = {
            impressionsTrend: calculateTrend(lastWeek.impressions, thisWeek.impressions),
            likesTrend: calculateTrend(lastWeek.likes, thisWeek.likes),
            collectsTrend: calculateTrend(lastWeek.collects, thisWeek.collects),
            engagementTrend: calculateTrend(lastWeek.engagementRate, thisWeek.engagementRate)
        };

        const topNotes = getTopPerformingNotes(thisWeekData || [], notesData || []);

        return {
            userId,
            email: '',
            totalNotes: notesData?.length || 0,
            totalImpressions: thisWeek.impressions,
            totalViews: thisWeek.views,
            totalLikes: thisWeek.likes,
            totalCollects: thisWeek.collects,
            avgClickRate: thisWeek.clickRate,
            avgEngagementRate: thisWeek.engagementRate,
            topNotes,
            trends
        };
    } catch (error) {
        console.error(`[CRON] Failed to get analytics for user ${userId}:`, error);
        return null;
    }
}

function aggregateAnalytics(data: any[]) {
    if (data.length === 0) {
        return { impressions: 0, views: 0, likes: 0, collects: 0, comments: 0, clickRate: 0, engagementRate: 0 };
    }

    const latestByNote = new Map();
    for (const item of data) {
        const key = item.feed_id || item.title_hash;
        if (!key) continue;

        const existing = latestByNote.get(key);
        if (!existing || new Date(item.collected_at) > new Date(existing.collected_at)) {
            latestByNote.set(key, item);
        }
    }

    const latestData = Array.from(latestByNote.values());
    const totals = latestData.reduce((acc, item) => ({
        impressions: acc.impressions + (item.impressions || 0),
        views: acc.views + (item.views || 0),
        likes: acc.likes + (item.likes || 0),
        collects: acc.collects + (item.collects || 0),
        comments: acc.comments + (item.comments || 0),
        clickRate: acc.clickRate + (item.click_rate || 0),
        engagementRate: acc.engagementRate + (item.engagement_rate || 0)
    }), { impressions: 0, views: 0, likes: 0, collects: 0, comments: 0, clickRate: 0, engagementRate: 0 });

    const count = latestData.length;
    return {
        ...totals,
        clickRate: count > 0 ? totals.clickRate / count : 0,
        engagementRate: count > 0 ? totals.engagementRate / count : 0
    };
}

function calculateTrend(oldValue: number, newValue: number): number {
    if (oldValue === 0) return newValue > 0 ? 100 : 0;
    return Math.round(((newValue - oldValue) / oldValue) * 100);
}

function getTopPerformingNotes(analyticsData: any[], notesData: any[]): NotePerformance[] {
    const scored = analyticsData.map(a => ({
        ...a,
        score: (a.likes || 0) + (a.collects || 0) * 2 + (a.comments || 0) * 3
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, 5).map(a => {
        const note = notesData.find(n => n.feed_id === a.feed_id || n.title_hash === a.title_hash);
        return {
            title: note?.title || '未知标题',
            feedId: a.feed_id || '',
            publishedAt: note?.published_at || '',
            impressions: a.impressions || 0,
            views: a.views || 0,
            likes: a.likes || 0,
            collects: a.collects || 0,
            comments: a.comments || 0,
            clickRate: a.click_rate || 0,
            engagementRate: a.engagement_rate || 0
        };
    });
}

function performAIAnalysis(analytics: UserAnalytics): AIAnalysisResult {
    const { totalLikes, totalCollects, avgClickRate, avgEngagementRate, totalNotes, trends } = analytics;

    let score = 50;

    if (avgClickRate > 5) score += 20;
    else if (avgClickRate > 3) score += 15;
    else if (avgClickRate > 1) score += 10;
    else if (avgClickRate > 0.5) score += 5;

    if (avgEngagementRate > 10) score += 20;
    else if (avgEngagementRate > 5) score += 15;
    else if (avgEngagementRate > 2) score += 10;
    else if (avgEngagementRate > 1) score += 5;

    if (trends.likesTrend > 20) score += 10;
    else if (trends.likesTrend > 0) score += 5;
    else if (trends.likesTrend < -20) score -= 10;

    score = Math.min(100, Math.max(0, score));

    let level: 'excellent' | 'good' | 'average' | 'poor';
    if (score >= 80) level = 'excellent';
    else if (score >= 60) level = 'good';
    else if (score >= 40) level = 'average';
    else level = 'poor';

    const insights: string[] = [];
    const recommendations: string[] = [];
    const highlights: string[] = [];
    const warnings: string[] = [];

    if (trends.impressionsTrend > 0) {
        insights.push(`📈 曝光量比上周增长 ${trends.impressionsTrend}%`);
    } else if (trends.impressionsTrend < 0) {
        insights.push(`📉 曝光量比上周下降 ${Math.abs(trends.impressionsTrend)}%`);
    }

    if (trends.likesTrend > 20) {
        highlights.push(`🎉 点赞数大幅增长 ${trends.likesTrend}%！`);
    }

    if (avgClickRate < 2) {
        warnings.push(`⚠️ 封面点击率 ${avgClickRate.toFixed(1)}% 低于平均水平`);
    }

    if (avgClickRate < 3) {
        recommendations.push('优化封面图片，使用更吸引眼球的设计');
        recommendations.push('标题尝试使用数字或疑问句式');
    }

    if (avgEngagementRate < 5) {
        recommendations.push('在内容结尾添加互动引导');
        recommendations.push('及时回复用户评论，提高互动率');
    }

    if (totalNotes < 5) {
        recommendations.push('建议增加发布频率，每天 1-2 篇效果最佳');
    }

    if (analytics.topNotes.length > 0) {
        const best = analytics.topNotes[0];
        if (best.likes > 50) {
            highlights.push(`🏆 「${best.title.substring(0, 15)}...」获得 ${best.likes} 点赞！`);
        }
    }

    return {
        performanceScore: score,
        performanceLevel: level,
        insights,
        recommendations,
        highlights,
        warnings
    };
}

async function saveAnalysisResult(userId: string, analytics: UserAnalytics, analysis: AIAnalysisResult) {
    if (!supabaseAdmin) return;

    try {
        await supabaseAdmin.from('xhs_performance_summary').insert({
            user_id: userId,
            performance_score: analysis.performanceScore,
            performance_level: analysis.performanceLevel,
            strengths: analysis.highlights,
            weaknesses: analysis.warnings,
            suggestions: analysis.recommendations,
            analyzed_at: new Date().toISOString()
        });
        console.log(`[CRON] Analysis saved for user ${userId}`);
    } catch (error) {
        console.error(`[CRON] Failed to save analysis for user ${userId}:`, error);
    }
}

async function sendEmailReport(email: string, analytics: UserAnalytics, analysis: AIAnalysisResult): Promise<boolean> {
    if (!email || !RESEND_API_KEY) {
        console.log('[EMAIL] No email or API key, skipping');
        return false;
    }

    try {
        const html = generateEmailHTML(analytics, analysis);

        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${RESEND_API_KEY}`
            },
            body: JSON.stringify({
                from: FROM_EMAIL,
                to: email,
                subject: `📊 Prome 周报 | 评分 ${analysis.performanceScore} 分 | ${getDateRangeString()}`,
                html: html
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('[EMAIL] Send failed:', errorData);
            return false;
        }

        console.log(`[EMAIL] Report sent to ${email}`);
        return true;
    } catch (error) {
        console.error('[EMAIL] Failed to send:', error);
        return false;
    }
}

function getDateRangeString(): string {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const format = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
    return `${format(weekAgo)} - ${format(now)}`;
}

function formatNumber(num: number): string {
    if (num >= 10000) return (num / 10000).toFixed(1) + '万';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
}

function generateEmailHTML(analytics: UserAnalytics, analysis: AIAnalysisResult): string {
    const levelColors: Record<string, string> = {
        excellent: '#10B981',
        good: '#3B82F6',
        average: '#F59E0B',
        poor: '#EF4444'
    };

    const levelText: Record<string, string> = {
        excellent: '优秀 🌟',
        good: '良好 👍',
        average: '一般 📊',
        poor: '需改进 💪'
    };

    const trendIcon = (trend: number) => {
        if (trend > 0) return `<span style="color: #10B981;">↑${trend}%</span>`;
        if (trend < 0) return `<span style="color: #EF4444;">↓${Math.abs(trend)}%</span>`;
        return '<span style="color: #6B7280;">-</span>';
    };

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prome 周报</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F3F4F6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px 16px 0 0; padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px;">📊 Prome 小红书周报</h1>
      <p style="color: rgba(255,255,255,0.8); margin: 10px 0 0 0; font-size: 14px;">${getDateRangeString()}</p>
    </div>
    
    <!-- Score Card -->
    <div style="background: white; padding: 30px; text-align: center; border-bottom: 1px solid #E5E7EB;">
      <div style="font-size: 64px; font-weight: bold; color: ${levelColors[analysis.performanceLevel]};">
        ${analysis.performanceScore}
      </div>
      <div style="font-size: 18px; color: ${levelColors[analysis.performanceLevel]}; margin-top: 5px;">
        ${levelText[analysis.performanceLevel]}
      </div>
      <p style="color: #6B7280; margin-top: 10px; font-size: 14px;">综合表现评分</p>
    </div>
    
    <!-- Stats Grid -->
    <div style="background: white; padding: 20px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
      <div style="background: #F9FAFB; border-radius: 12px; padding: 15px; text-align: center;">
        <div style="font-size: 24px; font-weight: bold; color: #1F2937;">${formatNumber(analytics.totalImpressions)}</div>
        <div style="font-size: 12px; color: #6B7280; margin-top: 4px;">总曝光 ${trendIcon(analytics.trends.impressionsTrend)}</div>
      </div>
      <div style="background: #F9FAFB; border-radius: 12px; padding: 15px; text-align: center;">
        <div style="font-size: 24px; font-weight: bold; color: #1F2937;">${formatNumber(analytics.totalViews)}</div>
        <div style="font-size: 12px; color: #6B7280; margin-top: 4px;">总观看</div>
      </div>
      <div style="background: #F9FAFB; border-radius: 12px; padding: 15px; text-align: center;">
        <div style="font-size: 24px; font-weight: bold; color: #EF4444;">${formatNumber(analytics.totalLikes)}</div>
        <div style="font-size: 12px; color: #6B7280; margin-top: 4px;">总点赞 ${trendIcon(analytics.trends.likesTrend)}</div>
      </div>
      <div style="background: #F9FAFB; border-radius: 12px; padding: 15px; text-align: center;">
        <div style="font-size: 24px; font-weight: bold; color: #F59E0B;">${formatNumber(analytics.totalCollects)}</div>
        <div style="font-size: 12px; color: #6B7280; margin-top: 4px;">总收藏 ${trendIcon(analytics.trends.collectsTrend)}</div>
      </div>
    </div>
    
    ${analysis.highlights.length > 0 ? `
    <!-- Highlights -->
    <div style="background: #ECFDF5; padding: 20px; border-left: 4px solid #10B981;">
      <h3 style="margin: 0 0 10px 0; color: #065F46; font-size: 14px;">✨ 本周亮点</h3>
      ${analysis.highlights.map(h => `<p style="margin: 5px 0; color: #047857; font-size: 14px;">${h}</p>`).join('')}
    </div>
    ` : ''}
    
    ${analysis.warnings.length > 0 ? `
    <!-- Warnings -->
    <div style="background: #FEF3C7; padding: 20px; border-left: 4px solid #F59E0B;">
      <h3 style="margin: 0 0 10px 0; color: #92400E; font-size: 14px;">⚠️ 需要关注</h3>
      ${analysis.warnings.map(w => `<p style="margin: 5px 0; color: #B45309; font-size: 14px;">${w}</p>`).join('')}
    </div>
    ` : ''}
    
    ${analytics.topNotes.length > 0 ? `
    <!-- Top Notes -->
    <div style="background: white; padding: 20px;">
      <h3 style="margin: 0 0 15px 0; color: #1F2937; font-size: 16px;">🏆 表现最佳笔记</h3>
      ${analytics.topNotes.slice(0, 3).map((note, i) => `
        <div style="display: flex; align-items: center; padding: 12px 0; ${i < 2 ? 'border-bottom: 1px solid #E5E7EB;' : ''}">
          <div style="width: 24px; height: 24px; background: ${i === 0 ? '#FCD34D' : i === 1 ? '#D1D5DB' : '#F59E0B'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; color: ${i === 0 ? '#92400E' : '#374151'}; margin-right: 12px;">
            ${i + 1}
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-size: 14px; color: #1F2937; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${note.title}</div>
            <div style="font-size: 12px; color: #6B7280; margin-top: 2px;">
              ❤️ ${note.likes} · ⭐ ${note.collects} · 💬 ${note.comments}
            </div>
          </div>
        </div>
      `).join('')}
    </div>
    ` : ''}
    
    <!-- Recommendations -->
    <div style="background: white; padding: 20px;">
      <h3 style="margin: 0 0 15px 0; color: #1F2937; font-size: 16px;">💡 优化建议</h3>
      ${analysis.recommendations.slice(0, 4).map(r => `
        <div style="display: flex; align-items: flex-start; margin-bottom: 10px;">
          <span style="color: #10B981; margin-right: 8px;">✓</span>
          <span style="color: #4B5563; font-size: 14px;">${r}</span>
        </div>
      `).join('')}
    </div>
    
    <!-- CTA -->
    <div style="background: white; padding: 30px; text-align: center; border-radius: 0 0 16px 16px;">
      <a href="https://www.prome.live/analytics" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 12px 30px; border-radius: 8px; font-weight: 500; font-size: 14px;">
        查看详细数据 →
      </a>
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 20px;">
        此邮件由 Prome 自动发送 | <a href="https://www.prome.live/settings" style="color: #9CA3AF;">取消订阅</a>
      </p>
    </div>
    
  </div>
</body>
</html>
  `;
}

// ==================== Main Analysis Function ====================

export async function runDailyAnalysis() {
    console.log('[CRON] Starting daily analysis...');

    if (!supabaseAdmin) {
        console.log('[CRON] Supabase not configured, skipping');
        return;
    }

    const users = await getActiveUsers();
    let successCount = 0;
    let emailCount = 0;

    for (const user of users) {
        try {
            const analytics = await getUserAnalytics(user.userId);
            if (!analytics) continue;

            analytics.email = user.email;
            const analysis = performAIAnalysis(analytics);

            await saveAnalysisResult(user.userId, analytics, analysis);
            successCount++;

            if (user.email) {
                const sent = await sendEmailReport(user.email, analytics, analysis);
                if (sent) emailCount++;
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            console.error(`[CRON] Failed to process user ${user.userId}:`, error);
        }
    }

    console.log(`[CRON] Daily analysis completed: ${successCount} users analyzed, ${emailCount} emails sent`);
}

// ==================== Cron Initialization ====================

export function initCronJobs() {
    if (!supabaseAdmin) {
        console.log('[CRON] Skipping cron initialization (Supabase not configured)');
        return;
    }

    cron.schedule('0 1 * * *', async () => {
        console.log('[CRON] Daily analysis job triggered');
        await runDailyAnalysis();
    }, {
        timezone: 'Asia/Shanghai'
    });

    console.log('[CRON] Daily analysis job scheduled for 9:00 AM (Asia/Shanghai)');
}

// ==================== Test Functions ====================

export async function sendTestEmail(email: string) {
    const testAnalytics: UserAnalytics = {
        userId: 'test',
        email: email,
        totalNotes: 15,
        totalImpressions: 12500,
        totalViews: 3200,
        totalLikes: 186,
        totalCollects: 92,
        avgClickRate: 3.5,
        avgEngagementRate: 5.8,
        topNotes: [
            {
                title: '5个提高效率的小技巧，第3个太实用了！',
                feedId: 'test1',
                publishedAt: '',
                impressions: 2500,
                views: 800,
                likes: 45,
                collects: 28,
                comments: 12,
                clickRate: 4.2,
                engagementRate: 10.6
            },
            {
                title: '分享我的日常护肤流程 🧴',
                feedId: 'test2',
                publishedAt: '',
                impressions: 1800,
                views: 520,
                likes: 32,
                collects: 18,
                comments: 8,
                clickRate: 3.8,
                engagementRate: 11.2
            }
        ],
        trends: {
            impressionsTrend: 15,
            likesTrend: 28,
            collectsTrend: 12,
            engagementTrend: 8
        }
    };

    const testAnalysis: AIAnalysisResult = {
        performanceScore: 72,
        performanceLevel: 'good',
        insights: ['📈 曝光量比上周增长 15%', '互动率保持稳定'],
        recommendations: [
            '优化封面图片，使用更吸引眼球的设计',
            '标题尝试使用数字或疑问句式',
            '在内容结尾添加互动引导'
        ],
        highlights: ['🎉 点赞数大幅增长 28%！', '🏆 「5个提高效率的小技巧...」获得 45 点赞！'],
        warnings: []
    };

    return await sendEmailReport(email, testAnalytics, testAnalysis);
}

export async function triggerAnalysisForUser(userId: string, sendEmail: boolean = false) {
    if (!supabaseAdmin) {
        throw new Error('Supabase not configured');
    }

    const analytics = await getUserAnalytics(userId);
    if (!analytics) {
        throw new Error('User not found or no data');
    }

    const analysis = performAIAnalysis(analytics);
    await saveAnalysisResult(userId, analytics, analysis);

    if (sendEmail && analytics.email) {
        await sendEmailReport(analytics.email, analytics, analysis);
    }

    return analysis;
}
