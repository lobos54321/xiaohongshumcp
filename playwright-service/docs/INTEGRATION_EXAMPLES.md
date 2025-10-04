# Claude Agent SDK 集成示例

## 目录
1. [基础示例](#基础示例)
2. [高级工作流](#高级工作流)
3. [错误处理](#错误处理)
4. [最佳实践示例](#最佳实践示例)

---

## 基础示例

### 示例 1: 简单的健康检查

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

const options = {
  mcpServers: {
    'xiaohongshu': {
      command: 'node',
      args: ['./mcp-server/dist/index.js']
    }
  },
  allowedTools: ['mcp__xiaohongshu__xiaohongshu_health']
};

for await (const msg of query({
  prompt: "检查小红书服务是否正常运行",
  options
})) {
  console.log(msg);
}
```

### 示例 2: 获取登录二维码

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';
import fs from 'fs';

const options = {
  mcpServers: {
    'xiaohongshu': {
      command: 'node',
      args: ['./mcp-server/dist/index.js']
    }
  },
  allowedTools: [
    'mcp__xiaohongshu__xiaohongshu_get_login_qr',
    'mcp__xiaohongshu__xiaohongshu_check_login'
  ]
};

let qrcodeBase64 = '';

for await (const msg of query({
  prompt: "帮我为用户 'user123' 生成登录二维码",
  options
})) {
  if (msg.type === 'text') {
    const result = JSON.parse(msg.text);
    if (result.qrcode) {
      qrcodeBase64 = result.qrcode;
      // 保存二维码到文件
      const buffer = Buffer.from(qrcodeBase64, 'base64');
      fs.writeFileSync('qrcode.png', buffer);
      console.log('二维码已保存到 qrcode.png');
    }
  }
}
```

### 示例 3: 预览文章

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

async function previewPost() {
  const options = {
    mcpServers: {
      'xiaohongshu': {
        command: 'node',
        args: ['./mcp-server/dist/index.js']
      }
    },
    allowedTools: ['mcp__xiaohongshu__xiaohongshu_preview_post']
  };

  for await (const msg of query({
    prompt: `
      预览一篇小红书文章:
      - userId: user123
      - 标题: AI 工具推荐
      - 内容: Claude Agent SDK 是一个强大的 AI 代理框架...
      - 标签: AI, 工具, 自动化
    `,
    options
  })) {
    if (msg.type === 'text') {
      console.log('预览结果:', msg.text);
    }
  }
}

previewPost();
```

---

## 高级工作流

### 示例 4: 完整的发布流程

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

async function completePublishWorkflow() {
  const options = {
    mcpServers: {
      'xiaohongshu': {
        command: 'node',
        args: ['./mcp-server/dist/index.js']
      }
    },
    allowedTools: [
      'mcp__xiaohongshu__xiaohongshu_get_login_qr',
      'mcp__xiaohongshu__xiaohongshu_check_login',
      'mcp__xiaohongshu__xiaohongshu_preview_post',
      'mcp__xiaohongshu__xiaohongshu_publish_post'
    ],
    systemPrompt: `
      你是一个小红书发布助手。请按照以下步骤操作:
      1. 首先获取登录二维码
      2. 等待用户扫码登录
      3. 预览文章内容
      4. 确认后发布文章

      请在每个步骤后提供清晰的反馈。
    `
  };

  const userId = 'user123';
  const post = {
    title: 'Claude Agent SDK 实战教程',
    content: `
# Claude Agent SDK 使用指南

今天给大家分享一个超酷的 AI 工具 - Claude Agent SDK!

## 核心特性
- 自然语言控制
- 强大的工具生态
- 简单易用

## 使用体验
使用 Claude Agent SDK 可以轻松实现各种自动化任务,
比如这篇文章就是通过 SDK 自动发布的!

#AI工具 #自动化 #程序员必备
    `,
    tags: ['AI工具', '自动化', '程序员必备']
  };

  for await (const msg of query({
    prompt: `
      请帮我完成小红书文章发布:

      userId: ${userId}
      标题: ${post.title}
      内容: ${post.content}
      标签: ${post.tags.join(', ')}

      步骤:
      1. 先获取登录二维码
      2. 我会扫码登录
      3. 预览文章
      4. 确认后发布
    `,
    options
  })) {
    if (msg.type === 'text') {
      console.log('\n[Claude]:', msg.text);
    } else if (msg.type === 'tool_use') {
      console.log('\n[Tool]:', msg.tool);
    }
  }
}

completePublishWorkflow();
```

### 示例 5: 批量发布

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

interface Post {
  title: string;
  content: string;
  images?: string[];
  tags?: string[];
}

async function batchPublish(userId: string, posts: Post[]) {
  const options = {
    mcpServers: {
      'xiaohongshu': {
        command: 'node',
        args: ['./mcp-server/dist/index.js']
      }
    },
    allowedTools: [
      'mcp__xiaohongshu__xiaohongshu_check_login',
      'mcp__xiaohongshu__xiaohongshu_preview_post',
      'mcp__xiaohongshu__xiaohongshu_publish_post'
    ]
  };

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];

    console.log(`\n发布第 ${i + 1}/${posts.length} 篇文章...`);

    for await (const msg of query({
      prompt: `
        发布文章:
        - userId: ${userId}
        - 标题: ${post.title}
        - 内容: ${post.content}
        - 图片: ${post.images?.join(', ') || '无'}
        - 标签: ${post.tags?.join(', ') || '无'}

        请先预览,然后发布。
      `,
      options
    })) {
      if (msg.type === 'text') {
        console.log(msg.text);
      }
    }

    // 延迟防止频率限制
    if (i < posts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// 使用示例
const posts: Post[] = [
  {
    title: 'AI 工具推荐 #1',
    content: '今天分享第一个 AI 工具...',
    tags: ['AI', '工具']
  },
  {
    title: 'AI 工具推荐 #2',
    content: '第二个工具更强大...',
    tags: ['AI', '工具']
  }
];

batchPublish('user123', posts);
```

### 示例 6: 带图片的发布

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';
import path from 'path';

async function publishWithImages() {
  const options = {
    mcpServers: {
      'xiaohongshu': {
        command: 'node',
        args: ['./mcp-server/dist/index.js']
      }
    },
    allowedTools: [
      'mcp__xiaohongshu__xiaohongshu_preview_post',
      'mcp__xiaohongshu__xiaohongshu_publish_post'
    ]
  };

  // 准备图片路径
  const imagePaths = [
    path.resolve('./images/screenshot1.png'),
    path.resolve('./images/screenshot2.png'),
    path.resolve('./images/screenshot3.png')
  ];

  for await (const msg of query({
    prompt: `
      发布带图片的小红书文章:

      userId: user123
      标题: Claude Agent SDK 截图分享
      内容: 这是使用 SDK 的实际效果图,大家可以参考...
      图片: ${imagePaths.join(', ')}
      标签: 教程, 截图, AI

      先预览确认图片都上传成功,然后发布。
    `,
    options
  })) {
    console.log(msg);
  }
}

publishWithImages();
```

---

## 错误处理

### 示例 7: 优雅的错误处理

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

async function publishWithErrorHandling(userId: string, post: any) {
  const options = {
    mcpServers: {
      'xiaohongshu': {
        command: 'node',
        args: ['./mcp-server/dist/index.js']
      }
    },
    allowedTools: [
      'mcp__xiaohongshu__xiaohongshu_check_login',
      'mcp__xiaohongshu__xiaohongshu_preview_post',
      'mcp__xiaohongshu__xiaohongshu_publish_post'
    ],
    hooks: {
      onToolUse: async (tool, args) => {
        console.log(`[Hook] 调用工具: ${tool}`);
        return { allow: true };
      }
    }
  };

  try {
    for await (const msg of query({
      prompt: `
        发布文章 (userId: ${userId}):
        ${JSON.stringify(post, null, 2)}

        如果遇到错误,请明确说明原因。
      `,
      options
    })) {
      if (msg.type === 'text') {
        console.log('[响应]:', msg.text);

        // 检查是否包含错误
        if (msg.text.toLowerCase().includes('error') ||
            msg.text.toLowerCase().includes('failed')) {
          console.error('[错误] 发布失败:', msg.text);
          throw new Error('发布失败');
        }
      }
    }

    console.log('[成功] 文章发布完成');

  } catch (error) {
    console.error('[异常]:', error);

    // 重试逻辑
    console.log('[重试] 尝试重新发布...');
    // ... 重试代码
  }
}
```

### 示例 8: 超时处理

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

async function publishWithTimeout(
  userId: string,
  post: any,
  timeoutMs: number = 300000 // 5分钟
) {
  const options = {
    mcpServers: {
      'xiaohongshu': {
        command: 'node',
        args: ['./mcp-server/dist/index.js']
      }
    },
    allowedTools: [
      'mcp__xiaohongshu__xiaohongshu_publish_post'
    ]
  };

  return Promise.race([
    // 发布任务
    (async () => {
      for await (const msg of query({
        prompt: `发布文章: ${JSON.stringify(post)}`,
        options
      })) {
        console.log(msg);
      }
    })(),

    // 超时
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`发布超时 (${timeoutMs}ms)`));
      }, timeoutMs);
    })
  ]);
}

// 使用
publishWithTimeout('user123', {
  title: '测试文章',
  content: '内容...'
}, 180000).catch(error => {
  console.error('发布失败:', error.message);
});
```

---

## 最佳实践示例

### 示例 9: 发布前检查清单

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

interface PublishChecklist {
  isLoggedIn: boolean;
  hasTitleAndContent: boolean;
  hasValidImages: boolean;
  hasAppropriateLength: boolean;
}

async function validateAndPublish(userId: string, post: any) {
  const options = {
    mcpServers: {
      'xiaohongshu': {
        command: 'node',
        args: ['./mcp-server/dist/index.js']
      }
    },
    allowedTools: [
      'mcp__xiaohongshu__xiaohongshu_check_login',
      'mcp__xiaohongshu__xiaohongshu_preview_post',
      'mcp__xiaohongshu__xiaohongshu_publish_post'
    ]
  };

  // 1. 验证内容
  const checklist: PublishChecklist = {
    isLoggedIn: false,
    hasTitleAndContent: !!(post.title && post.content),
    hasValidImages: !post.images || post.images.length <= 9,
    hasAppropriateLength: post.title.length <= 20 && post.content.length <= 1000
  };

  console.log('发布前检查清单:', checklist);

  if (!checklist.hasTitleAndContent) {
    throw new Error('标题或内容缺失');
  }

  if (!checklist.hasValidImages) {
    throw new Error('图片数量超过限制 (最多9张)');
  }

  if (!checklist.hasAppropriateLength) {
    throw new Error('标题或内容长度超过限制');
  }

  // 2. 检查登录状态
  for await (const msg of query({
    prompt: `检查用户 ${userId} 的登录状态`,
    options: {
      ...options,
      allowedTools: ['mcp__xiaohongshu__xiaohongshu_check_login']
    }
  })) {
    if (msg.type === 'text') {
      const result = JSON.parse(msg.text);
      checklist.isLoggedIn = result.isLoggedIn;
    }
  }

  if (!checklist.isLoggedIn) {
    throw new Error('用户未登录');
  }

  // 3. 预览
  console.log('[步骤 1/2] 预览文章...');
  let previewSuccess = false;

  for await (const msg of query({
    prompt: `预览文章: ${JSON.stringify(post)}`,
    options: {
      ...options,
      allowedTools: ['mcp__xiaohongshu__xiaohongshu_preview_post']
    }
  })) {
    if (msg.type === 'text') {
      const result = JSON.parse(msg.text);
      previewSuccess = result.success;
    }
  }

  if (!previewSuccess) {
    throw new Error('预览失败');
  }

  // 4. 发布
  console.log('[步骤 2/2] 发布文章...');

  for await (const msg of query({
    prompt: `发布文章: ${JSON.stringify(post)}`,
    options: {
      ...options,
      allowedTools: ['mcp__xiaohongshu__xiaohongshu_publish_post']
    }
  })) {
    if (msg.type === 'text') {
      console.log('发布结果:', msg.text);
    }
  }

  console.log('[完成] 文章发布成功!');
}

// 使用
validateAndPublish('user123', {
  title: '标题',
  content: '内容...',
  tags: ['AI', '工具']
});
```

### 示例 10: 带进度追踪的发布

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

class PublishProgressTracker {
  private stages = [
    '检查登录状态',
    '上传图片',
    '填充内容',
    '预览文章',
    '发布文章'
  ];

  private currentStage = 0;

  updateProgress(stage: number, message: string) {
    this.currentStage = stage;
    const percent = Math.round((stage / this.stages.length) * 100);
    console.log(`\n[${percent}%] ${this.stages[stage - 1]}: ${message}`);
  }

  complete() {
    console.log('\n[100%] 发布完成!');
  }
}

async function publishWithProgress(userId: string, post: any) {
  const tracker = new PublishProgressTracker();

  const options = {
    mcpServers: {
      'xiaohongshu': {
        command: 'node',
        args: ['./mcp-server/dist/index.js']
      }
    },
    allowedTools: [
      'mcp__xiaohongshu__xiaohongshu_check_login',
      'mcp__xiaohongshu__xiaohongshu_preview_post',
      'mcp__xiaohongshu__xiaohongshu_publish_post'
    ],
    hooks: {
      onToolUse: async (tool, args) => {
        if (tool.includes('check_login')) {
          tracker.updateProgress(1, '验证用户登录状态');
        } else if (tool.includes('preview')) {
          tracker.updateProgress(4, '生成预览');
        } else if (tool.includes('publish')) {
          tracker.updateProgress(5, '提交发布任务');
        }
        return { allow: true };
      }
    }
  };

  for await (const msg of query({
    prompt: `
      发布文章:
      ${JSON.stringify(post, null, 2)}
    `,
    options
  })) {
    if (msg.type === 'text') {
      console.log(msg.text);
    }
  }

  tracker.complete();
}

// 使用
publishWithProgress('user123', {
  title: '测试文章',
  content: '内容...',
  images: ['./image1.png', './image2.png'],
  tags: ['测试']
});
```

### 示例 11: 使用 Client API 进行交互式对话

```typescript
import { ClaudeSDKClient } from '@anthropic-ai/claude-agent-sdk';

async function interactivePublish() {
  const client = new ClaudeSDKClient({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: 'claude-sonnet-4-5-20250929',
    mcpServers: {
      'xiaohongshu': {
        command: 'node',
        args: ['./mcp-server/dist/index.js']
      }
    }
  });

  const session = await client.createSession();

  try {
    // 第一轮: 登录
    let response = await session.sendMessage(
      '请帮我为用户 user123 获取登录二维码'
    );
    console.log('[Claude]:', response.text);

    // 模拟用户扫码
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 第二轮: 检查登录
    response = await session.sendMessage('检查登录状态');
    console.log('[Claude]:', response.text);

    // 第三轮: 发布文章
    response = await session.sendMessage(`
      请发布一篇文章:
      - 标题: Claude SDK 实战
      - 内容: 今天学习了如何使用 Claude SDK...
      - 标签: 学习笔记, AI
    `);
    console.log('[Claude]:', response.text);

  } finally {
    await session.close();
  }
}

interactivePublish();
```

### 示例 12: 完整的生产级实现

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';
import winston from 'winston';
import { z } from 'zod';

// 日志配置
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'publish.log' }),
    new winston.transports.Console()
  ]
});

