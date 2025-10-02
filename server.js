const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'xiaohongshu-proxy-demo-secret';

// 内存数据库（演示用）
const users = [];
const usage_records = [];

// 中间件
app.use(cors());
app.use(express.json());

// 工具函数
function generateApiKey() {
    return 'xhp_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ code: 401, message: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ code: 403, message: 'Invalid token' });
        }
        req.user = user;
        next();
    });
}

function authenticateApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        return res.status(401).json({ code: 401, message: 'API key required' });
    }

    const user = users.find(u => u.api_key === apiKey);
    if (!user) {
        return res.status(401).json({ code: 401, message: 'Invalid API key' });
    }

    req.user = user;
    next();
}

// 健康检查
app.get('/health', (req, res) => {
    res.json({
        code: 200,
        message: 'Service is healthy',
        data: {
            status: 'ok',
            timestamp: new Date().toISOString(),
            version: '1.0.0-demo'
        }
    });
});

// 用户注册
app.post('/api/v1/auth/register', async (req, res) => {
    try {
        const { username, email, password, name } = req.body;

        // 检查用户是否已存在
        if (users.find(u => u.username === username || u.email === email)) {
            return res.status(400).json({
                code: 400,
                message: 'User already exists'
            });
        }

        // 创建新用户
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = {
            id: Date.now().toString(),
            username,
            email,
            name: name || username,
            password: hashedPassword,
            api_key: generateApiKey(),
            is_active: true,
            created_at: new Date().toISOString()
        };

        users.push(user);

        // 返回用户信息（不包含密码）
        const { password: _, ...userInfo } = user;
        res.status(201).json({
            code: 201,
            message: 'User registered successfully',
            data: { user: userInfo }
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: 'Internal server error'
        });
    }
});

// 用户登录
app.post('/api/v1/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // 查找用户
        const user = users.find(u => u.username === username);
        if (!user) {
            return res.status(401).json({
                code: 401,
                message: 'Invalid credentials'
            });
        }

        // 验证密码
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({
                code: 401,
                message: 'Invalid credentials'
            });
        }

        // 生成JWT令牌
        const token = jwt.sign(
            { user_id: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        // 返回用户信息和令牌
        const { password: _, ...userInfo } = user;
        res.json({
            code: 200,
            message: 'Login successful',
            data: {
                user: userInfo,
                token
            }
        });
    } catch (error) {
        res.status(500).json({
            code: 500,
            message: 'Internal server error'
        });
    }
});

// JWT认证路由
app.get('/api/v1/xiaohongshu/login-status', authenticateToken, (req, res) => {
    res.json({
        code: 200,
        message: 'User is logged in',
        data: {
            user_id: req.user.user_id,
            username: req.user.username,
            xiaohongshu_status: 'logged_in',
            last_check: new Date().toISOString()
        }
    });
});

app.post('/api/v1/xiaohongshu/publish', authenticateToken, (req, res) => {
    const { title, content, images, tags } = req.body;

    // 记录使用情况
    usage_records.push({
        user_id: req.user.user_id,
        action: 'publish',
        timestamp: new Date().toISOString(),
        data: { title, content, images, tags }
    });

    res.json({
        code: 200,
        message: 'Content published successfully',
        data: {
            post_id: Date.now().toString(),
            title,
            content,
            images: images || [],
            tags: tags || [],
            published_at: new Date().toISOString()
        }
    });
});

app.post('/api/v1/xiaohongshu/search', authenticateToken, (req, res) => {
    const { keyword, limit } = req.body;

    // 记录使用情况
    usage_records.push({
        user_id: req.user.user_id,
        action: 'search',
        timestamp: new Date().toISOString(),
        data: { keyword, limit }
    });

    // 模拟搜索结果
    const results = Array.from({ length: Math.min(limit || 5, 10) }, (_, i) => ({
        id: (Date.now() + i).toString(),
        title: `${keyword}相关内容 ${i + 1}`,
        content: `这是关于${keyword}的精彩内容分享...`,
        author: `用户${i + 1}`,
        likes: Math.floor(Math.random() * 1000),
        created_at: new Date(Date.now() - Math.random() * 86400000).toISOString()
    }));

    res.json({
        code: 200,
        message: 'Search completed successfully',
        data: {
            keyword,
            total: results.length,
            results
        }
    });
});

