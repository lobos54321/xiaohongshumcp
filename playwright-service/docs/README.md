# Claude Agent SDK 研究文档

## 文档概览

本目录包含了 Claude Agent SDK 的完整研究文档、集成方案和实战示例。

### 文档清单

1. **[CLAUDE_AGENT_SDK_RESEARCH.md](./CLAUDE_AGENT_SDK_RESEARCH.md)** - 完整技术文档
   - Claude Agent SDK 核心概念
   - TypeScript/Python SDK 完整 API 参考
   - MCP (Model Context Protocol) 集成详解
   - 自定义工具开发指南
   - 小红书服务 MCP 集成方案
   - 架构设计和最佳实践

2. **[QUICK_START_GUIDE.md](./QUICK_START_GUIDE.md)** - 快速入门指南
   - 环境准备和依赖安装
   - 创建 MCP 服务器的详细步骤
   - 配置和运行说明
   - 使用示例 (CLI/TypeScript/Python)
   - 故障排查指南

3. **[INTEGRATION_EXAMPLES.md](./INTEGRATION_EXAMPLES.md)** - 集成示例代码
   - 基础使用示例
   - 高级工作流编排
   - 错误处理和重试机制
   - 生产级最佳实践
   - Python 和 TypeScript 示例

## 快速开始

### 1. 阅读顺序

如果你是第一次接触 Claude Agent SDK,建议按以下顺序阅读:

```
1. QUICK_START_GUIDE.md (了解基础概念和环境准备)
   ↓
2. CLAUDE_AGENT_SDK_RESEARCH.md (深入理解技术细节)
   ↓
3. INTEGRATION_EXAMPLES.md (学习实际应用)
```

### 2. 实施步骤

#### 第一步: 环境准备

```bash
# 1. 确保有 Anthropic API Key
export ANTHROPIC_API_KEY=sk-ant-api03-xxx

# 2. 确保 Playwright 服务正在运行
cd /path/to/playwright-service
npm run dev
```

#### 第二步: 创建 MCP 服务器

```bash
# 1. 创建 MCP 服务器目录
mkdir mcp-server && cd mcp-server

# 2. 安装依赖
npm init -y
npm install @modelcontextprotocol/sdk zod axios dotenv
npm install -D typescript @types/node

# 3. 复制示例代码 (见 QUICK_START_GUIDE.md)
# 4. 构建
npm run build
```

#### 第三步: 测试运行

```bash
# 方式 1: 直接运行 MCP 服务器
npm start

# 方式 2: 使用 Claude Code CLI
npm install -g @anthropic-ai/claude-code
claude

# 方式 3: 使用 SDK (见 INTEGRATION_EXAMPLES.md)
```

## 核心概念速查

### Claude Agent SDK

- **用途**: 构建基于 Claude 的自主 AI 代理
- **核心能力**: 文件操作、代码执行、Web 搜索、自定义工具
- **语言支持**: TypeScript (Node.js 18+) 和 Python (3.10+)

### MCP (Model Context Protocol)

- **定义**: 连接外部工具和 AI 的标准协议
- **组件**: Tools (工具)、Resources (资源)、Prompts (提示)
- **传输方式**: stdio、HTTP/SSE、Streamable HTTP

### 集成架构

```
Claude Agent SDK
      ↓
MCP Protocol (stdio)
      ↓
Xiaohongshu MCP Server
      ↓
HTTP API
      ↓
Playwright Service (Express + BullMQ)
```

## 提供的工具

### 小红书 MCP 服务器工具清单

1. **xiaohongshu_get_login_qr** - 获取登录二维码
2. **xiaohongshu_check_login** - 检查登录状态
3. **xiaohongshu_logout** - 退出登录
4. **xiaohongshu_preview_post** - 预览文章
5. **xiaohongshu_publish_post** - 发布文章
6. **xiaohongshu_task_status** - 查询任务状态
7. **xiaohongshu_health** - 服务健康检查

## 使用示例

### 示例 1: 使用 Claude Code CLI

```bash
# 启动 Claude Code
claude

# 在对话中输入
"帮我登录小红书,userId 用 'demo-user'"

"预览一篇小红书文章:
- 标题: AI 工具分享
- 内容: Claude Agent SDK 使用体验...
- 标签: AI, 工具"

"发布上面预览的文章"
```

### 示例 2: 使用 TypeScript SDK

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

for await (const msg of query({
  prompt: "发布一篇小红书文章,标题'测试',内容'测试内容'",
  options: {
    mcpServers: {
      'xiaohongshu': {
        command: 'node',
        args: ['./mcp-server/dist/index.js']
      }
    },
    allowedTools: ['mcp__xiaohongshu__xiaohongshu_publish_post']
  }
})) {
  console.log(msg);
}
```

### 示例 3: 使用 Python SDK

```python
import anyio
from claude_agent_sdk import query, ClaudeAgentOptions

async def main():
    options = ClaudeAgentOptions(
        mcp_servers={
            'xiaohongshu': {
                'command': 'node',
                'args': ['./mcp-server/dist/index.js']
            }
        }
    )

    async for msg in query(prompt="发布文章...", options=options):
        print(msg)