// 文章数据验证
const PostSchema = z.object({
  title: z.string().min(1).max(20),
  content: z.string().min(1).max(1000),
  images: z.array(z.string()).max(9).optional(),
  tags: z.array(z.string()).optional()
});

type Post = z.infer<typeof PostSchema>;

class XiaohongshuPublisher {
  private options: any;

  constructor(private userId: string) {
    this.options = {
      mcpServers: {
        'xiaohongshu': {
          command: 'node',
          args: ['./mcp-server/dist/index.js']
        }
      },
      allowedTools: [
        'mcp__xiaohongshu__xiaohongshu_check_login',
        'mcp__xiaohongshu__xiaohongshu_preview_post',
        'mcp__xiaohongshu__xiaohongshu_publish_post',
        'mcp__xiaohongshu__xiaohongshu_task_status'
      ],
      hooks: {
        onToolUse: async (tool: string, args: any) => {
          logger.info('Tool called', { tool, args });
          return { allow: true };
        }
      }
    };
  }

  async checkLogin(): Promise<boolean> {
    logger.info('Checking login status', { userId: this.userId });

    for await (const msg of query({
      prompt: `检查用户 ${this.userId} 的登录状态`,
      options: this.options
    })) {
      if (msg.type === 'text') {
        const result = JSON.parse(msg.text);
        return result.isLoggedIn;
      }
    }

    return false;
  }

