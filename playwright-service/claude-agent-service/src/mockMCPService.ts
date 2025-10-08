/**
 * 模拟MCP服务 - 临时替代方案
 * 提供HTTP API模拟xiaohongshu-mcp功能
 */

import express, { Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class MockMCPService {
  private app: express.Application;
  private port: number;
  private userSessions: Map<string, any> = new Map();

  constructor(port = 3000) {
    this.port = port;
    this.app = express();
    this.app.use(express.json());
    this.setupRoutes();
  }

  private setupRoutes() {
    // 健康检查
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'healthy', service: 'mock-mcp-service' });
    });

    // MCP调用接口
    this.app.post('/mcp/call', async (req: Request, res: Response) => {
      try {
        const { userId, toolName, arguments: args } = req.body;
        console.log(`[Mock MCP] Tool call: ${toolName} for user ${userId}`);

        switch (toolName) {
          case 'xiaohongshu_check_login':
            res.json(await this.checkLogin(userId));
            break;

          case 'xiaohongshu_get_login_qrcode':
            res.json(await this.getLoginQRCode(userId));
            break;

          case 'xiaohongshu_publish_content':
            res.json(await this.publishContent(userId, args));
            break;

          case 'xiaohongshu_search_feeds':
            res.json(await this.searchFeeds(userId, args));
            break;

          default:
            res.json({
              success: false,
              error: `Unsupported tool: ${toolName}`
            });
        }
      } catch (error: any) {
        console.error(`[Mock MCP] Error:`, error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
  }

  private async checkLogin(userId: string): Promise<any> {
    // 模拟检查登录状态
    const session = this.userSessions.get(userId);

    if (session && session.isLoggedIn) {
      return {
        success: true,
        data: {
          isLoggedIn: true,
          loginTime: session.loginTime,
          lastUsed: Date.now(),
          status: 'logged_in'
        }
      };
    }

    return {
      success: true,
      data: {
        isLoggedIn: false,
        status: 'need_login'
      }
    };
  }

  private async getLoginQRCode(userId: string): Promise<any> {
    console.log(`[Mock MCP] Starting login process for user ${userId}`);

    // 自动打开小红书登录页面
    try {
      await execAsync('open "https://www.xiaohongshu.com/login"');
      console.log(`[Mock MCP] Opened xiaohongshu login page for user ${userId}`);
    } catch (error) {
      console.error(`[Mock MCP] Failed to open login page:`, error);
    }

    // 模拟QR码生成
    const qrCode = `qr_${userId}_${Date.now()}`;

    // 启动登录检测定时器
    this.startLoginDetection(userId);

    return {
      success: true,
      data: {
        qrCode: qrCode,
        instruction: '请在浏览器中扫码登录，系统将自动检测登录状态',
        status: 'qr_generated'
      }
    };
  }

  private startLoginDetection(userId: string) {
    // 模拟30秒后自动登录成功
    setTimeout(() => {
      this.userSessions.set(userId, {
        isLoggedIn: true,
        loginTime: Date.now(),
        lastUsed: Date.now()
      });
      console.log(`[Mock MCP] Simulated login success for user ${userId}`);
    }, 30000);
  }

  private async publishContent(userId: string, content: any): Promise<any> {
    const session = this.userSessions.get(userId);

    if (!session || !session.isLoggedIn) {
      return {
        success: false,
        error: 'User not logged in'
      };
    }

    // 模拟发布内容
    console.log(`[Mock MCP] Publishing content for user ${userId}:`, content);

    // 模拟发布延迟
    await new Promise(resolve => setTimeout(resolve, 2000));

    return {
      success: true,
      data: {
        postId: `post_${Date.now()}`,
        url: `https://www.xiaohongshu.com/discovery/item/mock_${Date.now()}`,
        status: 'published',
        title: content.title,
        description: content.description
      }
    };
  }

  private async searchFeeds(userId: string, args: any): Promise<any> {
    const session = this.userSessions.get(userId);

    if (!session || !session.isLoggedIn) {
      return {
        success: false,
        error: 'User not logged in'
      };
    }

    // 模拟搜索结果
    console.log(`[Mock MCP] Searching feeds for keyword: ${args.keyword}`);

    const mockResults = [
      {
        id: 'feed_1',
        title: `${args.keyword}相关内容1`,
        description: `这是关于${args.keyword}的热门内容`,
        author: 'MockUser1',
        likes: 1234,
        comments: 56
      },
      {
        id: 'feed_2',
        title: `${args.keyword}相关内容2`,
        description: `另一个关于${args.keyword}的精彩分享`,
        author: 'MockUser2',
        likes: 2345,
        comments: 78
      }
    ];

    return {
      success: true,
      data: mockResults.slice(0, args.limit || 10)
    };
  }

  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.port, () => {
        console.log(`[Mock MCP Service] Running on port ${this.port}`);
        resolve();
      });
    });
  }
}