app.get('/api/v1/xiaohongshu/feeds/recommended', authenticateToken, (req, res) => {
    // 记录使用情况
    usage_records.push({
        user_id: req.user.user_id,
        action: 'get_recommended',
        timestamp: new Date().toISOString()
    });

    // 模拟推荐内容
    const feeds = Array.from({ length: 10 }, (_, i) => ({
        id: (Date.now() + i).toString(),
        title: `推荐内容 ${i + 1}`,
        content: `这是为你推荐的精彩内容...`,
        author: `推荐用户${i + 1}`,
        likes: Math.floor(Math.random() * 2000),
        tags: ['推荐', '热门', '精选'],
        created_at: new Date(Date.now() - Math.random() * 86400000).toISOString()
    }));

    res.json({
        code: 200,
        message: 'Recommended feeds retrieved successfully',
        data: { feeds }
    });
});

// API Key认证路由
app.get('/api/v1/xiaohongshu/api/login-status', authenticateApiKey, (req, res) => {
    res.json({
        code: 200,
        message: 'User is logged in',
        data: {
            user_id: req.user.id,
            username: req.user.username,
            xiaohongshu_status: 'logged_in',
            last_check: new Date().toISOString()
        }
    });
});

app.post('/api/v1/xiaohongshu/api/publish', authenticateApiKey, (req, res) => {
    const { title, content, images, tags } = req.body;

    // 记录使用情况
    usage_records.push({
        user_id: req.user.id,
        action: 'publish',
        timestamp: new Date().toISOString(),
        data: { title, content, images, tags }
    });

    res.json({
        code: 200,
        message: 'Content published successfully',
        data: {
            post_id: Date.now().toString(),
            title,
            content,
            images: images || [],
            tags: tags || [],
            published_at: new Date().toISOString()
        }
    });
});

app.post('/api/v1/xiaohongshu/api/search', authenticateApiKey, (req, res) => {
    const { keyword, limit } = req.body;

    // 记录使用情况
    usage_records.push({
        user_id: req.user.id,
        action: 'search',
        timestamp: new Date().toISOString(),
        data: { keyword, limit }
    });

    // 模拟搜索结果
    const results = Array.from({ length: Math.min(limit || 5, 10) }, (_, i) => ({
        id: (Date.now() + i).toString(),
        title: `${keyword}相关内容 ${i + 1}`,
        content: `这是关于${keyword}的精彩内容分享...`,
        author: `用户${i + 1}`,
        likes: Math.floor(Math.random() * 1000),
        created_at: new Date(Date.now() - Math.random() * 86400000).toISOString()
    }));

    res.json({
        code: 200,
        message: 'Search completed successfully',
        data: {
            keyword,
            total: results.length,
            results
        }
    });
});

app.get('/api/v1/xiaohongshu/api/feeds/recommended', authenticateApiKey, (req, res) => {
    // 记录使用情况
    usage_records.push({
        user_id: req.user.id,
        action: 'get_recommended',
        timestamp: new Date().toISOString()
    });

    // 模拟推荐内容
    const feeds = Array.from({ length: 10 }, (_, i) => ({
        id: (Date.now() + i).toString(),
        title: `推荐内容 ${i + 1}`,
        content: `这是为你推荐的精彩内容...`,
        author: `推荐用户${i + 1}`,
        likes: Math.floor(Math.random() * 2000),
        tags: ['推荐', '热门', '精选'],
        created_at: new Date(Date.now() - Math.random() * 86400000).toISOString()
    }));

    res.json({
        code: 200,
        message: 'Recommended feeds retrieved successfully',
        data: { feeds }
    });
});

// 统计接口
app.get('/api/v1/admin/stats', (req, res) => {
    res.json({
        code: 200,
        message: 'Stats retrieved successfully',
        data: {
            total_users: users.length,
            total_usage: usage_records.length,
            recent_activity: usage_records.slice(-10).reverse()
        }
    });
});

// 404处理
app.use('*', (req, res) => {
    res.status(404).json({
        code: 404,
        message: 'Endpoint not found'
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`🚀 小红书代理服务演示版已启动`);
    console.log(`🔗 服务地址: http://localhost:${PORT}`);
    console.log(`🔍 健康检查: http://localhost:${PORT}/health`);
    console.log(`📖 API文档: 请查看 README.md`);
    console.log(`\n📋 测试步骤:`);
    console.log(`1. 注册用户: curl -X POST http://localhost:${PORT}/api/v1/auth/register -H "Content-Type: application/json" -d '{"username":"test","email":"test@example.com","password":"test123","name":"Test User"}'`);
    console.log(`2. 登录获取token: curl -X POST http://localhost:${PORT}/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"test","password":"test123"}'`);
    console.log(`3. 使用token调用API或直接使用API Key`);
});