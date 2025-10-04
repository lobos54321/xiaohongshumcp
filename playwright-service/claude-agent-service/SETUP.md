# Claude Agent Service 设置指南

## 快速开始

### 1. 配置环境变量

编辑 `.env` 文件：

```bash
# Claude API Key（必需）
ANTHROPIC_API_KEY=sk-ant-your-api-key-here

# MCP Router 配置（必需）
MCP_ROUTER_COMMAND=node
MCP_ROUTER_ARGS=/Users/boliu/xiaohongshumcp/playwright-service/mcp-router/dist/index.js

# HTTP Server 端口
PORT=4000

# Claude 模型配置
CLAUDE_MODEL=claude-3-5-sonnet-20241022
MAX_TOKENS=4096
```

### 2. 获取 Anthropic API Key

1. 访问 https://console.anthropic.com/
2. 登录或注册账号
3. 进入 API Keys 页面
4. 创建新的 API Key
5. 复制 Key 到 `.env` 文件的 `ANTHROPIC_API_KEY`

### 3. 编译

```bash
npm run build
```

### 4. 启动 MCP Router

在另一个终端：

```bash
cd ../mcp-router
npm run start
```

### 5. 启动 Claude Agent Service

```bash
npm start
```

## API 使用示例

### 健康检查

```bash
curl http://localhost:4000/health
```

### 智能对话

```bash
curl -X POST http://localhost:4000/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "prompt": "帮我检查小红书登录状态"
  }'
```

### 创作并发布内容

```bash
curl -X POST http://localhost:4000/agent/xiaohongshu/create-post \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "topic": "秋季旅游攻略",
    "style": "轻松愉快",
    "length": 500
  }'
```

### 内容研究

```bash
curl -X POST http://localhost:4000/agent/xiaohongshu/research \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "keyword": "咖啡店推荐",
    "task": "分析热门咖啡店探店内容的特点"
  }'
```

### 批量发布

```bash
curl -X POST http://localhost:4000/agent/xiaohongshu/batch-publish \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "topics": ["早餐推荐", "午餐打卡", "晚餐美食"],
    "schedule": "每天发布一篇"
  }'
```

## 架构说明

```
用户请求（自然语言）
    ↓
Go后端
    ↓ HTTP (localhost:4000)
Claude Agent Service
    ├─ Anthropic SDK
    └─ MCP Client
        ↓ stdio
    MCP Router
        ↓ 进程管理
    xiaohongshu-mcp 工具
        ↓
    小红书网站
```

## Claude Agent 的智能能力

### 1. 自然语言理解

用户可以用自然语言描述需求，Claude会理解并执行：

**示例**：
- "帮我写一篇关于咖啡的文章并发布"
- "搜索最近热门的旅游内容，总结一下趋势"
- "批量发布3篇美食相关的帖子"

### 2. 智能决策

Claude会根据任务自动选择合适的工具：

**示例**：
- 用户："发布一篇文章" → Claude自动调用 `xiaohongshu_publish_content`
- 用户："先检查登录" → Claude自动调用 `xiaohongshu_check_login`
- 用户："搜索内容" → Claude自动调用 `xiaohongshu_search_feeds`

### 3. 内容生成

Claude可以自动生成小红书风格的内容：

**示例**：
- 标题优化（吸引眼球）
- 正文创作（符合小红书风格）
- 标签推荐（提高曝光）
- 排版优化（emoji、换行等）

### 4. 多步骤任务

Claude可以执行复杂的多步骤任务：

**示例**：
```
用户："研究咖啡店内容并创作一篇"
Claude执行：
1. 调用 search_feeds 搜索咖啡店内容
2. 分析热门内容特点
3. 基于分析生成新内容
4. 调用 publish_content 发布
```

### 5. 错误处理和重试

Claude会智能处理错误：

**示例**：
- 未登录 → 提示用户扫码登录
- 内容不符合规范 → 自动调整并重试
- 网络错误 → 智能重试

## 与直接调用工具的对比

### 直接调用工具（旧方案）

```javascript
// 需要手动编写代码
const title = "咖啡店推荐";
const content = "今天去了一家很棒的咖啡店...";
const images = ["/path/to/image.jpg"];
const tags = ["咖啡", "探店"];

await publishContent({ title, content, images, tags });
```

### Claude Agent（新方案）

```javascript
// 自然语言描述即可
const prompt = "帮我写一篇关于咖啡店的探店文章并发布";

await claudeAgent.chat({ userId, prompt });
// Claude会自动：
// 1. 生成标题和内容
// 2. 推荐标签
// 3. 调用发布工具
```

## 成本估算

### Claude API 费用

- **Claude 3.5 Sonnet**:
  - Input: $3 / 1M tokens
  - Output: $15 / 1M tokens

### 示例计算

一次"创作并发布"请求：
- Input: ~2000 tokens (系统提示 + 用户请求 + 工具定义)
- Output: ~1000 tokens (生成的内容 + 工具调用)
- **成本**: $0.006 + $0.015 = **$0.021** (约¥0.15)

### 每月成本估算

假设每天发布10篇内容：
- 每天成本: $0.021 × 10 = $0.21
- 每月成本: $0.21 × 30 = **$6.3** (约¥45)

**非常经济！**

## 下一步

1. ✅ 配置 `.env` 文件（添加你的 API Key）
2. ✅ 启动 MCP Router
3. ✅ 启动 Claude Agent Service
4. ⏳ 测试基本功能
5. ⏳ 集成到 Go 后端
6. ⏳ 前端界面集成

## 故障排查

### MCP Client 连接失败

检查：
- MCP Router 是否正在运行
- `MCP_ROUTER_ARGS` 路径是否正确

### API Key 错误

检查：
- `.env` 文件中的 `ANTHROPIC_API_KEY` 是否正确
- API Key 是否有效（未过期、有余额）

### 工具调用失败

检查：
- xiaohongshu-mcp 进程是否正常启动
- Cookie 文件是否存在
- 用户是否已登录小红书
