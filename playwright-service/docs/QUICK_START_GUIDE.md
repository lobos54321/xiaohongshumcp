# Claude Agent SDK 与小红书服务集成 - 快速入门指南

## 目录
1. [环境准备](#环境准备)
2. [创建 MCP 服务器](#创建-mcp-服务器)
3. [配置和运行](#配置和运行)
4. [使用示例](#使用示例)
5. [故障排查](#故障排查)

---

## 环境准备

### 前置条件

- Node.js 18+
- TypeScript
- 运行中的 Playwright 服务 (http://localhost:3001)
- Anthropic API Key

### 安装依赖

```bash
# 1. 进入项目目录
cd /path/to/playwright-service

# 2. 创建 MCP 服务器目录
mkdir mcp-server
cd mcp-server

# 3. 初始化项目
npm init -y

# 4. 安装依赖
npm install @modelcontextprotocol/sdk zod axios dotenv
npm install -D typescript @types/node

# 5. 初始化 TypeScript
npx tsc --init
```

### 获取 Anthropic API Key

1. 访问 https://console.anthropic.com/
2. 登录或注册账号
3. 进入 API Keys 页面
4. 创建新的 API Key
5. 复制并保存 Key (格式: sk-ant-api03-xxx)

---

## 创建 MCP 服务器

### 1. 创建项目结构

```bash
mcp-server/
├── package.json
├── tsconfig.json
├── .env
├── src/
│   ├── index.ts
│   ├── tools/
│   │   ├── login.ts
│   │   ├── publish.ts
│   │   └── status.ts
│   └── client.ts
└── dist/
```

### 2. 配置 TypeScript (tsconfig.json)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

### 3. 配置 package.json

```json
{
  "name": "xiaohongshu-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "description": "MCP server for Xiaohongshu automation via Playwright service",
  "main": "dist/index.js",
  "bin": {
    "xiaohongshu-mcp": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc -w",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "latest",
    "axios": "^1.6.0",
    "dotenv": "^16.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0"
  }
}
```

### 4. 环境变量 (.env)

```bash
# Playwright 服务地址
PLAYWRIGHT_SERVICE_URL=http://localhost:3001

# 可选: 日志级别
LOG_LEVEL=info
```

### 5. HTTP 客户端 (src/client.ts)

```typescript
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const PLAYWRIGHT_SERVICE_URL = process.env.PLAYWRIGHT_SERVICE_URL || 'http://localhost:3001';

export const apiClient = axios.create({
  baseURL: PLAYWRIGHT_SERVICE_URL,
  timeout: 120000, // 2分钟超时
  headers: {
    'Content-Type': 'application/json'
  }
});

/**
 * 轮询任务状态直到完成
 */
export async function pollTaskStatus(taskId: string, timeout: number = 180000): Promise<any> {
  const startTime = Date.now();
  const pollInterval = 2000; // 2秒轮询一次

  while (Date.now() - startTime < timeout) {
    const response = await apiClient.get(`/api/task/${taskId}`);
    const status = response.data;

    console.error(`Task ${taskId} status: ${status.status} (${status.progress || 0}%)`);

    if (status.status === 'completed') {
      return status.result;
    } else if (status.status === 'failed') {
      throw new Error(`Task failed: ${status.error || 'Unknown error'}`);
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Task timeout after ${timeout}ms`);
}
```

### 6. 工具实现 (src/tools/login.ts)

```typescript
import { z } from 'zod';
import { apiClient } from '../client.js';

export const getLoginQrTool = {
  name: 'xiaohongshu_get_login_qr',
  description: 'Get Xiaohongshu login QR code for a user. User needs to scan with Xiaohongshu app.',
  schema: {
    userId: z.string().describe('Unique user ID for this login session')
  },
  handler: async ({ userId }: { userId: string }) => {
    try {
      const response = await apiClient.post('/api/login/qrcode', { userId });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            qrcode: response.data.qrcode,
            userId,
            instructions: [
              '1. Save the QR code (base64 image)',
              '2. Display it to the user',
              '3. User scans with Xiaohongshu app',
              '4. Use xiaohongshu_check_login to verify login status'
            ]
          }, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text' as const,
          text: `Failed to get login QR: ${error.message}`
        }],
        isError: true
      };
    }
  }
};

