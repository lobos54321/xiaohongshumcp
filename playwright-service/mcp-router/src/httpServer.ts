/**
 * MCP Router HTTP Server
 * 提供HTTP API包装，方便Go后端调用
 */

import express from 'express';
import { XiaohongshuMCPProcessManager } from './processManager.js';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MCP_BINARY = process.env.MCP_BINARY_PATH || './xiaohongshu-mcp';
// 🔥 使用持久化卷目录，防止重启丢失Cookie
const COOKIE_DIR = process.env.COOKIE_DIR || '/app/data/cookies';
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3000');
const CLAUDE_AGENT_URL = process.env.CLAUDE_AGENT_URL || 'http://127.0.0.1:8080';

// 创建进程管理器
const processManager = new XiaohongshuMCPProcessManager(MCP_BINARY, COOKIE_DIR);

// 创建 Express 应用
const app = express();
app.use(express.json());

// 静态文件服务 - 指向前端目录
const frontendPath = path.resolve(__dirname, '../../../frontend');
app.use('/', express.static(frontendPath));

// 根路径处理 - 返回主页
app.get('/', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// 健康检查
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'xiaohongshu-mcp-router',
    timestamp: new Date().toISOString(),
  });
});

// 统计信息
app.get('/stats', (_req, res) => {
  const stats = processManager.getStats();
  res.json(stats);
});

