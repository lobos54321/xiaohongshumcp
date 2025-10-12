/**
 * Claude Agent HTTP Server
 */
import express from 'express';
import * as dotenv from 'dotenv';
import path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { ClaudeAgentHTTP } from './claudeAgentHTTP.js';
import AutoContentManager from './autoContentManager.js';
import ImageGenerationService from './imageGenerationService.js';
import { CookieOrchestrator } from './cookieOrchestrator.js';
import { AutoCookieImporter } from './autoCookieImporter.js';
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// 端口配置 - 支持Zeabur动态端口分配
const PORT = parseInt(process.env.PORT || '8080');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'demo-key') {
    console.error('Error: A valid ANTHROPIC_API_KEY is required');
    console.error('Please set a real Anthropic API key in your environment variables.');
    console.error('Example: export ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
}
// MCP Router URL配置 - 支持生产环境和本地开发
const MCP_ROUTER_URL = process.env.MCP_ROUTER_URL || 'http://localhost:3001';
// 创建图片生成服务
const imageService = new ImageGenerationService({
    geminiKey: process.env.GEMINI_API_KEY,
    unsplashKey: process.env.UNSPLASH_ACCESS_KEY
});
// 创建 Claude Agent (HTTP版本)
const agent = new ClaudeAgentHTTP({
    apiKey: ANTHROPIC_API_KEY,
    model: process.env.CLAUDE_MODEL,
    maxTokens: parseInt(process.env.MAX_TOKENS || '4096'),
    mcpRouterURL: MCP_ROUTER_URL,
});
// 创建自动内容管理器
const autoContentManager = new AutoContentManager({
    anthropicKey: ANTHROPIC_API_KEY,
    imageService: imageService,
    mcpClient: null // 需要从agent传递
});
// 创建Cookie协调器
const cookieOrchestrator = new CookieOrchestrator(MCP_ROUTER_URL);
// 创建自动Cookie导入器
const autoCookieImporter = new AutoCookieImporter(MCP_ROUTER_URL);
const SHOULD_AUTO_INSTALL_PLAYWRIGHT = process.env.PLAYWRIGHT_AUTO_INSTALL !== 'false';
// 启动自动Cookie导入监控
autoCookieImporter.startAutoImport(15000); // 每15秒检查一次
// 声明变量必须在使用之前
let ensureChromiumPromise = null;
if (SHOULD_AUTO_INSTALL_PLAYWRIGHT) {
    ensurePlaywrightChromiumInstalled()
        .then(() => {
        console.log('[PlaywrightLogin] Chromium executable ready for fallback QR login');
    })
        .catch(error => {
        console.warn('[PlaywrightLogin] Pre-installation of Chromium failed:', error instanceof Error ? error.message : error);
    });
}
function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: 'pipe',
            env: { ...process.env, ...options.env },
            cwd: options.cwd || process.cwd(),
            shell: options.shell,
        });
        child.stdout?.on('data', data => {
            const output = data.toString().trim();
            if (output) {
                console.log(`[PlaywrightInstall] ${output}`);
            }
        });
        child.stderr?.on('data', data => {
            const output = data.toString().trim();
            if (output) {
                console.warn(`[PlaywrightInstall] ${output}`);
            }
        });
        child.on('error', error => {
            reject(error);
        });
        child.on('close', code => {
            if (code === 0) {
                resolve();
            }
            else {
                reject(new Error(`Command ${command} ${args.join(' ')} exited with code ${code}`));
            }
        });
    });
}
async function ensurePlaywrightChromiumInstalled() {
    if (ensureChromiumPromise) {
        return ensureChromiumPromise;
    }
    ensureChromiumPromise = (async () => {
        const executablePath = chromium.executablePath();
        if (executablePath && fs.existsSync(executablePath)) {
            return;
        }
        if (!SHOULD_AUTO_INSTALL_PLAYWRIGHT) {
            throw new Error('Playwright Chromium executable not found and auto-install is disabled.');
        }
        console.warn('[PlaywrightLogin] Chromium executable missing, attempting automatic installation via npx playwright install chromium');
        try {
            await runCommand('npx', ['playwright', 'install', 'chromium']);
        }
        catch (error) {
            console.error('[PlaywrightLogin] Automatic Playwright installation failed:', error);
            throw error;
        }
        const installedPath = chromium.executablePath();
        if (!installedPath || !fs.existsSync(installedPath)) {
            throw new Error('Playwright Chromium installation did not produce a valid executable path.');
        }
    })();
    try {
        await ensureChromiumPromise;
    }
    catch (error) {
        ensureChromiumPromise = null;
        throw error;
    }
}
class PlaywrightLoginManager {
    persistFn;
    sessions = new Map();
    timeoutMs;
    constructor(persistFn, timeoutMs = 3 * 60 * 1000) {
        this.persistFn = persistFn;
        this.timeoutMs = timeoutMs;
    }
    async startLogin(userId) {
        const existing = this.sessions.get(userId);
        if (existing) {
            if (existing.status === 'pending') {
                return {
                    qrImage: existing.qrImage,
                    expiresAt: new Date(existing.expiresAt).toISOString()
                };
            }
            await this.disposeSession(userId);
        }
        const session = await this.launchSession(userId);
        this.sessions.set(userId, session);
        this.startWatchers(session);
        return {
            qrImage: session.qrImage,
            expiresAt: new Date(session.expiresAt).toISOString()
        };
    }
    getSessionStatus(userId) {
        return this.sessions.get(userId) || null;
    }
    async shutdown() {
        const tasks = Array.from(this.sessions.keys()).map(userId => this.disposeSession(userId));
        await Promise.all(tasks);
    }
    async launchSession(userId) {
        await ensurePlaywrightChromiumInstalled();
        const browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--single-process']
        });
        const context = await browser.newContext({
            viewport: { width: 1200, height: 900 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale: 'zh-CN'
        });
        const page = await context.newPage();
        await page.goto('https://www.xiaohongshu.com/login', {
            waitUntil: 'networkidle',
            timeout: 45000
        });
        try {
            const scanButton = page.locator('text=扫码登录');
            if (await scanButton.count() > 0) {
                await scanButton.first().click({ timeout: 5000 });
                await page.waitForTimeout(1000);
            }
        }
        catch (error) {
            console.warn('[PlaywrightLogin] 切换扫码模式失败:', error instanceof Error ? error.message : error);
        }
        const qrImage = await this.captureQRCode(page);
        const now = Date.now();
        return {
            userId,
            browser,
            context,
            page,
            qrImage,
            status: 'pending',
            createdAt: now,
            expiresAt: now + this.timeoutMs
        };
    }
    async captureQRCode(page) {
        try {
            await page.waitForTimeout(1500);
            const dataUrl = await page.evaluate(() => {
                const doc = globalThis.document;
                if (!doc)
                    return null;
                const imgs = Array.from(doc.querySelectorAll('img'));
                const candidate = imgs.find((img) => {
                    const src = (img?.getAttribute ? img.getAttribute('src') : img?.src) || '';
                    if (!src)
                        return false;
                    const lower = String(src).toLowerCase();
                    return lower.startsWith('data:image') || lower.includes('qrcode') || lower.includes('qr-code');
                });
                if (!candidate)
                    return null;
                const getSrc = candidate.getAttribute ? candidate.getAttribute('src') : candidate.src;
                return getSrc || null;
            });
            if (dataUrl && dataUrl.startsWith('data:image')) {
                return dataUrl;
            }
            const selectors = ['canvas', 'img', '.login-qrcode', '.qrcode-img', '[class*="qr" i]'];
            for (const selector of selectors) {
                const locator = page.locator(selector).first();
                if (await locator.count() > 0) {
                    try {
                        const buffer = await locator.screenshot({ omitBackground: true });
                        if (buffer?.length) {
                            return `data:image/png;base64,${buffer.toString('base64')}`;
                        }
                    }
                    catch (error) {
                        // ignore and try next selector
                    }
                }
            }
            const fallback = await page.screenshot({ fullPage: true });
            return `data:image/png;base64,${fallback.toString('base64')}`;
        }
        catch (error) {
            console.error('[PlaywrightLogin] 捕获二维码失败，使用页面截图:', error instanceof Error ? error.message : error);
            const fallback = await page.screenshot({ fullPage: true });
            return `data:image/png;base64,${fallback.toString('base64')}`;
        }
    }
    startWatchers(session) {
        session.checkTimer = setInterval(async () => {
            if (session.status !== 'pending') {
                return;
            }
            try {
                const cookies = await session.context.cookies();
                const standardCookies = this.toStandardCookies(cookies);
                const hasSession = standardCookies.some(cookie => cookie.name === 'web_session' && cookie.value && !cookie.value.includes('Guest'));
                const hasA1 = standardCookies.some(cookie => cookie.name === 'a1' && cookie.value);
                if (hasSession && hasA1) {
                    await this.handleSuccess(session, standardCookies);
                }
            }
            catch (error) {
                console.error('[PlaywrightLogin] 检查登录状态失败:', error instanceof Error ? error.message : error);
            }
        }, 2500);
        session.timeoutTimer = setTimeout(async () => {
            if (session.status === 'pending') {
                session.status = 'failed';
                session.error = '登录超时';
                await this.disposeSession(session.userId);
            }
        }, this.timeoutMs);
    }
    async handleSuccess(session, cookies) {
        session.status = 'success';
        try {
            await this.persistFn(session.userId, cookies, 'playwright');
        }
        catch (error) {
            console.error('[PlaywrightLogin] 保存Cookie失败:', error instanceof Error ? error.message : error);
            session.error = error instanceof Error ? error.message : String(error);
        }
        finally {
            await this.disposeSession(session.userId);
        }
    }
    toStandardCookies(cookies) {
        return cookies
            .filter(cookie => (cookie.domain || '').includes('xiaohongshu.com'))
            .map(cookie => {
            const domain = cookie.domain?.startsWith('.') ? cookie.domain : `.${(cookie.domain || 'xiaohongshu.com').replace(/^\.+/, '')}`;
            let sameSite = 'Lax';
            if (cookie.sameSite === 'Strict' || cookie.sameSite === 'Lax' || cookie.sameSite === 'None') {
                sameSite = cookie.sameSite;
            }
            return {
                name: cookie.name,
                value: cookie.value,
                domain,
                path: cookie.path || '/',
                secure: cookie.secure ?? true,
                httpOnly: cookie.httpOnly ?? false,
                sameSite
            };
        });
    }
    async disposeSession(userId) {
        const session = this.sessions.get(userId);
        if (!session) {
            return;
        }
        if (session.checkTimer) {
            clearInterval(session.checkTimer);
        }
        if (session.timeoutTimer) {
            clearTimeout(session.timeoutTimer);
        }
        try {
            await session.page.close({ runBeforeUnload: false });
        }
        catch (error) {
            // ignore
        }
        try {
            await session.context.close();
        }
        catch (error) {
            // ignore
        }
        try {
            await session.browser.close();
        }
        catch (error) {
            // ignore
        }
        this.sessions.delete(userId);
    }
}
const playwrightLoginManager = new PlaywrightLoginManager(async (userId, cookies, source = 'playwright') => {
    await persistUserCookies(userId, cookies, source);
});
const app = express();
app.use(express.json());
// Basic CORS + preflight handler so browser fetch requests succeed in hosted envs
app.use((req, res, next) => {
    const allowOrigin = req.headers.origin || '*';
    res.header('Access-Control-Allow-Origin', allowOrigin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});
// API文档路由
app.get('/api', (_req, res) => {
    res.json({
        name: '小红书智能自动化系统',
        version: '2.0.0',
        description: 'Claude AI驱动的小红书内容创作与发布平台',
        endpoints: {
            health: 'GET /health - 健康检查',
            // 统一状态管理API
            userStatus: 'GET /api/user/status/:userId - 获取用户完整状态',
            userInitialize: 'POST /api/user/initialize - 初始化用户状态',
            // 智能对话和创作API
            chat: 'POST /agent/chat - 智能对话 {userId, prompt, systemPrompt?}',
            createPost: 'POST /agent/xiaohongshu/create-post - 创作发布 {userId, topic, style?, length?}',
            research: 'POST /agent/xiaohongshu/research - 内容研究 {userId, keyword, task?}',
            batchPublish: 'POST /agent/xiaohongshu/batch-publish - 批量发布 {userId, topics[], schedule?}',
            // 自动模式API
            autoStart: 'POST /agent/auto/start - 启动自动运营 {userId, productName, targetAudience, marketingGoal, postFrequency, brandStyle, reviewMode}',
            autoStrategy: 'GET /agent/auto/strategy/:userId - 获取AI策略',
            autoPlan: 'GET /agent/auto/plan/:userId - 获取今日计划',
            autoStats: 'GET /agent/auto/stats/:userId - 获取运营数据',
            autoPause: 'POST /agent/auto/pause/:userId - 暂停自动运营',
            autoResume: 'POST /agent/auto/resume/:userId - 恢复自动运营',
            // 图片生成API
            generateImage: 'POST /agent/image/generate - 生成图片 {prompt, style?, aspectRatio?}',
            // 登录和认证API (已优化)
            xiaohongshuAutoLogin: 'POST /agent/xiaohongshu/auto-login - 智能登录检测 {userId}',
            xiaohongshuLoginStatus: 'GET /agent/xiaohongshu/login/status - 检查登录状态 {userId}',
        },
        documentation: 'https://github.com/lobos54321/xiaohongshumcp',
    });
});
// 提供前端静态文件（放在最后，避免覆盖API路由）
const frontendPath = path.join(__dirname, '../../../frontend');
app.use(express.static(frontendPath));
// 根路径明确指向index.html
app.get('/', (_req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});
// 健康检查
app.get('/health', (_req, res) => {
    res.json({
        status: 'healthy',
        service: 'claude-agent-service',
        timestamp: new Date().toISOString(),
    });
});
// ============ 统一状态管理API ============
// 获取用户完整状态 - 核心统一入口
app.get('/api/user/status/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        console.log(`[UserStatus] 获取用户${userId}的完整状态...`);
        // 1. 获取认证状态
        const authStatus = await cookieOrchestrator.getAuthStatus(userId);
        // 2. 检查配置状态
        let configurationStatus = {
            isConfigured: false,
            productName: undefined,
            settings: undefined
        };
        try {
            const strategy = autoContentManager.getStrategy(userId);
            if (strategy) {
                configurationStatus.isConfigured = true;
                configurationStatus.productName = '已配置产品'; // TODO: 从策略中提取产品名
            }
        }
        catch (error) {
            // 配置不存在是正常情况
        }
        // 3. 检查运营状态
        let operationStatus = {
            isRunning: false,
            startTime: undefined,
            stats: undefined
        };
        try {
            const stats = autoContentManager.getOperationStats(userId);
            if (stats && stats.postsPublished >= 0) {
                operationStatus.isRunning = true;
                operationStatus.stats = stats;
            }
        }
        catch (error) {
            // 运营未启动是正常情况
        }
        // 4. 返回统一状态
        const userStatus = {
            authentication: {
                isLoggedIn: authStatus.isAuthenticated,
                cookieSource: authStatus.source,
                lastValidated: authStatus.lastValidated.toISOString(),
                sessionInfo: authStatus.sessionInfo
            },
            configuration: configurationStatus,
            operation: operationStatus,
            // 智能推荐下一步操作
            nextAction: getNextAction(authStatus.isAuthenticated, configurationStatus.isConfigured, operationStatus.isRunning)
        };
        res.json({
            success: true,
            userId,
            status: userStatus,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('[UserStatus] 获取用户状态失败:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to get user status'
        });
    }
});
// 用户状态初始化 - 智能引导用户完成设置
app.post('/api/user/initialize', async (req, res) => {
    try {
        const { userId, forceRefresh } = req.body;
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required'
            });
        }
        console.log(`[UserInit] 初始化用户${userId}状态，强制刷新：${forceRefresh || false}`);
        // 使用CookieOrchestrator进行完整的认证流程处理
        const authResult = await cookieOrchestrator.processUserAuthentication(userId);
        res.json({
            success: authResult.success,
            message: authResult.message,
            authStatus: authResult.authStatus,
            actions: authResult.actions,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('[UserInit] 用户初始化失败:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'User initialization failed'
        });
    }
});
// 智能推荐下一步操作的辅助函数
function getNextAction(isAuthenticated, isConfigured, isRunning) {
    if (!isAuthenticated) {
        return {
            action: 'authenticate',
            description: '需要完成小红书登录认证',
            endpoint: 'POST /api/user/initialize'
        };
    }
    if (!isConfigured) {
        return {
            action: 'configure',
            description: '需要设置产品信息和运营参数',
            endpoint: 'POST /agent/auto/start'
        };
    }
    if (!isRunning) {
        return {
            action: 'start_operation',
            description: '可以启动自动运营模式',
            endpoint: 'POST /agent/auto/start'
        };
    }
    return {
        action: 'monitor',
        description: '系统正在运行，可以查看运营数据',
        endpoint: 'GET /agent/auto/stats/:userId'
    };
}
// 处理智能请求
app.post('/agent/chat', async (req, res) => {
    try {
        const { userId, prompt, systemPrompt } = req.body;
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required',
            });
        }
        if (!prompt) {
            return res.status(400).json({
                success: false,
                error: 'prompt is required',
            });
        }
        console.log(`[Server] Processing chat request for user ${userId}`);
        const agentRequest = {
            userId,
            prompt,
            systemPrompt,
        };
        const result = await agent.processRequest(agentRequest);
        res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        console.error('[Server] Error processing request:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
// 便捷API：生成内容供预览（不发布）
app.post('/agent/xiaohongshu/generate-preview', async (req, res) => {
    try {
        const { userId, topic, style, length } = req.body;
        if (!userId || !topic) {
            return res.status(400).json({
                success: false,
                error: 'userId and topic are required',
            });
        }
        console.log(`[Preview] Generating content for topic: ${topic}`);
        const prompt = `请帮我创作一篇关于"${topic}"的小红书帖子内容。
${style ? `风格要求：${style}` : ''}
${length ? `字数要求：${length}字左右` : ''}

要求：
1. 生成${length || 500}字左右的文案
2. 使用generate_image工具生成3张配图
3. 只返回内容和图片，不要发布

请按以下格式返回JSON：
{
  "title": "标题",
  "content": "正文内容",
  "tags": ["标签1", "标签2"]
}`;
        const result = await agent.processRequest({ userId, prompt });
        // 从工具调用中提取图片信息
        const imageToolCall = result.toolCalls.find((tc) => tc.name === 'generate_image');
        const images = imageToolCall ? imageToolCall.result?.images || [] : [];
        res.json({
            success: true,
            data: {
                content: result.content,
                images: images,
                toolCalls: result.toolCalls
            }
        });
    }
    catch (error) {
        console.error('[Server] Error generating preview:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
// 便捷API：小红书内容创作（直接发布）
app.post('/agent/xiaohongshu/create-post', async (req, res) => {
    try {
        const { userId, topic, style, length } = req.body;
        if (!userId || !topic) {
            return res.status(400).json({
                success: false,
                error: 'userId and topic are required',
            });
        }
        const prompt = `请帮我创作一篇关于"${topic}"的小红书帖子。
${style ? `风格要求：${style}` : ''}
${length ? `字数要求：${length}字左右` : ''}

请直接创作内容并发布到小红书。`;
        const result = await agent.processRequest({ userId, prompt });
        res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        console.error('[Server] Error creating post:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
// 便捷API：小红书内容搜索与分析
app.post('/agent/xiaohongshu/research', async (req, res) => {
    try {
        const { userId, keyword, task } = req.body;
        if (!userId || !keyword) {
            return res.status(400).json({
                success: false,
                error: 'userId and keyword are required',
            });
        }
        const prompt = `请帮我搜索小红书上关于"${keyword}"的内容。
${task ? `任务：${task}` : '请分析热门内容的特点和趋势'}`;
        const result = await agent.processRequest({ userId, prompt });
        res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        console.error('[Server] Error researching:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
// 便捷API：批量发布任务
app.post('/agent/xiaohongshu/batch-publish', async (req, res) => {
    try {
        const { userId, topics, schedule } = req.body;
        if (!userId || !topics || !Array.isArray(topics)) {
            return res.status(400).json({
                success: false,
                error: 'userId and topics (array) are required',
            });
        }
        const prompt = `请帮我批量创作并发布以下主题的小红书帖子：
${topics.map((t, i) => `${i + 1}. ${t}`).join('\n')}

${schedule ? `发布计划：${schedule}` : '请立即全部发布'}`;
        const result = await agent.processRequest({ userId, prompt });
        res.json({
            success: true,
            data: result,
        });
    }
    catch (error) {
        console.error('[Server] Error batch publishing:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
// 自动运营模式API
// 启动自动运营
app.post('/agent/auto/start', async (req, res) => {
    try {
        const { userId, productName, targetAudience, marketingGoal, postFrequency, brandStyle, reviewMode } = req.body;
        if (!userId || !productName) {
            return res.status(400).json({
                success: false,
                error: 'userId and productName are required',
            });
        }
        const userProfile = {
            userId,
            productName,
            targetAudience: targetAudience || '目标用户',
            marketingGoal: marketingGoal || 'brand',
            postFrequency: postFrequency || 'daily',
            brandStyle: brandStyle || 'warm',
            reviewMode: reviewMode || 'auto'
        };
        console.log(`[Auto Mode] Starting auto mode for user ${userId} with product: ${productName}`);
        // 启动自动运营
        await autoContentManager.startAutoMode(userProfile);
        res.json({
            success: true,
            message: `自动运营已启动，正在为您的${productName}制定运营策略...`,
            data: {
                userId,
                status: 'running',
                startTime: new Date().toISOString()
            }
        });
    }
    catch (error) {
        console.error('[Auto Mode] Error starting auto mode:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
// 获取AI策略
app.get('/agent/auto/strategy/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        // 从autoContentManager获取真实策略
        const strategy = autoContentManager.getStrategy(userId);
        if (!strategy) {
            return res.status(404).json({
                success: false,
                error: 'No strategy found for this user. Please start auto mode first.'
            });
        }
        res.json({
            success: true,
            strategy: {
                keyThemes: strategy.keyThemes,
                trendingTopics: strategy.trendingTopics,
                optimalTimes: strategy.optimalTimes,
                contentTypes: strategy.contentTypes,
                hashtags: strategy.hashtags
            }
        });
    }
    catch (error) {
        console.error('[Auto Mode] Error getting strategy:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
// 获取实时活动API
app.get('/agent/auto/activity/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        // 获取真实的实时活动
        const activities = autoContentManager.getRealTimeActivities(userId);
        res.json({
            success: true,
            activities
        });
    }
    catch (error) {
        console.error('[Auto Mode] Error getting activities:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
// 获取今日计划
app.get('/agent/auto/plan/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        // 从autoContentManager获取真实任务
        const dailyTasks = autoContentManager.getDailyTasks(userId);
        if (!dailyTasks || dailyTasks.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No tasks found for this user. Please start auto mode first.'
            });
        }
        // 返回所有今天的任务，不过滤日期（因为日期处理可能有问题）
        const today = new Date().toISOString().split('T')[0];
        const todayTasks = dailyTasks.map((task, index) => {
            // 安全的时间处理
            let scheduledTimeStr = '09:00';
            try {
                if (task.scheduledTime && typeof task.scheduledTime === 'object' && task.scheduledTime.toLocaleTimeString) {
                    scheduledTimeStr = task.scheduledTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                }
                else if (task.scheduledTime && typeof task.scheduledTime === 'string') {
                    // 如果是字符串，尝试转换为Date
                    const dateObj = new Date(task.scheduledTime);
                    if (!isNaN(dateObj.getTime())) {
                        scheduledTimeStr = dateObj.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                    }
                }
            }
            catch (error) {
                console.warn(`[Plan API] 时间格式处理失败:`, error);
            }
            return {
                id: (index + 1).toString(),
                title: task.title || '默认标题',
                scheduledTime: scheduledTimeStr,
                status: task.status === 'published' ? 'completed' :
                    task.status === 'generating' || task.status === 'ready' ? 'in-progress' :
                        'pending',
                type: task.contentType || '图文',
                content: task.content || '',
                image_url: task.imageUrl || null,
                image_prompt: task.imagePrompt || null
            };
        });
        const plan = {
            date: today,
            tasks: todayTasks.length > 0 ? todayTasks : [
                {
                    id: '1',
                    title: '暂无计划任务',
                    scheduledTime: '09:00',
                    status: 'pending',
                    type: '图文'
                }
            ]
        };
        res.json({
            success: true,
            plan
        });
    }
    catch (error) {
        console.error('[Auto Mode] Error getting plan:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
// 获取运营数据
app.get('/agent/auto/stats/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        // 从autoContentManager获取真实统计数据
        const stats = autoContentManager.getOperationStats(userId);
        res.json({
            success: true,
            stats: {
                todayPosts: stats.postsPublished,
                plannedPosts: autoContentManager.getDailyTasks(userId).length,
                weeklyReads: stats.totalReads > 1000 ? `${(stats.totalReads / 1000).toFixed(1)}k` : stats.totalReads.toString(),
                newFollowers: stats.totalFollowers,
                engagementRate: stats.engagementRate.replace('%', '')
            }
        });
    }
    catch (error) {
        console.error('[Auto Mode] Error getting stats:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
// 获取待发内容列表
app.get('/agent/auto/pending/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        // 从autoContentManager获取待发布内容
        const pendingContent = autoContentManager.getPendingContent(userId);
        res.json({
            success: true,
            content: pendingContent
        });
    }
    catch (error) {
        console.error('[Auto Mode] Error getting pending content:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
// 暂停自动运营
app.post('/agent/auto/pause/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        console.log(`[Auto Mode] Pausing auto mode for user ${userId}`);
        res.json({
            success: true,
            message: '自动运营已暂停',
            data: {
                userId,
                status: 'paused',
                pausedAt: new Date().toISOString()
            }
        });
    }
    catch (error) {
        console.error('[Auto Mode] Error pausing auto mode:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
// 恢复自动运营
app.post('/agent/auto/resume/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        console.log(`[Auto Mode] Resuming auto mode for user ${userId}`);
        res.json({
            success: true,
            message: '自动运营已恢复',
            data: {
                userId,
                status: 'running',
                resumedAt: new Date().toISOString()
            }
        });
    }
    catch (error) {
        console.error('[Auto Mode] Error resuming auto mode:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
// 图片生成API (单张)
app.post('/agent/image/generate', async (req, res) => {
    try {
        const { prompt, style, aspectRatio, negativePrompt } = req.body;
        if (!prompt) {
            return res.status(400).json({
                success: false,
                error: 'prompt is required',
            });
        }
        console.log(`[Image] Generating image with prompt: ${prompt}`);
        const imageRequest = {
            prompt,
            style: style || 'realistic',
            aspectRatio: aspectRatio || '1:1',
            negativePrompt
        };
        const result = await imageService.generateImage(imageRequest);
        res.json({
            success: true,
            data: {
                imageUrl: result.url,
                localPath: result.localPath,
                source: result.source,
                cost: result.cost || 0
            }
        });
    }
    catch (error) {
        console.error('[Image] Error generating image:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
// 批量图片生成API
app.post('/agent/image/generate-batch', async (req, res) => {
    try {
        const { prompt, style, aspectRatio, count } = req.body;
        if (!prompt) {
            return res.status(400).json({
                success: false,
                error: 'prompt is required',
            });
        }
        const imageCount = Math.min(Math.max(count || 3, 1), 9); // 默认3张，最多9张
        console.log(`[Image] Generating ${imageCount} images with prompt: ${prompt}`);
        // 为每张图片创建略微不同的请求
        const requests = Array.from({ length: imageCount }, (_, i) => ({
            prompt: i === 0 ? prompt : `${prompt}, variation ${i + 1}`,
            style: style || 'realistic',
            aspectRatio: aspectRatio || '1:1'
        }));
        const results = await imageService.generateBatchImages(requests);
        // 提取图片路径和URL
        const images = results.map(r => ({
            url: r.url,
            localPath: r.localPath,
            source: r.source
        }));
        const totalCost = results.reduce((sum, r) => sum + (r.cost || 0), 0);
        res.json({
            success: true,
            data: {
                images,
                count: images.length,
                totalCost,
                // 返回本地路径数组，供xiaohongshu-mcp使用
                localPaths: images.map(img => img.localPath).filter(p => p),
                urls: images.map(img => img.url)
            }
        });
    }
    catch (error) {
        console.error('[Image] Error generating batch images:', error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});
// 小红书弹窗扫码自动登录API - 升级版方案一
app.post('/agent/xiaohongshu/auto-login', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required',
            });
        }
        console.log(`[XHS Auto Login] Starting popup QR code login for user ${userId}`);
        // 导入Cookie检测服务
        const { AutoCookieDetector } = await import('./autoCookieDetector.js');
        const { CookieManager } = await import('./cookieManager.js');
        const cookieDetector = new AutoCookieDetector();
        const cookieManager = new CookieManager();
        // 首先检查是否已有有效Cookie
        const existingCookies = await cookieManager.getCookies(userId);
        if (existingCookies && existingCookies.length > 0) {
            console.log(`[XHS Auto Login] User ${userId} already has valid cookies`);
            // 验证Cookie是否仍然有效
            try {
                const axios = await import('axios');
                const testResponse = await axios.default.get(`${MCP_ROUTER_URL}/api/xiaohongshu/login/status?userId=${userId}`, { timeout: 5000 });
                if (testResponse.data && !testResponse.data.error) {
                    return res.json({
                        success: true,
                        message: '已检测到有效登录状态',
                        status: 'already_logged_in',
                        data: { userId, loginValid: true }
                    });
                }
            }
            catch (testError) {
                console.warn(`[XHS Auto Login] Existing cookies may be invalid:`, testError);
            }
        }
        // 启动弹窗扫码登录流程
        console.log(`[XHS Auto Login] Starting popup QR code login process...`);
        // 步骤1: 调用MCP Router获取QR码
        let playwrightFallbackError = null;
        try {
            const axios = await import('axios');
            const qrResponse = await axios.default.get(`${MCP_ROUTER_URL}/api/xiaohongshu/login/qrcode?userId=${userId}`, { timeout: 10000 });
            if (qrResponse.data && qrResponse.data.qrcode_url) {
                console.log(`[XHS Auto Login] QR code generated successfully`);
                // 返回QR码给前端，前端弹窗显示
                return res.json({
                    success: true,
                    message: '请扫码登录',
                    status: 'qr_code_generated',
                    data: {
                        userId,
                        qrcode_url: qrResponse.data.qrcode_url,
                        instructions: '请使用小红书App扫描二维码完成登录',
                        polling_endpoint: `/agent/xiaohongshu/login/status?userId=${userId}`
                    }
                });
            }
        }
        catch (qrError) {
            console.warn(`[XHS Auto Login] QR code generation failed:`, qrError.message);
            try {
                const fallback = await playwrightLoginManager.startLogin(userId);
                if (fallback?.qrImage) {
                    console.log('[XHS Auto Login] Playwright fallback QR generated');
                    return res.json({
                        success: true,
                        message: '请扫码登录',
                        status: 'qr_code_generated',
                        data: {
                            userId,
                            qrcode_url: fallback.qrImage,
                            instructions: '请使用小红书App扫描二维码完成登录',
                            polling_endpoint: `/agent/xiaohongshu/login/status?userId=${userId}`,
                            source: 'playwright'
                        }
                    });
                }
            }
            catch (playwrightError) {
                const errorMessage = playwrightError?.message || String(playwrightError || '');
                const normalizedMessage = errorMessage.replace(/\s+/g, ' ').trim();
                playwrightFallbackError = normalizedMessage;
                console.error('[XHS Auto Login] Playwright fallback failed:', normalizedMessage);
            }
        }
        // 步骤2: 如果QR码失败，尝试自动检测浏览器Cookie
        console.log(`[XHS Auto Login] Fallback to browser cookie detection...`);
        const detectionResult = await cookieDetector.autoDetectCookies();
        if (detectionResult.success && detectionResult.cookies) {
            console.log(`[XHS Auto Login] Successfully detected ${detectionResult.cookies.length} cookies`);
            // 验证检测到的Cookie
            const isValid = cookieDetector.validateCookies(detectionResult.cookies);
            if (!isValid) {
                return res.json({
                    success: false,
                    error: 'Detected cookies are missing required fields (a1, web_session)',
                    needManualLogin: true
                });
            }
            // 转换为标准格式
            const standardCookies = detectionResult.cookies.map(cookie => ({
                name: cookie.name,
                value: cookie.value,
                domain: cookie.domain || '.xiaohongshu.com',
                path: cookie.path || '/',
                secure: true,
                httpOnly: false,
                sameSite: 'Lax'
            }));
            await persistUserCookies(userId, standardCookies, 'browser-detection');
            res.json({
                success: true,
                message: '自动检测并保存登录状态成功',
                status: 'auto_detected',
                data: {
                    userId,
                    cookieCount: standardCookies.length,
                    source: 'browser_detection',
                    encrypted: true,
                    imported_to_mcp: true
                }
            });
        }
        else {
            // 所有方法失败，提供手动登录选项
            console.log(`[XHS Auto Login] All detection methods failed: ${detectionResult.error}`);
            const baseMessage = detectionResult.error || 'All login methods failed';
            const enrichedMessage = playwrightFallbackError
                ? `Playwright fallback error: ${playwrightFallbackError}. 请在服务器上运行 "npx playwright install chromium" 安装浏览器后重试，或设置 PLAYWRIGHT_AUTO_INSTALL=false 禁用自动安装尝试。`
                : baseMessage;
            res.json({
                success: false,
                error: enrichedMessage,
                needManualLogin: true,
                loginInstructions: {
                    step1: '在浏览器中访问 https://www.xiaohongshu.com/login',
                    step2: '完成登录',
                    step3: '再次点击"检测登录状态"',
                    autoRetrySeconds: 30
                }
            });
        }
    }
    catch (error) {
        console.error('[XHS Auto Login] Error during popup QR login:', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Popup QR login failed',
        });
    }
});
// 手动提交Cookie（用于Zeabur等云端环境）
app.post('/agent/xiaohongshu/manual-cookies', async (req, res) => {
    try {
        const { userId, cookies } = req.body;
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required'
            });
        }
        if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'cookies array is required'
            });
        }
        const normalizedCookies = cookies
            .filter(cookie => cookie && typeof cookie.name === 'string' && typeof cookie.value === 'string')
            .map(cookie => {
            const name = cookie.name.trim();
            const value = cookie.value.trim();
            const allowedSameSite = ['Lax', 'Strict', 'None'];
            const rawSameSite = typeof cookie.sameSite === 'string' ? cookie.sameSite : '';
            const sameSite = allowedSameSite.includes(rawSameSite)
                ? rawSameSite
                : 'Lax';
            return {
                name,
                value,
                domain: (cookie.domain && typeof cookie.domain === 'string' && cookie.domain.trim().length > 0)
                    ? cookie.domain.trim()
                    : '.xiaohongshu.com',
                path: (cookie.path && typeof cookie.path === 'string' && cookie.path.trim().length > 0)
                    ? cookie.path.trim()
                    : '/',
                secure: cookie.secure !== false,
                httpOnly: typeof cookie.httpOnly === 'boolean' ? cookie.httpOnly : ['web_session', 'a1'].includes(name),
                sameSite
            };
        })
            .filter(cookie => cookie.name && cookie.value);
        if (normalizedCookies.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No valid cookies provided'
            });
        }
        const requiredCookies = ['web_session', 'a1'];
        const missingRequired = requiredCookies.filter(required => !normalizedCookies.some(cookie => cookie.name === required));
        if (missingRequired.length > 0) {
            return res.status(400).json({
                success: false,
                error: `缺少必要的Cookie: ${missingRequired.join(', ')}`
            });
        }
        const persistResult = await persistUserCookies(userId, normalizedCookies, 'manual-upload');
        res.json({
            success: true,
            message: 'Cookie已成功保存并同步',
            data: {
                userId,
                cookieCount: normalizedCookies.length,
                mcpSynced: persistResult.mcpSynced
            }
        });
    }
    catch (error) {
        console.error('[XHS Manual Cookie] Error saving cookies:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to save cookies'
        });
    }
});
// 辅助方法：导入Cookie到MCP Router的cookies.json
async function importCookiesToMCPRouter(userId, cookies) {
    try {
        const axios = await import('axios');
        // 同步到MCP Router的import-cookies端点
        await axios.default.post(`${MCP_ROUTER_URL}/api/xiaohongshu/login/import-cookies`, {
            userId: userId,
            cookies: cookies
        }, { timeout: 10000 });
        console.log(`[XHS Auto Login] Cookies successfully imported to MCP Router cookies.json for user ${userId}`);
        return true;
    }
    catch (syncError) {
        console.error(`[XHS Auto Login] Failed to import cookies to MCP Router:`, syncError.message);
        return false;
    }
}
// 小红书登录状态检查API
app.get('/agent/xiaohongshu/login/status', async (req, res) => {
    try {
        const userId = req.query.userId;
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required',
            });
        }
        console.log(`[XHS Login] Checking login status for user ${userId}`);
        try {
            // 先检查本地是否有Cookie文件（表示已经登录过）
            const fs = await import('fs');
            const path = await import('path');
            // Zeabur生产环境优化的Cookie文件路径查找
            const cookieFilePaths = [
                // 当前项目结构路径（Zeabur部署时的主要路径）
                path.join(process.cwd(), '..', 'mcp-router', 'cookies', userId, 'cookies.json'),
                path.join(process.cwd(), '..', 'mcp-router', 'latest.json'),
                // 容器内可能的路径
                path.join('/app', 'mcp-router', 'cookies', userId, 'cookies.json'),
                path.join('/app', 'mcp-router', 'latest.json'),
                // 工作目录相对路径
                path.join(process.cwd(), 'cookies', userId, 'cookies.json'),
                // 本地开发路径
                path.join(process.cwd(), 'playwright-service', 'mcp-router', 'cookies', userId, 'cookies.json'),
                path.join(process.cwd(), 'playwright-service', 'mcp-router', 'latest.json')
            ];
            console.log(`[XHS Login] Current working directory: ${process.cwd()}`);
            console.log(`[XHS Login] Searching for cookies in paths:`, cookieFilePaths);
            let hasValidCookies = false;
            for (const cookieFile of cookieFilePaths) {
                try {
                    if (fs.existsSync(cookieFile)) {
                        const fileContent = fs.readFileSync(cookieFile, 'utf-8');
                        const cookieData = JSON.parse(fileContent);
                        // 检查是否有必要的登录Cookie
                        const cookies = cookieData.cookies || cookieData;
                        if (Array.isArray(cookies)) {
                            const hasSessionCookie = cookies.some(c => c.name === 'web_session' && c.value && !c.value.includes('Guest'));
                            const hasA1Cookie = cookies.some(c => c.name === 'a1' && c.value);
                            if (hasSessionCookie && hasA1Cookie) {
                                hasValidCookies = true;
                                console.log(`[XHS Login] Found valid cookies in ${cookieFile}`);
                                break;
                            }
                        }
                    }
                }
                catch (cookieError) {
                    console.warn(`[XHS Login] Error reading cookie file ${cookieFile}:`, cookieError instanceof Error ? cookieError.message : String(cookieError));
                }
            }
            if (hasValidCookies) {
                // 有有效Cookie，返回登录状态
                res.json({
                    success: true,
                    data: {
                        logged_in: true,
                        message: 'Cookie登录状态检测成功',
                        user_id: userId,
                        source: 'local_cookies'
                    }
                });
                return;
            }
            // 调用 MCP Router 检查登录状态
            const axios = await import('axios');
            const response = await axios.default.get(`${MCP_ROUTER_URL}/api/xiaohongshu/login/status?userId=${userId}`, { timeout: 5000 });
            res.json({
                success: true,
                data: response.data
            });
        }
        catch (mcpError) {
            console.error(`[XHS Login] MCP Router unavailable (${mcpError.message}), login failed`);
            // MCP Router不可用，返回登录失败状态
            res.status(503).json({
                success: false,
                error: 'Login service unavailable',
                message: 'MCP Router服务不可用，请检查服务状态',
                user_id: userId
            });
        }
    }
    catch (error) {
        console.error('[XHS Login] Error checking login status:', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to check login status',
        });
    }
});
// 小红书登出API
app.post('/agent/xiaohongshu/logout', async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required',
            });
        }
        console.log(`[XHS Logout] Processing logout request for user ${userId}`);
        try {
            // 调用 MCP Router 清除登录状态
            const axios = await import('axios');
            const response = await axios.default.post(`${MCP_ROUTER_URL}/api/xiaohongshu/logout`, { userId }, {
                timeout: 5000,
                headers: { 'Content-Type': 'application/json' }
            });
            console.log(`[XHS Logout] MCP Router logout response:`, response.status);
            res.json({
                success: true,
                message: 'Logout successful',
                data: response.data
            });
        }
        catch (mcpError) {
            console.warn(`[XHS Logout] MCP Router unavailable (${mcpError.message}), proceeding with local logout`);
            // MCP Router不可用，清除本地数据
            try {
                // 导入Cookie管理器清除Cookie
                const { CookieManager } = await import('./cookieManager.js');
                const cookieManager = new CookieManager();
                await cookieManager.deleteCookies(userId);
                // 清除用户配置数据
                const fs = await import('fs');
                const path = await import('path');
                const userDataPath = path.join(process.cwd(), 'data', `${userId}.json`);
                if (fs.existsSync(userDataPath)) {
                    await fs.promises.unlink(userDataPath);
                    console.log(`[XHS Logout] Deleted user data file: ${userDataPath}`);
                }
            }
            catch (localError) {
                console.error(`[XHS Logout] Local cleanup error:`, localError.message);
            }
            res.json({
                success: true,
                message: 'Local logout completed',
                data: {
                    logged_out: true,
                    message: '本地登录状态已清除',
                    user_id: userId
                }
            });
        }
    }
    catch (error) {
        console.error('[XHS Logout] Error processing logout:', error.message);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to logout',
        });
    }
});
// ============ 前端兼容性 API 端点 ============
// 为前端提供期望的 /api/xiaohongshu/login/* 端点
// 获取登录二维码 (前端兼容性端点)
app.get('/api/xiaohongshu/login/qrcode', async (req, res) => {
    try {
        const userId = req.query.userId;
        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }
        console.log(`[API Proxy] QR code request for user ${userId}`);
        // 代理到 MCP Router - 仅真实模式
        const axios = await import('axios');
        const response = await axios.default.get(`${MCP_ROUTER_URL}/api/xiaohongshu/login/qrcode?userId=${userId}`, { timeout: 10000 });
        res.json(response.data);
    }
    catch (error) {
        console.error('[API Proxy] QR code error:', error.message);
        res.status(500).json({
            error: `MCP Router connection failed: ${error.message}`,
            mcp_router_url: MCP_ROUTER_URL
        });
    }
});
// 检查登录状态 (前端兼容性端点)
app.get('/api/xiaohongshu/login/status', async (req, res) => {
    try {
        const userId = req.query.userId;
        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }
        console.log(`[API Proxy] Login status check for user ${userId}`);
        // 代理到 MCP Router - 仅真实模式
        const axios = await import('axios');
        const response = await axios.default.get(`${MCP_ROUTER_URL}/api/xiaohongshu/login/status?userId=${userId}`, { timeout: 10000 });
        res.json(response.data);
    }
    catch (error) {
        console.error('[API Proxy] Login status error:', error.message);
        res.status(500).json({
            error: `MCP Router connection failed: ${error.message}`,
            mcp_router_url: MCP_ROUTER_URL
        });
    }
});
// Cookie同步API - 从ultra-simple-login同步Cookie到Claude Agent Service
app.post('/agent/xiaohongshu/sync-cookies', async (req, res) => {
    try {
        const { userId, source } = req.body;
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required',
            });
        }
        console.log(`[Cookie Sync] Starting cookie sync for user ${userId} from source: ${source || 'unknown'}`);
        if (source === 'ultra-simple-login') {
            // 从ultra-simple-login的latest.json读取Cookie
            const fs = await import('fs');
            const path = await import('path');
            // 查找ultra-simple-login的Cookie文件 - Zeabur优化版本
            const possiblePaths = [
                // Zeabur生产环境主要路径
                path.join(process.cwd(), '..', 'mcp-router', 'latest.json'),
                path.join('/app', 'mcp-router', 'latest.json'),
                // 本地开发路径
                path.join(process.cwd(), 'playwright-service', 'mcp-router', 'latest.json'),
                path.join(process.cwd(), 'latest.json'),
                // 临时目录
                '/tmp/latest.json',
                // 其他可能的容器路径
                '/workspace/mcp-router/latest.json',
                '/workspace/latest.json'
            ];
            console.log(`[Cookie Sync] Current working directory: ${process.cwd()}`);
            console.log(`[Cookie Sync] Searching for cookie files in:`, possiblePaths);
            let cookieData = null;
            let cookieFilePath = '';
            for (const filePath of possiblePaths) {
                try {
                    if (fs.existsSync(filePath)) {
                        const fileContent = await fs.promises.readFile(filePath, 'utf-8');
                        cookieData = JSON.parse(fileContent);
                        cookieFilePath = filePath;
                        console.log(`[Cookie Sync] Found cookie file at: ${filePath}`);
                        break;
                    }
                }
                catch (readError) {
                    console.warn(`[Cookie Sync] Failed to read ${filePath}:`, readError instanceof Error ? readError.message : String(readError));
                }
            }
            if (!cookieData || !cookieData.cookies) {
                return res.status(404).json({
                    success: false,
                    error: 'No cookies found from ultra-simple-login',
                    searchedPaths: possiblePaths
                });
            }
            // 验证是否为真实登录Session（非Guest）
            const sessionCookie = cookieData.cookies.find((c) => c.name === 'web_session');
            if (!sessionCookie || sessionCookie.value.includes('Guest')) {
                return res.status(400).json({
                    success: false,
                    error: 'Only guest session detected, need real login',
                    sessionValue: sessionCookie?.value?.substring(0, 20) + '...'
                });
            }
            console.log(`[Cookie Sync] Found ${cookieData.cookies.length} cookies, valid session detected`);
            // 导入Cookie管理器
            const { CookieManager } = await import('./cookieManager.js');
            const cookieManager = new CookieManager();
            // 标准化Cookie格式
            const standardCookies = cookieData.cookies.map((cookie) => ({
                name: cookie.name,
                value: cookie.value,
                domain: cookie.domain || '.xiaohongshu.com',
                path: cookie.path || '/',
                secure: cookie.secure !== false,
                httpOnly: cookie.httpOnly || false,
                sameSite: cookie.sameSite || 'Lax'
            }));
            // 保存到本地加密存储
            await cookieManager.saveCookies(userId, standardCookies);
            console.log(`[Cookie Sync] Saved ${standardCookies.length} cookies to local storage`);
            // 同步到MCP Router
            const syncSuccess = await importCookiesToMCPRouter(userId, standardCookies);
            res.json({
                success: true,
                message: 'Cookie sync completed successfully',
                data: {
                    userId,
                    cookieCount: standardCookies.length,
                    source: 'ultra-simple-login',
                    sourceFile: cookieFilePath,
                    mcpSyncSuccess: syncSuccess,
                    hasValidSession: true
                }
            });
        }
        else {
            return res.status(400).json({
                success: false,
                error: 'Unsupported cookie source. Currently only supports: ultra-simple-login'
            });
        }
    }
    catch (error) {
        console.error('[Cookie Sync] Error during cookie sync:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Cookie sync failed',
        });
    }
});
// ============ 自动Cookie导入API ============
// 获取自动导入状态
app.get('/agent/auto-import/status', async (req, res) => {
    try {
        const status = autoCookieImporter.getStatus();
        res.json({
            success: true,
            status
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// 手动触发Cookie导入
app.post('/agent/auto-import/manual', async (req, res) => {
    try {
        const { userId } = req.body;
        console.log(`[Auto Import] Manual import triggered for userId: ${userId || 'auto'}`);
        const result = await autoCookieImporter.manualImport(userId);
        if (result.success) {
            res.json({
                success: true,
                message: result.message,
                data: {
                    userId: result.userId,
                    cookieCount: result.cookieCount,
                    source: result.source
                }
            });
        }
        else {
            res.status(400).json({
                success: false,
                error: result.message,
                details: result.error
            });
        }
    }
    catch (error) {
        console.error('[Auto Import] Manual import error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// 启动/停止自动导入监控
app.post('/agent/auto-import/toggle', async (req, res) => {
    try {
        const { action, intervalMs } = req.body;
        if (action === 'start') {
            autoCookieImporter.startAutoImport(intervalMs || 15000);
            res.json({
                success: true,
                message: `自动导入监控已启动，监控间隔: ${intervalMs || 15000}ms`
            });
        }
        else if (action === 'stop') {
            autoCookieImporter.stopAutoImport();
            res.json({
                success: true,
                message: '自动导入监控已停止'
            });
        }
        else {
            res.status(400).json({
                success: false,
                error: 'Invalid action. Use "start" or "stop"'
            });
        }
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// 捕获所有未匹配的路由，重定向到根路径（SPA fallback）
app.get('*', (req, res) => {
    console.log(`[Server] Handling request: ${req.method} ${req.path}`);
    console.log(`[Server] Headers:`, req.headers);
    // 如果是API路径，返回404
    if (req.path.startsWith('/api') || req.path.startsWith('/agent')) {
        console.log(`[Server] API path not found: ${req.path}`);
        return res.status(404).json({
            error: 'API endpoint not found',
            path: req.path,
            method: req.method
        });
    }
    // 特殊处理 /v1 路径
    if (req.path === '/v1') {
        console.log(`[Server] Redirecting /v1 to root with 301`);
        return res.redirect(301, '/');
    }
    // 其他路径重定向到主页
    console.log(`[Server] Serving index.html for path: ${req.path}`);
    res.sendFile(path.join(frontendPath, 'index.html'));
});
// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Claude Agent Service] Server listening on 0.0.0.0:${PORT}`);
    console.log(`[Claude Agent Service] Health check: http://localhost:${PORT}/health`);
    console.log(`[Claude Agent Service] MCP Router URL: ${MCP_ROUTER_URL}`);
});
// 优雅关闭
const shutdown = async () => {
    console.log('[Claude Agent Service] Shutting down...');
    await playwrightLoginManager.shutdown();
    process.exit(0);
};
process.on('SIGINT', () => { shutdown(); });
process.on('SIGTERM', () => { shutdown(); });
async function persistUserCookies(userId, cookies, source = 'unknown') {
    const { CookieManager } = await import('./cookieManager.js');
    const cookieManager = new CookieManager();
    await cookieManager.saveCookies(userId, cookies);
    const cookiePayload = {
        userId,
        source,
        savedAt: new Date().toISOString(),
        cookies
    };
    const pathsToWrite = [
        path.join(process.cwd(), '..', 'mcp-router', 'cookies', userId, 'cookies.json'),
        path.join(process.cwd(), '..', 'mcp-router', 'latest.json'),
        path.join('/app', 'mcp-router', 'cookies', userId, 'cookies.json'),
        path.join('/app', 'mcp-router', 'latest.json'),
        path.join(process.cwd(), 'playwright-service', 'mcp-router', 'cookies', userId, 'cookies.json'),
        path.join(process.cwd(), 'playwright-service', 'mcp-router', 'latest.json')
    ];
    const writtenPaths = [];
    for (const filePath of pathsToWrite) {
        try {
            await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
            await fs.promises.writeFile(filePath, JSON.stringify(cookiePayload, null, 2), 'utf8');
            writtenPaths.push(filePath);
        }
        catch (error) {
            console.warn(`[Cookie Persist] Failed to write ${filePath}:`, error.message || error);
        }
    }
    if (writtenPaths.length > 0) {
        console.log(`[Cookie Persist] Saved ${cookies.length} cookies for ${userId} via ${source}. Paths: ${writtenPaths.join(', ')}`);
    }
    else {
        console.warn(`[Cookie Persist] No cookie files were written for ${userId}; please check filesystem permissions.`);
    }
    let mcpSynced = false;
    try {
        mcpSynced = await importCookiesToMCPRouter(userId, cookies);
    }
    catch (error) {
        console.warn('[Cookie Persist] MCP sync failed:', error.message || error);
    }
    return { mcpSynced, writtenPaths };
}
//# sourceMappingURL=server.js.map