  async preview(post: Post): Promise<string> {
    // 验证数据
    PostSchema.parse(post);

    logger.info('Previewing post', { userId: this.userId, post });

    for await (const msg of query({
      prompt: `
        预览文章:
        userId: ${this.userId}
        ${JSON.stringify(post, null, 2)}
      `,
      options: this.options
    })) {
      if (msg.type === 'text') {
        const result = JSON.parse(msg.text);
        if (result.screenshot) {
          return result.screenshot;
        }
      }
    }

    throw new Error('Preview failed');
  }

  async publish(post: Post): Promise<void> {
    // 验证数据
    PostSchema.parse(post);

    // 检查登录
    const isLoggedIn = await this.checkLogin();
    if (!isLoggedIn) {
      throw new Error('User not logged in');
    }

    logger.info('Publishing post', { userId: this.userId, post });

    // 预览
    await this.preview(post);
    logger.info('Preview completed');

    // 发布
    for await (const msg of query({
      prompt: `
        发布文章:
        userId: ${this.userId}
        ${JSON.stringify(post, null, 2)}
      `,
      options: this.options
    })) {
      if (msg.type === 'text') {
        logger.info('Publish response', { text: msg.text });

        const result = JSON.parse(msg.text);
        if (!result.success) {
          throw new Error('Publish failed');
        }
      }
    }

    logger.info('Publish completed successfully');
  }
}