export const checkLoginTool = {
  name: 'xiaohongshu_check_login',
  description: 'Check if user has successfully logged in by scanning the QR code',
  schema: {
    userId: z.string().describe('User ID to check login status for')
  },
  handler: async ({ userId }: { userId: string }) => {
    try {
      const response = await apiClient.get('/api/login/status', {
        params: { userId }
      });

      const { status } = response.data;
      const isLoggedIn = status === 'logged_in';

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            userId,
            status,
            isLoggedIn,
            message: isLoggedIn
              ? 'User is logged in. You can now publish posts.'
              : 'User not logged in yet. Please wait for QR scan.'
          }, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text' as const,
          text: `Failed to check login status: ${error.message}`
        }],
        isError: true
      };
    }
  }
};

export const logoutTool = {
  name: 'xiaohongshu_logout',
  description: 'Logout user and clear stored cookies',
  schema: {
    userId: z.string().describe('User ID to logout')
  },
  handler: async ({ userId }: { userId: string }) => {
    try {
      const response = await apiClient.delete(`/api/login/${userId}`);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            userId,
            message: 'User logged out successfully'
          }, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text' as const,
          text: `Failed to logout: ${error.message}`
        }],
        isError: true
      };
    }
  }
};
```

### 7. 发布工具 (src/tools/publish.ts)

```typescript
import { z } from 'zod';
import { apiClient, pollTaskStatus } from '../client.js';

export const previewPostTool = {
  name: 'xiaohongshu_preview_post',
  description: 'Preview Xiaohongshu post before publishing. Returns a screenshot of how the post will look.',
  schema: {
    userId: z.string().describe('User ID (must be logged in)'),
    title: z.string().min(1).max(20).describe('Post title (1-20 characters)'),
    content: z.string().min(1).max(1000).describe('Post content (1-1000 characters)'),
    images: z.array(z.string()).max(9).optional().describe('Array of image file paths (max 9 images)'),
    tags: z.array(z.string()).optional().describe('Array of tags (e.g. ["AI", "自动化"])')
  },
  handler: async (args: {
    userId: string;
    title: string;
    content: string;
    images?: string[];
    tags?: string[];
  }) => {
    try {
      // 提交预览任务
      const response = await apiClient.post('/api/publish', {
        userId: args.userId,
        mode: 'preview',
        title: args.title,
        content: args.content,
        images: args.images || [],
        tags: args.tags || []
      });

      const { taskId } = response.data;
      console.error(`Preview task submitted: ${taskId}`);

      // 轮询任务状态
      const result = await pollTaskStatus(taskId, 120000);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            taskId,
            screenshot: result.screenshot,
            message: 'Preview generated. Review the screenshot before publishing.',
            nextSteps: [
              'Review the screenshot',
              'If satisfied, use xiaohongshu_publish_post to publish',
              'If not satisfied, adjust and preview again'
            ]
          }, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text' as const,
          text: `Failed to preview post: ${error.message}`
        }],
        isError: true
      };
    }
  }
};

export const publishPostTool = {
  name: 'xiaohongshu_publish_post',
  description: 'Publish post to Xiaohongshu. User must be logged in first.',
  schema: {
    userId: z.string().describe('User ID (must be logged in)'),
    title: z.string().min(1).max(20).describe('Post title (1-20 characters)'),
    content: z.string().min(1).max(1000).describe('Post content (1-1000 characters)'),
    images: z.array(z.string()).max(9).optional().describe('Array of image file paths (max 9 images)'),
    tags: z.array(z.string()).optional().describe('Array of tags')
  },
  handler: async (args: {
    userId: string;
    title: string;
    content: string;
    images?: string[];
    tags?: string[];
  }) => {
    try {
      // 提交发布任务
      const response = await apiClient.post('/api/publish', {
        userId: args.userId,
        mode: 'publish',
        title: args.title,
        content: args.content,
        images: args.images || [],
        tags: args.tags || []
      });

      const { taskId } = response.data;
      console.error(`Publish task submitted: ${taskId}`);

      // 轮询任务状态
      const result = await pollTaskStatus(taskId, 180000);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            taskId,
            message: 'Post published successfully!',
            details: result
          }, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text' as const,
          text: `Failed to publish post: ${error.message}`
        }],
        isError: true
      };
    }
  }
};
```

### 8. 状态工具 (src/tools/status.ts)

```typescript
import { z } from 'zod';
import { apiClient } from '../client.js';

