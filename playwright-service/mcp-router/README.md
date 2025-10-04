# Xiaohongshu MCP Router

多用户小红书 MCP 路由服务 - 通过进程隔离实现多用户支持

## 架构设计

```
Claude Agent SDK
    ↓ MCP Protocol (stdio)
MCP Router (本项目)
    ├─ 提取 userId
    ├─ 动态创建/获取用户进程
    └─ 转发请求到对应进程
         ↓
xiaohongshu-mcp 进程池
    ├─ 用户A进程 (Port 18060, Cookie A)
    ├─ 用户B进程 (Port 18061, Cookie B)
    └─ ...
         ↓
小红书网站
```

## 核心特性

- ✅ **多用户隔离**: 每个用户独立的 xiaohongshu-mcp 进程和 Cookie
- ✅ **动态管理**: 按需创建进程，自动复用已有进程
- ✅ **自动清理**: 10分钟不活动自动清理进程
- ✅ **并发控制**: 最多20个并发进程，自动淘汰最久未使用
- ✅ **完整功能**: 支持 xiaohongshu-mcp 的全部9个工具
- ✅ **端口分配**: 自动分配端口（18060-19060）

## 支持的工具

1. **xiaohongshu_check_login** - 检查登录状态
2. **xiaohongshu_get_login_qrcode** - 获取登录二维码
3. **xiaohongshu_publish_content** - 发布图文内容
4. **xiaohongshu_publish_video** - 发布视频内容
5. **xiaohongshu_list_feeds** - 获取推荐内容列表
6. **xiaohongshu_search_feeds** - 搜索内容
7. **xiaohongshu_get_feed_detail** - 获取帖子详情
8. **xiaohongshu_post_comment** - 发表评论
9. **xiaohongshu_user_profile** - 获取用户资料

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，配置路径
```

### 3. 编译

```bash
npm run build
```

### 4. 测试

```bash
node test-router.js
```

### 5. 启动 MCP Server

```bash
npm start
```

## 配置说明

### 环境变量 (.env)

```env
# xiaohongshu-mcp 二进制文件路径
MCP_BINARY_PATH=./xiaohongshu-mcp

# Cookie 存储目录
COOKIE_DIR=./cookies

# 进程管理配置
MAX_PROCESSES=20           # 最多并发进程数
CLEANUP_TIMEOUT=600000     # 清理超时时间（毫秒）
BASE_PORT=18060            # 起始端口号
```

## 与 Claude Agent SDK 集成

### 方式1: Claude Code CLI

在 `.claude.json` 中配置：

```json
{
  "mcpServers": {
    "xiaohongshu": {
      "command": "node",
      "args": ["/path/to/mcp-router/dist/index.js"]
    }
  }
}
```

### 方式2: 编程式集成

```typescript
import { MCPClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['/path/to/mcp-router/dist/index.js']
});

const client = new MCPClient({ name: 'my-app', version: '1.0.0' });
await client.connect(transport);

// 调用工具
const result = await client.callTool({
  name: 'xiaohongshu_check_login',
  arguments: { userId: 'user-123' }
});
```

## API 调用示例

### 检查登录状态

```json
{
  "name": "xiaohongshu_check_login",
  "arguments": {
    "userId": "user-123"
  }
}
```

### 获取登录二维码

```json
{
  "name": "xiaohongshu_get_login_qrcode",
  "arguments": {
    "userId": "user-123"
  }
}
```

### 发布图文内容

```json
{
  "name": "xiaohongshu_publish_content",
  "arguments": {
    "userId": "user-123",
    "title": "我的标题",
    "content": "文章内容...",
    "images": ["/path/to/image1.jpg", "/path/to/image2.jpg"],
    "tags": ["标签1", "标签2"]
  }
}
```

## 进程管理

### 查看统计信息

```javascript
// 通过 processManager.getStats()
{
  "activeProcesses": 2,
  "maxProcesses": 20,
  "processes": [
    {
      "userId": "user-a",
      "port": 18060,
      "lastUsed": "2025-10-04T04:28:18.550Z",
      "inactive": 8122
    }
  ]
}
```

### 自动清理机制

- 每个进程有独立的清理计时器
- 10分钟（可配置）不活动自动清理
- 每次请求会重置计时器
- 达到最大进程数时，淘汰最久未使用的进程

## 目录结构

```
mcp-router/
├── src/
│   ├── index.ts           # MCP Server 主程序
│   └── processManager.ts  # 进程管理器
├── dist/                  # 编译输出
├── cookies/               # Cookie 存储目录
├── .env                   # 环境变量配置
├── package.json
├── tsconfig.json
├── test-router.js         # 测试脚本
└── xiaohongshu-mcp        # xiaohongshu-mcp 二进制
```

## 开发

### 本地开发

```bash
npm run dev
```

### 测试

```bash
node test-router.js
```

### 编译

```bash
npm run build
```

## 故障排查

### 进程启动失败

检查 xiaohongshu-mcp 二进制文件：
- 路径是否正确
- 是否有执行权限 (`chmod +x xiaohongshu-mcp`)
- 端口是否被占用

### Cookie 丢失

Cookie 存储在 `./cookies/{userId}.json`，确保：
- 目录存在且有写权限
- 文件未被删除

### 内存占用过高

调整配置：
- 减少 `MAX_PROCESSES`
- 缩短 `CLEANUP_TIMEOUT`

## 性能优化

### 资源消耗

- 每个进程约 150-300MB 内存
- 20个进程约 3-6GB 内存
- CPU 使用取决于操作频率

### 优化建议

1. 根据实际并发调整 `MAX_PROCESSES`
2. 缩短 `CLEANUP_TIMEOUT` 加快资源释放
3. 使用负载均衡分散到多台机器

## 安全注意事项

1. **Cookie 保护**: Cookie 文件包含用户凭证，务必保护好
2. **访问控制**: 确保只有授权用户能调用 MCP Server
3. **资源限制**: 设置合理的 `MAX_PROCESSES` 防止资源耗尽
4. **日志审计**: 记录所有操作日志，便于追踪

## 生产部署

### 使用 PM2

```bash
npm install -g pm2
pm2 start dist/index.js --name xiaohongshu-mcp-router
pm2 save
pm2 startup
```

### 使用 Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm install && npm run build
CMD ["npm", "start"]
```

## 许可证

MIT

## 相关项目

- [xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp) - 小红书 MCP 服务
- [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview) - Anthropic 官方 SDK
