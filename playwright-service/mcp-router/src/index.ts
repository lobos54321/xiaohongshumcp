import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { XiaohongshuMCPProcessManager } from './processManager.js';
import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

const MCP_BINARY = process.env.MCP_BINARY_PATH || './xiaohongshu-mcp';
const COOKIE_DIR = process.env.COOKIE_DIR || './cookies';

// 创建进程管理器
const processManager = new XiaohongshuMCPProcessManager(MCP_BINARY, COOKIE_DIR);

// 创建 MCP Server
const server = new Server(
  {
    name: 'xiaohongshu-mcp-router',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 工具定义（映射到 xiaohongshu-mcp 的 API）
const tools = [
  {
    name: 'xiaohongshu_check_login',
    description: '检查小红书登录状态',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: '用户ID',
        },
      },
      required: ['userId'],
    },
  },
  {
    name: 'xiaohongshu_get_login_qrcode',
    description: '获取小红书登录二维码',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: '用户ID',
        },
      },
      required: ['userId'],
    },
  },
  {
    name: 'xiaohongshu_publish_content',
    description: '发布图文内容到小红书',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: '用户ID',
        },
        title: {
          type: 'string',
          description: '文章标题（最多20字）',
        },
        content: {
          type: 'string',
          description: '文章内容',
        },
        images: {
          type: 'array',
          items: { type: 'string' },
          description: '图片路径数组（最多9张）',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '标签数组',
        },
      },
      required: ['userId', 'title', 'content'],
    },
  },
  {
    name: 'xiaohongshu_publish_video',
    description: '发布视频内容到小红书',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: '用户ID',
        },
        title: {
          type: 'string',
          description: '视频标题',
        },
        content: {
          type: 'string',
          description: '视频描述',
        },
        video: {
          type: 'string',
          description: '视频文件路径',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '标签数组',
        },
      },
      required: ['userId', 'title', 'content', 'video'],
    },
  },
  {
    name: 'xiaohongshu_list_feeds',
    description: '获取小红书推荐内容列表',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: '用户ID',
        },
      },
      required: ['userId'],
    },
  },
  {
    name: 'xiaohongshu_search_feeds',
    description: '搜索小红书内容',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: '用户ID',
        },
        keyword: {
          type: 'string',
          description: '搜索关键词',
        },
      },
      required: ['userId', 'keyword'],
    },
  },
  {
    name: 'xiaohongshu_get_feed_detail',
    description: '获取小红书帖子详情',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: '用户ID',
        },
        feed_id: {
          type: 'string',
          description: '帖子ID',
        },
        xsec_token: {
          type: 'string',
          description: '安全令牌',
        },
      },
      required: ['userId', 'feed_id', 'xsec_token'],
    },
  },
  {
    name: 'xiaohongshu_post_comment',
    description: '发表评论到小红书帖子',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: '用户ID',
        },
        feed_id: {
          type: 'string',
          description: '帖子ID',
        },
        xsec_token: {
          type: 'string',
          description: '安全令牌',
        },
        content: {
          type: 'string',
          description: '评论内容',
        },
      },
      required: ['userId', 'feed_id', 'xsec_token', 'content'],
    },
  },
  {
    name: 'xiaohongshu_user_profile',
    description: '获取小红书用户资料',
    inputSchema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: '用户ID（调用者）',
        },
        target_user_id: {
          type: 'string',
          description: '目标用户ID',
        },
        xsec_token: {
          type: 'string',
          description: '安全令牌',
        },
      },
      required: ['userId', 'target_user_id', 'xsec_token'],
    },
  },
];

// 工具到 API 端点的映射
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
};

// 列出工具
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// 调用工具
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // 提取 userId
    const userId = (args as any).userId;
    if (!userId) {
      throw new Error('userId is required');
    }

    // 获取端点配置
    const endpoint = toolToEndpoint[name];
    if (!endpoint) {
      throw new Error(`Unknown tool: ${name}`);
    }

    // 调用对应的 MCP 进程
    const result = await processManager.callTool(
      userId,
      endpoint.path,
      endpoint.method,
      args
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// 启动服务器
async function main() {
  console.log('[MCP Router] Starting xiaohongshu-mcp-router...');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.log('[MCP Router] Server ready');

  // 优雅关闭
  process.on('SIGINT', () => {
    console.log('[MCP Router] Shutting down...');
    processManager.cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('[MCP Router] Shutting down...');
    processManager.cleanup();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('[MCP Router] Fatal error:', error);
  process.exit(1);
});