export const taskStatusTool = {
  name: 'xiaohongshu_task_status',
  description: 'Check the status of a Xiaohongshu task (preview or publish)',
  schema: {
    taskId: z.string().describe('Task ID returned from preview or publish operations')
  },
  handler: async ({ taskId }: { taskId: string }) => {
    try {
      const response = await apiClient.get(`/api/task/${taskId}`);
      const status = response.data;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            taskId,
            status: status.status,
            progress: status.progress || 0,
            position: status.position || 0,
            result: status.result,
            error: status.error
          }, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text' as const,
          text: `Failed to get task status: ${error.message}`
        }],
        isError: true
      };
    }
  }
};

export const healthCheckTool = {
  name: 'xiaohongshu_health',
  description: 'Check if the Xiaohongshu Playwright service is running and healthy',
  schema: {},
  handler: async () => {
    try {
      const response = await apiClient.get('/health');

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            service: 'Xiaohongshu Playwright Service',
            ...response.data
          }, null, 2)
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: 'text' as const,
          text: `Service health check failed: ${error.message}\nMake sure the Playwright service is running on ${process.env.PLAYWRIGHT_SERVICE_URL}`
        }],
        isError: true
      };
    }
  }
};
```

### 9. 主入口 (src/index.ts)

```typescript
#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';

// 导入所有工具
import { getLoginQrTool, checkLoginTool, logoutTool } from './tools/login.js';
import { previewPostTool, publishPostTool } from './tools/publish.js';
import { taskStatusTool, healthCheckTool } from './tools/status.js';

// 加载环境变量
dotenv.config();

// 创建 MCP 服务器
const server = new McpServer({
  name: 'xiaohongshu-mcp',
  version: '1.0.0'
});

// 注册所有工具
const tools = [
  // 登录相关
  getLoginQrTool,
  checkLoginTool,
  logoutTool,

  // 发布相关
  previewPostTool,
  publishPostTool,

  // 状态检查
  taskStatusTool,
  healthCheckTool
];

for (const tool of tools) {
  server.tool(
    tool.name,
    tool.description,
    tool.schema,
    tool.handler
  );
}

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Xiaohongshu MCP Server started');
  console.error('Playwright Service:', process.env.PLAYWRIGHT_SERVICE_URL);
  console.error('Available tools:', tools.map(t => t.name).join(', '));
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
```

---

## 配置和运行

### 1. 构建 MCP 服务器

```bash
cd mcp-server
npm run build
```

### 2. 配置 Claude Agent SDK

在项目根目录创建 `.mcp.json`:

```json
{
  "mcpServers": {
    "xiaohongshu": {
      "command": "node",
      "args": ["./mcp-server/dist/index.js"],
      "env": {
        "PLAYWRIGHT_SERVICE_URL": "http://localhost:3001"
      }
    }
  }
}
```

### 3. 启动服务

```bash
# 终端 1: 启动 Playwright 服务
cd playwright-service
npm run dev

# 终端 2: 测试 MCP 服务器
cd playwright-service/mcp-server
npm start
```

---

## 使用示例

### 方式 1: 使用 Claude Code CLI

```bash
# 安装 Claude Code CLI (如果还没安装)
npm install -g @anthropic-ai/claude-code

# 设置 API Key
export ANTHROPIC_API_KEY=sk-ant-api03-xxx

# 启动 Claude Code
claude
```

在 Claude Code 中输入:

```
帮我登录小红书,userId 用 "demo-user"
```

Claude 会自动调用 `xiaohongshu_get_login_qr` 工具获取二维码。

扫码后,继续:

```
检查一下登录状态
```

登录成功后:

```
帮我发布一篇小红书文章:
- 标题: Claude Agent SDK 初体验
- 内容: 今天尝试了 Claude 的新 Agent SDK,超级强大!可以用自然语言控制各种自动化工具...
- 标签: AI, 自动化, Claude

先预览看看效果
```

### 方式 2: 使用 TypeScript SDK

```typescript
// example.ts
import { query } from '@anthropic-ai/claude-agent-sdk';

const options = {
  mcpServers: {
    'xiaohongshu': {
      command: 'node',
      args: ['./mcp-server/dist/index.js'],
      env: {
        PLAYWRIGHT_SERVICE_URL: 'http://localhost:3001'
      }
    }
  },
  allowedTools: [
    'mcp__xiaohongshu__xiaohongshu_get_login_qr',
    'mcp__xiaohongshu__xiaohongshu_check_login',
    'mcp__xiaohongshu__xiaohongshu_preview_post',
    'mcp__xiaohongshu__xiaohongshu_publish_post'
  ]
};