// 使用示例
async function main() {
  const publisher = new XiaohongshuPublisher('user123');

  try {
    await publisher.publish({
      title: 'Claude SDK 实战',
      content: '今天分享如何使用 Claude Agent SDK...',
      tags: ['AI', '教程']
    });
  } catch (error) {
    logger.error('Failed to publish', { error });
    throw error;
  }
}

main();
```

---

## Python 示例

### 示例 13: Python 基础使用

```python
import anyio
from claude_agent_sdk import query, ClaudeAgentOptions

async def publish_post():
    options = ClaudeAgentOptions(
        mcp_servers={
            'xiaohongshu': {
                'command': 'node',
                'args': ['./mcp-server/dist/index.js']
            }
        },
        allowed_tools=[
            'mcp__xiaohongshu__xiaohongshu_preview_post',
            'mcp__xiaohongshu__xiaohongshu_publish_post'
        ]
    )

    prompt = """
    发布小红书文章:
    - userId: user123
    - 标题: Python 自动化实践
    - 内容: 使用 Claude SDK 实现自动化发布...
    - 标签: Python, AI, 自动化

    先预览,然后发布
    """

    async for message in query(prompt=prompt, options=options):
        print(message)

anyio.run(publish_post())
```

---

## 总结

这些示例涵盖了:

1. **基础使用** - 简单的工具调用
2. **工作流编排** - 多步骤任务
3. **错误处理** - 异常处理和重试
4. **最佳实践** - 生产级代码

选择适合你场景的示例,开始构建自己的 AI 代理吧!

---

**相关文档:**
- [完整技术文档](./CLAUDE_AGENT_SDK_RESEARCH.md)
- [快速入门指南](./QUICK_START_GUIDE.md)