app.all('/proxy/*', async (req, res) => {
  try {
    const targetPath = req.url.replace(/^\/proxy\//, '');
    const url = `${CLAUDE_AGENT_URL}/${targetPath}`;
    const init: any = { method: req.method, headers: { 'Content-Type': 'application/json' } };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = JSON.stringify(req.body || {});
    }
    const r = await fetch(url, init as any);
    const text = await r.text();
    res.status(r.status).send(text);
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get('/frontend/xhs-test', (_req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>小红书发布测试</title><style>body{font-family:system-ui,-apple-system;max-width:820px;margin:40px auto;padding:0 20px}button{padding:8px 14px;margin-right:8px}input{padding:6px 8px;width:280px}</style></head><body>
  <h2>小红书前端驱动发布测试</h2>
  <div><label>用户ID: <input id="uid" value="local_test_user"></label></div>
  <div style="margin:12px 0;">
    <button onclick="checkStatus()">检查登录状态</button>
    <button onclick="showQR()">显示扫码二维码</button>
  </div>
  <div id="status"></div>
  <div id="qr"></div>
  <hr>
  <h3>批准发布</h3>
  <div><label>任务ID(可选): <input id="tid" placeholder="例如: 1"></label></div>
  <div style="margin:12px 0;"><button onclick="approve()">批准发布</button></div>
  <div id="approve"></div>
  <div id="poll"></div>
  <script>
    async function checkStatus(){
      const uid=document.getElementById('uid').value.trim();
      const r=await fetch('/proxy/api/xiaohongshu/login/status?userId='+encodeURIComponent(uid));
      const t=await r.text();
      document.getElementById('status').textContent=t;
    }
    async function showQR(){
      const uid=document.getElementById('uid').value.trim();
      const r=await fetch('/proxy/api/xiaohongshu/login/qrcode?userId='+encodeURIComponent(uid));
      const j=await r.json();
      const img=j.data?.img||j.img||'';
      document.getElementById('qr').innerHTML=img?('<img src="'+img+'" style="max-width:320px;border:1px solid #ddd">'):'无二维码';
    }
    async function approve(){
      const uid=document.getElementById('uid').value.trim();
      const tid=document.getElementById('tid').value.trim();
      const r=await fetch('/proxy/agent/auto/approve/'+encodeURIComponent(uid),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(tid?{taskId:tid}:{})});
      const j=await r.json();
      document.getElementById('approve').textContent=JSON.stringify(j);
      if(j.success&&j.jobId){ poll(uid,j.jobId); }
    }
    async function poll(uid,job){
      const el=document.getElementById('poll');
      el.textContent='';
      const iv=setInterval(async()=>{
        const r=await fetch('/proxy/agent/auto/publish-status/'+job+'?userId='+encodeURIComponent(uid));
        const j=await r.json();
        el.textContent=JSON.stringify(j);
        if(j.success && (j.status==='completed'||j.status==='failed')) clearInterval(iv);
      },3000);
    }
  </script></body></html>`);
});

// 调用MCP工具（通用接口）
app.post('/mcp/call', async (req, res) => {
  try {
    const { userId, toolName, arguments: args } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: 'userId is required',
      });
    }

    if (!toolName) {
      return res.status(400).json({
        error: 'toolName is required',
      });
    }

    // 工具到端点的映射
    const toolToEndpoint: Record<string, { path: string; method: string }> = {
      xiaohongshu_check_login: { path: '/api/v1/login/status', method: 'GET' },
      xiaohongshu_get_login_qrcode: { path: '/api/v1/login/qrcode', method: 'GET' },
      xiaohongshu_publish_content: { path: '/api/v1/publish', method: 'POST' },
      xiaohongshu_publish_video: { path: '/api/v1/publish_video', method: 'POST' },
      xiaohongshu_list_feeds: { path: '/api/v1/feeds/list', method: 'GET' },
      xiaohongshu_search_feeds: { path: '/api/v1/feeds/search', method: 'GET' },
      xiaohongshu_get_feed_detail: { path: '/api/v1/feeds/detail', method: 'POST' },
      xiaohongshu_post_comment: { path: '/api/v1/feeds/comment', method: 'POST' },
      xiaohongshu_user_profile: { path: '/api/v1/user/profile', method: 'POST' },
      xiaohongshu_get_my_profile: { path: '/api/v1/user/me', method: 'GET' },
    };

    const endpoint = toolToEndpoint[toolName];
    if (!endpoint) {
      return res.status(400).json({
        error: `Unknown tool: ${toolName}`,
      });
    }

    // 🔥 CRITICAL FIX: xiaohongshu-mcp要求请求中包含userId字段
    // args对象是发送给MCP binary的实际数据，必须包含userId
    const requestData = {
      userId,  // ← 添加userId到请求数据中
      ...(args || {})
    };

    // 调用对应的MCP进程
    const result = await processManager.callTool(
      userId,
      endpoint.path,
      endpoint.method,
      requestData
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    // 🔥 提取完整的错误信息
    const errorResponse = {
      message: error.message,
      status: error.status || error.response?.status,
      data: error.data || error.response?.data,
      originalError: error.originalError ? {
        message: error.originalError.message,
        status: error.originalError.response?.status,
        data: error.originalError.response?.data,
      } : undefined,
    };

    console.error('[HTTP Server] Tool call failed:', errorResponse);

    const statusCode = error.status || error.response?.status || 500;
    const errorMessage = error.data?.error || error.data?.message || error.message || 'Unknown error';

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      details: error.data,
      status: statusCode,
    });
  }
});

// 便捷API：检查登录状态
app.get('/api/xiaohongshu/login/status', async (req, res) => {
  try {
    const userId = req.query.userId as string || req.headers['x-user-id'] as string;
    const forceQr = (req.query.force_qr as string) === '1' || (req.query.mode as string) === 'strict';

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (forceQr) {
      processManager.setSkipDbCookieLoad(userId, true);
      await processManager.clearUserCookies(userId);
    }

    const result = await processManager.callTool(
      userId,
      '/api/v1/login/status',
      'GET'
    );

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 便捷API：获取登录二维码
app.get('/api/xiaohongshu/login/qrcode', async (req, res) => {
  try {
    const userId = req.query.userId as string || req.headers['x-user-id'] as string;
    const forceQr = (req.query.force_qr as string) === '1' || (req.query.mode as string) === 'strict';

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (forceQr) {
      processManager.setSkipDbCookieLoad(userId, true);
      await processManager.clearUserCookies(userId);
    }

    const result = await processManager.callTool(
      userId,
      '/api/v1/login/qrcode',
      'GET'
    );

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 便捷API：获取验证二维码（预登录人机验证）
app.get('/api/xiaohongshu/login/verification-qrcode', async (req, res) => {
  try {
    const userId = req.query.userId as string || req.headers['x-user-id'] as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const result = await processManager.callTool(
      userId,
      '/api/v1/login/verification-qrcode',
      'GET'
    );

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 便捷API：发布内容
app.post('/api/xiaohongshu/publish', async (req, res) => {
  try {
    const userId = req.body.userId || req.headers['x-user-id'] as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const result = await processManager.callTool(
      userId,
      '/api/v1/publish',
      'POST',
      req.body
    );

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 便捷API：发布视频
app.post('/api/xiaohongshu/publish/video', async (req, res) => {
  try {
    const userId = req.body.userId || req.headers['x-user-id'] as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const result = await processManager.callTool(
      userId,
      '/api/v1/publish_video',
      'POST',
      req.body
    );

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 便捷API：导入Cookie（解决登录问题）- 增强版
app.post('/api/xiaohongshu/login/import-cookies', async (req, res) => {
  try {
    const { userId, cookies } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!cookies || !Array.isArray(cookies)) {
      return res.status(400).json({ error: 'cookies array is required' });
    }

    console.log(`[Cookie Import] Importing ${cookies.length} cookies for user ${userId}`);

    // 验证Cookie质量 - 检查关键字段
    const requiredCookies = ['a1', 'web_session'];
    const availableCookies = cookies.map(c => c.name);
    const missingCookies = requiredCookies.filter(name => !availableCookies.includes(name));

    if (missingCookies.length > 0) {
      console.warn(`[Cookie Import] Missing required cookies: ${missingCookies.join(', ')}`);
      return res.status(400).json({
        error: `Missing required cookies: ${missingCookies.join(', ')}`,
        available: availableCookies,
        required: requiredCookies
      });
    }

    // 创建多级目录结构确保Cookie隔离
    const cookieDir = path.join(COOKIE_DIR, userId);
    const cookieFile = path.join(cookieDir, 'cookies.json');
    const backupFile = path.join(cookieDir, `cookies_backup_${Date.now()}.json`);

    // 确保目录存在
    if (!fs.existsSync(cookieDir)) {
      fs.mkdirSync(cookieDir, { recursive: true });
      console.log(`[Cookie Import] Created cookie directory: ${cookieDir}`);
    }

    // 备份现有Cookie（如果存在）
    if (fs.existsSync(cookieFile)) {
      try {
        fs.copyFileSync(cookieFile, backupFile);
        console.log(`[Cookie Import] Backed up existing cookies to: ${backupFile}`);
      } catch (backupError) {
        console.warn(`[Cookie Import] Failed to backup cookies: ${backupError instanceof Error ? backupError.message : String(backupError)}`);
      }
    }

    // 标准化Cookie格式
    const standardizedCookies = cookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain || '.xiaohongshu.com',
      path: cookie.path || '/',
      secure: cookie.secure !== false, // 默认为true
      httpOnly: cookie.httpOnly || false,
      sameSite: cookie.sameSite || 'Lax',
      expires: cookie.expires, // 保留过期时间
      priority: cookie.priority || 'Medium' // 默认优先级
    }));

    // 写入Cookie文件
    fs.writeFileSync(cookieFile, JSON.stringify(standardizedCookies, null, 2));
    console.log(`[Cookie Import] Successfully imported ${standardizedCookies.length} cookies to ${cookieFile}`);

    // 同步到进程管理器 - 立即刷新对应用户的MCP进程
    try {
      await processManager.refreshUserCookies(userId, standardizedCookies);
      console.log(`[Cookie Import] Successfully refreshed MCP process cookies for user ${userId}`);
    } catch (refreshError) {
      console.warn(`[Cookie Import] Failed to refresh MCP process: ${refreshError instanceof Error ? refreshError.message : String(refreshError)}`);
      // 不返回错误，因为文件写入已成功
    }

    // 验证Cookie有效性 - 尝试调用登录状态检查
    try {
      const validationResult = await processManager.callTool(
        userId,
        '/api/v1/login/status',
        'GET'
      );

      if (validationResult && !validationResult.error) {
        console.log(`[Cookie Import] Cookie validation successful for user ${userId}`);
      } else {
        console.warn(`[Cookie Import] Cookie validation failed: ${validationResult?.error || 'Unknown error'}`);
      }
    } catch (validationError) {
      console.warn(`[Cookie Import] Cookie validation error: ${validationError instanceof Error ? validationError.message : String(validationError)}`);
    }

    res.json({
      success: true,
      message: `Successfully imported ${standardizedCookies.length} cookies`,
      data: {
        userId,
        cookieCount: standardizedCookies.length,
        cookieFile: cookieFile,
        backupFile: fs.existsSync(backupFile) ? backupFile : null,
        requiredCookiesPresent: requiredCookies.every(name => availableCookies.includes(name)),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('[Cookie Import] Error:', error);
    res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 便捷API：搜索内容
app.get('/api/xiaohongshu/feeds/search', async (req, res) => {
  try {
    const userId = req.query.userId as string || req.headers['x-user-id'] as string;
    const keyword = req.query.keyword as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    if (!keyword) {
      return res.status(400).json({ error: 'keyword is required' });
    }

    const result = await processManager.callTool(
      userId,
      '/api/v1/feeds/search',
      'GET',
      { keyword }
    );

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 便捷API：获取推荐内容
app.get('/api/xiaohongshu/feeds/list', async (req, res) => {
  try {
    const userId = req.query.userId as string || req.headers['x-user-id'] as string;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const result = await processManager.callTool(
      userId,
      '/api/v1/feeds/list',
      'GET'
    );

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 便捷API：退出登录
app.post('/api/xiaohongshu/logout', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    console.log(`[Logout] Processing logout request for user ${userId}`);
    const filesToDelete: string[] = [];

    // 1. 停止并清理用户的MCP进程
    try {
      await processManager.cleanupUser(userId);
      console.log(`[Logout] Successfully cleaned up MCP process for user ${userId}`);
    } catch (processError) {
      console.warn(`[Logout] Failed to cleanup MCP process: ${processError instanceof Error ? processError.message : String(processError)}`);
    }

    // 2. 定义所有可能的Cookie路径（解决路径不匹配问题）
    const allPossibleCookiePaths = [
      // 🔥 Go后端xiaohongshu-mcp-build的Cookie路径（最关键！）
      '/app/data',  // Go后端默认使用的路径

      // MCP Router 自己的路径
      '/app/playwright-service/mcp-router',
      '/app/mcp-router',
      './cookies',
      COOKIE_DIR,

      // Claude Agent Service 相关路径
      '/app/playwright-service/claude-agent-service',
      '/app/playwright-service/claude-agent-service/playwright-service/mcp-router',
      '/app/playwright-service/claude-agent-service/cookies',

      // 其他可能的路径
      '/app/cookies',
      '/app/playwright-service/cookies',
      path.resolve(process.cwd(), 'cookies'),
      path.resolve(process.cwd(), '../claude-agent-service/cookies'),
      path.resolve(process.cwd(), '../claude-agent-service/playwright-service/mcp-router'),
    ];

    // 3. 清理所有可能路径中的关键文件
    const criticalFiles = ['latest.json', 'cookies.json'];

    for (const basePath of allPossibleCookiePaths) {
      try {
        if (!fs.existsSync(basePath)) continue;

        console.log(`[Logout] Checking path: ${basePath}`);

        // 清理关键文件
        for (const criticalFile of criticalFiles) {
          const filePath = path.join(basePath, criticalFile);
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              filesToDelete.push(filePath);
              console.log(`[Logout] ✅ Deleted critical file: ${filePath}`);
            }
          } catch (fileError) {
            console.warn(`[Logout] Failed to delete ${filePath}: ${fileError instanceof Error ? fileError.message : String(fileError)}`);
          }
        }

        // 清理用户相关文件
        try {
          const files = fs.readdirSync(basePath);
          const userFiles = files.filter(file =>
            file.includes(userId) ||
            file.startsWith(`${userId}_`) ||
            file.endsWith(`${userId}.json`) ||
            (file.endsWith('.json') && (file.includes('cookie') || file.includes('latest')))
          );

          for (const userFile of userFiles) {
            const userFilePath = path.join(basePath, userFile);
            try {
              if (fs.existsSync(userFilePath)) {
                const stat = fs.statSync(userFilePath);
                if (stat.isDirectory()) {
                  fs.rmSync(userFilePath, { recursive: true, force: true });
                  filesToDelete.push(userFilePath);
                  console.log(`[Logout] ✅ Deleted directory: ${userFilePath}`);
                } else {
                  fs.unlinkSync(userFilePath);
                  filesToDelete.push(userFilePath);
                  console.log(`[Logout] ✅ Deleted file: ${userFilePath}`);
                }
              }
            } catch (deleteError) {
              console.warn(`[Logout] Failed to delete ${userFilePath}: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`);
            }
          }
        } catch (readError) {
          console.warn(`[Logout] Failed to read directory ${basePath}: ${readError instanceof Error ? readError.message : String(readError)}`);
        }

        // 清理 cookies 子目录
        const cookiesSubDir = path.join(basePath, 'cookies');
        if (fs.existsSync(cookiesSubDir)) {
          try {
            const cookieFiles = fs.readdirSync(cookiesSubDir);
            for (const cookieFile of cookieFiles) {
              if (cookieFile.includes(userId) || cookieFile === 'latest.json' || cookieFile.includes('cookie')) {
                const cookieFilePath = path.join(cookiesSubDir, cookieFile);
                try {
                  const stat = fs.statSync(cookieFilePath);
                  if (stat.isDirectory()) {
                    fs.rmSync(cookieFilePath, { recursive: true, force: true });
                    filesToDelete.push(cookieFilePath);
                    console.log(`[Logout] ✅ Deleted cookie directory: ${cookieFilePath}`);
                  } else {
                    fs.unlinkSync(cookieFilePath);
                    filesToDelete.push(cookieFilePath);
                    console.log(`[Logout] ✅ Deleted cookie file: ${cookieFilePath}`);
                  }
                } catch (cookieError) {
                  console.warn(`[Logout] Failed to delete cookie file ${cookieFilePath}: ${cookieError instanceof Error ? cookieError.message : String(cookieError)}`);
                }
              }
            }
          } catch (cookieDirError) {
            console.warn(`[Logout] Failed to read cookies directory ${cookiesSubDir}: ${cookieDirError instanceof Error ? cookieDirError.message : String(cookieDirError)}`);
          }
        }

      } catch (pathError) {
        console.warn(`[Logout] Failed to process path ${basePath}: ${pathError instanceof Error ? pathError.message : String(pathError)}`);
      }
    }

    // 4. 额外的全局搜索清理（确保不遗漏任何文件）
    const globalSearchPaths = ['/app', '/app/playwright-service'];

    for (const searchPath of globalSearchPaths) {
      try {
        if (!fs.existsSync(searchPath)) continue;

        // 使用递归搜索找到所有可能的 latest.json 和用户相关文件
        const findFiles = (dir: string, maxDepth: number = 3): string[] => {
          if (maxDepth <= 0) return [];

          const results: string[] = [];
          try {
            const items = fs.readdirSync(dir);
            for (const item of items) {
              const fullPath = path.join(dir, item);
              try {
                const stat = fs.statSync(fullPath);
                if (stat.isFile()) {
                  if (item === 'latest.json' ||
                      item.includes(userId) ||
                      (item.endsWith('.json') && item.includes('cookie'))) {
                    results.push(fullPath);
                  }
                } else if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
                  results.push(...findFiles(fullPath, maxDepth - 1));
                }
              } catch (statError) {
                // 忽略权限错误
              }
            }
          } catch (readError) {
            // 忽略权限错误
          }
          return results;
        };

        const foundFiles = findFiles(searchPath);
        for (const foundFile of foundFiles) {
          try {
            if (fs.existsSync(foundFile)) {
              fs.unlinkSync(foundFile);
              filesToDelete.push(foundFile);
              console.log(`[Logout] ✅ Global cleanup - deleted: ${foundFile}`);
            }
          } catch (globalError) {
            console.warn(`[Logout] Failed to delete global file ${foundFile}: ${globalError instanceof Error ? globalError.message : String(globalError)}`);
          }
        }
      } catch (globalSearchError) {
        console.warn(`[Logout] Failed to search path ${searchPath}: ${globalSearchError instanceof Error ? globalSearchError.message : String(globalSearchError)}`);
      }
    }

    console.log(`[Logout] ✅ Logout completed for user ${userId}. Deleted ${filesToDelete.length} files/directories.`);

    // 5. 🔥 清理数据库中的Cookie（关键！防止从数据库重新加载旧Cookie）
    try {
      console.log(`[Logout] 🗑️  开始清理数据库Cookie...`);
      const axios = await import('axios');

      // 🔥 调用后端服务删除数据库Cookie
      const backendUrl = process.env.CLAUDE_AGENT_URL
        || process.env.BACKEND_URL
        || 'https://xiaohongshu-automation-ai.zeabur.app';

      const deleteResponse = await axios.default.post(
        `${backendUrl}/agent/xiaohongshu/delete-cookies-from-db`,
        { userId },
        { timeout: 10000, headers: { 'Content-Type': 'application/json' } }
      );

      if (deleteResponse.data?.success) {
        console.log(`[Logout] ✅ 数据库Cookie删除成功`);
      } else {
        console.warn(`[Logout] ⚠️  数据库Cookie删除失败: ${deleteResponse.data?.error || 'Unknown error'}`);
      }
    } catch (dbDeleteError) {
      console.warn(`[Logout] ⚠️  数据库Cookie删除失败:`, dbDeleteError instanceof Error ? dbDeleteError.message : String(dbDeleteError));
    }

    // 6. 🔥 清理rod浏览器的UserDataDir（关键！防止浏览器缓存残留Cookie）
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // rod浏览器默认UserDataDir在 /tmp/rod/user-data-{random}
      // 清理所有可能的rod临时目录
      const cleanupCommands = [
        // 清理rod浏览器缓存
        'rm -rf /tmp/rod/user-data-* 2>/dev/null || true',
        // 清理chromium临时目录
        'rm -rf /tmp/.com.google.Chrome.* 2>/dev/null || true',
        'rm -rf /tmp/chromium-* 2>/dev/null || true',
      ];

      console.log(`[Logout] 🧹 开始清理浏览器UserDataDir缓存...`);
      for (const cmd of cleanupCommands) {
        try {
          await execAsync(cmd);
          console.log(`[Logout] ✅ 执行清理命令: ${cmd}`);
        } catch (cmdError) {
          // 命令失败不影响流程（可能目录不存在）
          console.log(`[Logout] ⚠️ 清理命令跳过: ${cmd}`);
        }
      }
      console.log(`[Logout] ✅ 浏览器UserDataDir缓存清理完成`);
    } catch (userDataError) {
      console.warn(`[Logout] UserDataDir清理失败: ${userDataError instanceof Error ? userDataError.message : String(userDataError)}`);
    }

    // 7. 验证清理结果
    const remainingFiles: string[] = [];
    for (const basePath of allPossibleCookiePaths) {
      try {
        if (!fs.existsSync(basePath)) continue;
        const files = fs.readdirSync(basePath);
        const suspicious = files.filter(f => f === 'latest.json' || f.includes(userId));
        if (suspicious.length > 0) {
          remainingFiles.push(...suspicious.map(f => path.join(basePath, f)));
        }
      } catch (e) {
        // 忽略错误
      }
    }

    res.json({
      success: true,
      message: 'Logout successful - comprehensive cleanup across all paths',
      data: {
        userId,
        logged_out: true,
        files_cleaned: filesToDelete,
        cleanup_summary: {
          total_files_deleted: filesToDelete.length,
          paths_checked: allPossibleCookiePaths.length,
          critical_files_targeted: criticalFiles,
          remaining_suspicious_files: remainingFiles,
        },
        cleanup_verification: {
          comprehensive_cleanup: true,
          cross_path_cleanup: true,
          global_search_performed: true,
          remaining_files_count: remainingFiles.length
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error(`[Logout] Error processing logout for user: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to logout'
    });
  }
});