async function main() {
  const prompt = `
    请帮我完成以下任务:

    1. 首先检查服务健康状态
    2. 使用 userId "demo-user" 登录小红书
    3. 等待用户扫码登录成功
    4. 预览一篇文章:
       - 标题: AI 自动化新玩法
       - 内容: 分享一个超酷的工具...
       - 标签: AI, 工具

    5. 如果预览没问题,就发布
  `;

  for await (const message of query({ prompt, options })) {
    if (message.type === 'text') {
      console.log('Claude:', message.text);
    } else if (message.type === 'tool_use') {
      console.log('Using tool:', message.tool);
    }
  }
}

main();
```

### 方式 3: 使用 Python SDK

```python
# example.py
import anyio
from claude_agent_sdk import query, ClaudeAgentOptions

options = ClaudeAgentOptions(
    mcp_servers={
        'xiaohongshu': {
            'command': 'node',
            'args': ['./mcp-server/dist/index.js'],
            'env': {
                'PLAYWRIGHT_SERVICE_URL': 'http://localhost:3001'
            }
        }
    },
    allowed_tools=[
        'mcp__xiaohongshu__xiaohongshu_get_login_qr',
        'mcp__xiaohongshu__xiaohongshu_check_login',
        'mcp__xiaohongshu__xiaohongshu_preview_post',
        'mcp__xiaohongshu__xiaohongshu_publish_post'
    ]
)

async def main():
    prompt = """
    帮我发布一篇小红书:
    - userId: demo-user
    - 标题: Python 自动化实践
    - 内容: 使用 Claude Agent SDK...
    - 标签: Python, AI

    先预览,确认后发布
    """

    async for message in query(prompt=prompt, options=options):
        print(message)

anyio.run(main())
```

---

## 故障排查

### 问题 1: MCP 服务器启动失败

**症状:**
```
Error: Cannot find module '@modelcontextprotocol/sdk'
```

**解决方案:**
```bash
cd mcp-server
npm install
npm run build
```

### 问题 2: 连接 Playwright 服务失败

**症状:**
```
Failed to get task status: connect ECONNREFUSED 127.0.0.1:3001
```

**解决方案:**
1. 确保 Playwright 服务正在运行:
```bash
cd playwright-service
npm run dev
```

2. 检查端口是否正确:
```bash
curl http://localhost:3001/health
```

### 问题 3: 工具未被识别

**症状:**
Claude 提示找不到工具或不调用工具

**解决方案:**

1. 检查 `.mcp.json` 配置是否正确
2. 确保工具在 `allowedTools` 中:
```typescript
allowedTools: [
  'mcp__xiaohongshu__xiaohongshu_preview_post'
]
```

3. 重启 MCP 服务器:
```bash
npm run build
npm start
```

### 问题 4: 任务超时

**症状:**
```
Error: Task timeout after 180000ms
```

**解决方案:**

1. 增加超时时间 (src/client.ts):
```typescript
export async function pollTaskStatus(taskId: string, timeout: number = 300000) {
  // 从 180000 (3分钟) 增加到 300000 (5分钟)
}
```

2. 检查 Playwright 服务日志,查看任务是否卡住

### 问题 5: API Key 错误

**症状:**
```
Error: Invalid API key
```

**解决方案:**

1. 确保设置了正确的环境变量:
```bash
export ANTHROPIC_API_KEY=sk-ant-api03-xxx
```

2. 检查 API Key 是否有效:
```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json"
```

---

## 下一步

### 1. 扩展功能

添加更多小红书功能:
- 草稿管理
- 定时发布
- 数据分析
- 评论管理

### 2. 优化性能

- 实现连接池
- 添加缓存
- 优化轮询策略

### 3. 增强错误处理

- 详细的错误分类
- 自动重试机制
- 更好的日志记录

### 4. 生产部署

- Docker 化
- 监控和告警
- 负载均衡

---

## 相关文档

- [完整技术文档](./CLAUDE_AGENT_SDK_RESEARCH.md)
- [Playwright 服务 API](../src/server.js)
- [MCP 协议规范](https://modelcontextprotocol.io)

---

**最后更新**: 2025-10-04
