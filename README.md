# 小红书代理服务 (Xiaohongshu Proxy)

一个基于 Claude SDK 和 MCP 协议的多用户小红书自动化服务平台，让用户通过简单的 API 调用实现小红书内容的自动化管理。

## 🌟 核心特性

- **多用户支持**: 完整的用户注册、认证和权限管理系统
- **智能AI集成**: 基于 Claude 大模型的智能内容处理
- **MCP协议**: 集成小红书 MCP 服务，支持登录、发布、搜索等功能
- **安全可靠**: JWT 认证 + API Key 双重认证机制
- **容器化部署**: 一键 Docker 部署，支持水平扩展
- **监控统计**: 完整的使用记录和成本统计

## 🏗️ 系统架构

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   用户客户端     │───▶│  xiaohongshu-   │───▶│  xiaohongshu-   │
│                │    │     proxy       │    │      mcp        │
│ - Web/Mobile   │    │                 │    │                 │
│ - API Client   │    │ - 用户管理       │    │ - 小红书API     │
│ - Third Party  │    │ - 认证授权       │    │ - 浏览器自动化   │
└─────────────────┘    │ - Claude集成     │    │ - 账号管理       │
                       │ - MCP连接池      │    └─────────────────┘
                       └─────────────────┘
                              │
                       ┌─────────────────┐
                       │   基础设施       │
                       │                 │
                       │ - PostgreSQL    │
                       │ - Redis         │
                       │ - Nginx         │
                       └─────────────────┘
```

## 🚀 快速开始

### 前置要求

- Docker & Docker Compose
- Claude API Key
- 小红书账号

### 1. 克隆项目

```bash
git clone https://github.com/your-username/xiaohongshu-proxy.git
cd xiaohongshu-proxy
```

### 2. 配置环境变量

```bash
cp deployments/docker/.env.example deployments/docker/.env
```

编辑 `.env` 文件，填入必要配置：

```bash
# Claude API 密钥
CLAUDE_API_KEY=your-claude-api-key

# JWT 密钥（生产环境必须修改）
JWT_SECRET=your-super-secure-jwt-secret

# 数据库密码
DB_PASSWORD=your-secure-password
```

### 3. 一键部署

```bash
./scripts/deploy.sh
```

### 4. 验证部署

```bash
curl http://localhost:8080/health
```

## 📖 API 文档

### 认证相关

#### 用户注册
```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "username": "testuser",
  "email": "test@example.com",
  "password": "password123",
  "name": "Test User"
}
```

#### 用户登录
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "username": "testuser",
  "password": "password123"
}
```

响应：
```json
{
  "code": 200,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "user-id",
      "username": "testuser",
      "email": "test@example.com",
      "api_key": "xhp_xxxxxxxxx"
    },
    "token": "jwt-token"
  }
}
```

### 小红书功能

#### 检查登录状态
```http
GET /api/v1/xiaohongshu/login-status
Authorization: Bearer <jwt-token>
```

#### 发布内容
```http
POST /api/v1/xiaohongshu/publish
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "title": "春天的美好",
  "content": "春天来了，万物复苏，到处都是生机盎然的景象。",
  "images": [
    "/path/to/image1.jpg",
    "https://example.com/image2.jpg"
  ],
  "tags": ["春天", "美景", "生活"]
}
```

#### 搜索内容
```http
POST /api/v1/xiaohongshu/search
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "keyword": "美食",
  "limit": 10
}
```

#### 获取推荐内容
```http
GET /api/v1/xiaohongshu/feeds/recommended
Authorization: Bearer <jwt-token>
```

### API Key 认证

除了 JWT 认证，所有小红书功能 API 也支持 API Key 认证：

```http
POST /api/v1/xiaohongshu/api/publish
X-API-Key: xhp_xxxxxxxxx
Content-Type: application/json

{
  "title": "标题",
  "content": "内容"
}
```

## 💡 使用示例

### Python 客户端示例

```python
import requests

class XiaohongshuClient:
    def __init__(self, base_url, api_key):
        self.base_url = base_url
        self.headers = {
            'X-API-Key': api_key,
            'Content-Type': 'application/json'
        }

    def publish_content(self, title, content, images=None, tags=None):
        data = {
            'title': title,
            'content': content,
            'images': images or [],
            'tags': tags or []
        }

        response = requests.post(
            f'{self.base_url}/api/v1/xiaohongshu/api/publish',
            json=data,
            headers=self.headers
        )

        return response.json()

    def search_feeds(self, keyword, limit=10):
        data = {
            'keyword': keyword,
            'limit': limit
        }

        response = requests.post(
            f'{self.base_url}/api/v1/xiaohongshu/api/search',
            json=data,
            headers=self.headers
        )

        return response.json()

# 使用示例
client = XiaohongshuClient('http://localhost:8080', 'your-api-key')

# 发布内容
result = client.publish_content(
    title='美食分享',
    content='今天做了一道超级好吃的菜，分享给大家！',
    images=['/path/to/food.jpg'],
    tags=['美食', '制作', '分享']
)

print(result)
```