anyio.run(main())
```

## 项目结构

```
playwright-service/
├── src/                          # 现有 Playwright 服务
│   ├── server.js                 # Express 服务器
│   ├── xiaohongshu.js            # 小红书自动化逻辑
│   ├── queue.js                  # BullMQ 队列
│   ├── browserPool.js            # 浏览器池
│   └── cookieManager.js          # Cookie 管理
├── mcp-server/                   # 新增 MCP 服务器
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env
│   ├── src/
│   │   ├── index.ts              # MCP 服务器入口
│   │   ├── client.ts             # HTTP 客户端
│   │   ├── tools/
│   │   │   ├── login.ts          # 登录相关工具
│   │   │   ├── publish.ts        # 发布相关工具
│   │   │   └── status.ts         # 状态相关工具
│   │   └── utils/
│   └── dist/                     # 编译输出
├── docs/                         # 文档目录 (当前目录)
│   ├── README.md                 # 本文件
│   ├── CLAUDE_AGENT_SDK_RESEARCH.md
│   ├── QUICK_START_GUIDE.md
│   └── INTEGRATION_EXAMPLES.md
├── .mcp.json                     # MCP 配置文件
├── package.json
└── .env
```

## 常见问题

### Q1: MCP 服务器和普通 HTTP API 有什么区别?

**A:** MCP 服务器是专门为 AI 代理设计的协议,提供了:
- 标准化的工具定义
- 自动类型验证
- 内置错误处理
- 支持多种传输方式
- AI 友好的接口设计

### Q2: 为什么需要两层服务 (MCP Server + Playwright Service)?

**A:** 分层架构带来的好处:
- **解耦**: MCP 服务器专注于 AI 交互,Playwright 服务专注于自动化
- **复用**: 现有 Playwright 服务不需要修改
- **扩展**: 可以轻松添加其他 MCP 工具
- **维护**: 各层独立维护,互不影响

### Q3: 可以直接在 Playwright 服务中集成 MCP 吗?

**A:** 可以,有两种方式:
1. **独立 MCP 服务器** (推荐) - 本文档采用的方式
2. **内嵌 MCP 端点** - 在 Express 中添加 MCP HTTP 端点

见 CLAUDE_AGENT_SDK_RESEARCH.md 中的详细说明。

### Q4: 如何处理并发请求?

**A:**
- Playwright 服务已经使用 BullMQ 处理并发
- MCP 服务器是无状态的,可以启动多个实例
- 建议配置:
  ```json
  {
    "BROWSER_POOL_SIZE": 10,
    "MAX_WORKERS": 10
  }
  ```

### Q5: 如何在生产环境部署?

**A:** 建议:
1. 使用 Docker 容器化
2. 配置环境变量管理
3. 添加监控和日志
4. 设置负载均衡
5. 实现健康检查

详见 QUICK_START_GUIDE.md "下一步" 部分。

## 故障排查

### 问题: MCP 服务器无法启动

```bash
# 检查依赖
cd mcp-server
npm install
npm run build

# 检查 Playwright 服务
curl http://localhost:3001/health
```

### 问题: 工具未被识别

```typescript
// 确保工具在 allowedTools 中
allowedTools: [
  'mcp__xiaohongshu__xiaohongshu_publish_post'
]
```

### 问题: 任务超时

```typescript
// 增加超时时间
export async function pollTaskStatus(
  taskId: string,
  timeout: number = 300000 // 5分钟
) { ... }
```

更多故障排查见 QUICK_START_GUIDE.md。

## 性能优化建议

1. **连接池管理**
   - 合理配置浏览器池大小
   - 实现连接复用

2. **缓存策略**
   - 缓存用户登录状态
   - 缓存常用资源

3. **并发控制**
   - 使用队列限流
   - 实现优先级调度

4. **错误恢复**
   - 自动重试机制
   - 降级策略

## 扩展方向

### 1. 添加更多工具

```typescript
// 草稿管理
server.tool('xiaohongshu_save_draft', ...)
server.tool('xiaohongshu_list_drafts', ...)

// 数据分析
server.tool('xiaohongshu_get_analytics', ...)

// 评论管理
server.tool('xiaohongshu_reply_comment', ...)
```

### 2. 支持其他平台

- 微博 MCP Server
- 抖音 MCP Server
- B站 MCP Server

### 3. 增强功能

- 定时发布
- 批量操作
- 智能推荐
- A/B 测试

## 相关资源

### 官方文档

- Claude Agent SDK: https://docs.claude.com/en/api/agent-sdk/overview
- MCP 协议: https://modelcontextprotocol.io
- Anthropic API: https://docs.anthropic.com

### GitHub 仓库

- Claude Agent SDK (TypeScript): https://github.com/anthropics/claude-agent-sdk-typescript
- Claude Agent SDK (Python): https://github.com/anthropics/claude-agent-sdk-python
- MCP TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- MCP 示例服务器: https://github.com/modelcontextprotocol/servers

### 社区

- Discord: https://anthropic.com/discord
- GitHub Discussions: 各仓库的 Discussions 页面

## 贡献和反馈

如果你有任何问题、建议或发现错误:

1. 查看现有文档是否已解答
2. 在项目中创建 Issue
3. 提交 Pull Request

## 许可证

本项目遵循 MIT 许可证。

---

**文档版本**: 1.0.0
**最后更新**: 2025-10-04
**维护者**: Claude Agent SDK 研究团队

---

## 下一步行动

### 立即开始

1. 阅读 [QUICK_START_GUIDE.md](./QUICK_START_GUIDE.md)
2. 按照指南创建 MCP 服务器
3. 运行示例代码
4. 开始构建你的 AI 代理!

### 深入学习

1. 研读 [CLAUDE_AGENT_SDK_RESEARCH.md](./CLAUDE_AGENT_SDK_RESEARCH.md)
2. 学习 [INTEGRATION_EXAMPLES.md](./INTEGRATION_EXAMPLES.md) 中的高级用法
3. 探索 MCP 协议的更多可能性

### 生产部署

1. 实现完整的错误处理
2. 添加监控和日志
3. 优化性能
4. 部署到生产环境

祝你构建出强大的 AI 代理! 🚀