// 🔥 强制清理端点 - 彻底清除所有Cookie和状态
app.post('/api/xiaohongshu/force-cleanup', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    console.log(`[Force Cleanup] 🧹 开始彻底清理用户 ${userId} 的所有状态`);
    const cleaned: string[] = [];

    // 1. 杀死 MCP 进程
    try {
      await processManager.killProcess(userId);
      console.log(`[Force Cleanup] ✅ 已杀死 MCP 进程`);
      cleaned.push('MCP进程');
    } catch (processError) {
      console.warn(`[Force Cleanup] ⚠️  杀死进程失败:`, processError);
    }

    // 2. 清除所有 Cookie 文件
    const cookiePaths = [
      // 持久化卷
      path.join(COOKIE_DIR, userId, 'cookies.json'),
      // 符号链接
      '/app/data/cookies.json',
      // 工作目录
      path.join(process.cwd(), 'cookies', userId, 'cookies.json'),
      // 其他可能的路径
      path.join('/app/playwright-service/mcp-router/cookies', userId, 'cookies.json'),
      path.join('/app/playwright-service/claude-agent-service/cookies', userId, 'cookies.json'),
    ];

    for (const cookiePath of cookiePaths) {
      try {
        if (fs.existsSync(cookiePath)) {
          const stats = fs.lstatSync(cookiePath);
          if (stats.isSymbolicLink()) {
            fs.unlinkSync(cookiePath);
            console.log(`[Force Cleanup] ✅ 已删除符号链接: ${cookiePath}`);
            cleaned.push(`符号链接: ${cookiePath}`);
          } else if (stats.isFile()) {
            fs.writeFileSync(cookiePath, '[]', 'utf8');
            console.log(`[Force Cleanup] ✅ 已清空文件: ${cookiePath}`);
            cleaned.push(`文件: ${cookiePath}`);
          }
        }
      } catch (fileError) {
        console.warn(`[Force Cleanup] ⚠️  处理文件失败 ${cookiePath}:`, fileError);
      }
    }

    // 3. 清除用户目录
    try {
      const userDir = path.join(COOKIE_DIR, userId);
      if (fs.existsSync(userDir)) {
        fs.rmSync(userDir, { recursive: true, force: true });
        console.log(`[Force Cleanup] ✅ 已删除用户目录: ${userDir}`);
        cleaned.push(`用户目录: ${userDir}`);
      }
    } catch (dirError) {
      console.warn(`[Force Cleanup] ⚠️  删除用户目录失败:`, dirError);
    }

    // 4. 清理 latest.json (AutoCookieImporter 监控源)
    const latestPaths = [
      '/tmp/xiaohongshu_cookies.json',
      '/app/mcp-router/cookies/latest.json',
      path.join(process.cwd(), 'cookies', 'latest.json'),
    ];

    for (const latestPath of latestPaths) {
      try {
        if (fs.existsSync(latestPath)) {
          fs.unlinkSync(latestPath);
          console.log(`[Force Cleanup] ✅ 已删除监控源: ${latestPath}`);
          cleaned.push(`监控源: ${latestPath}`);
        }
      } catch (latestError) {
        console.warn(`[Force Cleanup] ⚠️  删除监控源失败 ${latestPath}:`, latestError);
      }
    }

    res.json({
      success: true,
      message: '彻底清理完成',
      userId,
      cleaned,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('[Force Cleanup] ❌ 清理失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 启动服务器
app.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`[MCP Router HTTP] Server listening on 0.0.0.0:${HTTP_PORT}`);
  console.log(`[MCP Router HTTP] Health check: http://localhost:${HTTP_PORT}/health`);
  console.log(`[MCP Router HTTP] Stats: http://localhost:${HTTP_PORT}/stats`);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('[MCP Router HTTP] Shutting down...');
  processManager.cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[MCP Router HTTP] Shutting down...');
  processManager.cleanup();
  process.exit(0);
});