### Node.js 客户端示例

```javascript
const axios = require('axios');

class XiaohongshuClient {
    constructor(baseUrl, apiKey) {
        this.client = axios.create({
            baseURL: baseUrl,
            headers: {
                'X-API-Key': apiKey,
                'Content-Type': 'application/json'
            }
        });
    }

    async publishContent(title, content, images = [], tags = []) {
        try {
            const response = await this.client.post('/api/v1/xiaohongshu/api/publish', {
                title,
                content,
                images,
                tags
            });
            return response.data;
        } catch (error) {
            throw new Error(`发布失败: ${error.response?.data?.message || error.message}`);
        }
    }

    async searchFeeds(keyword, limit = 10) {
        try {
            const response = await this.client.post('/api/v1/xiaohongshu/api/search', {
                keyword,
                limit
            });
            return response.data;
        } catch (error) {
            throw new Error(`搜索失败: ${error.response?.data?.message || error.message}`);
        }
    }
}

// 使用示例
const client = new XiaohongshuClient('http://localhost:8080', 'your-api-key');

client.publishContent('旅行日记', '今天去了一个超美的地方！', ['/path/to/photo.jpg'], ['旅行', '美景'])
    .then(result => console.log('发布成功:', result))
    .catch(error => console.error('发布失败:', error));
```

## 🏢 商业化部署

### 环境要求

- **最低配置**: 2核4G，适合测试和小规模使用
- **推荐配置**: 4核8G，支持中等规模用户
- **高性能配置**: 8核16G+，支持大规模用户

### 性能优化

1. **数据库优化**
   - 配置 PostgreSQL 连接池
   - 添加适当的数据库索引
   - 定期数据清理和归档

2. **缓存优化**
   - 使用 Redis 缓存热点数据
   - 配置合适的缓存过期策略

3. **负载均衡**
   - 配置 Nginx 负载均衡
   - 支持多实例水平扩展

### 监控和日志

```bash
# 查看服务日志
docker-compose logs -f xiaohongshu-proxy

# 查看数据库连接
docker-compose exec postgres psql -U postgres -d xiaohongshu_proxy -c "SELECT * FROM pg_stat_activity;"

# 查看Redis状态
docker-compose exec redis redis-cli info stats
```

## 🔧 开发指南

### 本地开发

```bash
# 安装依赖
go mod download

# 启动数据库（开发环境）
docker-compose up -d postgres redis

# 运行服务
go run cmd/server/main.go
```

### 项目结构

```
xiaohongshu-proxy/
├── cmd/                 # 应用入口
├── internal/            # 内部包
│   ├── api/            # API 层
│   ├── auth/           # 认证服务
│   ├── claude/         # Claude 集成
│   ├── config/         # 配置管理
│   ├── mcp/            # MCP 连接管理
│   └── user/           # 用户管理
├── pkg/                 # 公共包
├── configs/             # 配置文件
├── deployments/         # 部署配置
└── docs/               # 文档
```

## 🛡️ 安全说明

### 重要提醒

1. **生产环境必须修改默认密码**
2. **定期更新 JWT 密钥**
3. **使用 HTTPS 保护 API 通信**
4. **遵守小红书服务条款**
5. **注意用户隐私保护**

### 风险控制

- 实现 API 调用频率限制
- 监控异常使用行为
- 定期备份用户数据
- 建立告警和监控机制

## 📋 路线图

- [ ] 支持更多小红书功能（评论、点赞等）
- [ ] 添加用户套餐和计费系统
- [ ] 支持多平台集成（抖音、微博等）
- [ ] 提供可视化管理界面
- [ ] 添加 AI 内容生成功能
- [ ] 支持团队协作功能

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📄 许可证

本项目采用 MIT 许可证。详情请参阅 [LICENSE](LICENSE) 文件。

## ⚖️ 免责声明

本项目仅供学习和研究使用，禁止一切违法行为。使用者需要：

1. 遵守当地法律法规
2. 遵守小红书平台规则
3. 承担使用风险和责任
4. 保护用户隐私和数据安全

## 📞 支持与反馈

- 🐛 Bug 报告: [GitHub Issues](https://github.com/your-username/xiaohongshu-proxy/issues)
- 💡 功能建议: [GitHub Discussions](https://github.com/your-username/xiaohongshu-proxy/discussions)
- 📧 邮件联系: support@yourcompany.com

---

**⭐ 如果这个项目对你有帮助，请给我们一个 Star！**