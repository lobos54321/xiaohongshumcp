/**
 * MCP-based Authentication Client
 * 完全自动化的小红书登录 - 无需手动操作
 */

import axios from 'axios';

export interface MCPLoginResult {
  success: boolean;
  data?: any;
  error?: string;
  status?: 'logged_in' | 'need_qr' | 'qr_expired' | 'login_pending' | 'error';
}

export interface MCPPublishResult {
  success: boolean;
  data?: any;
  error?: string;
}

export class MCPAuthClient {
  private mcpRouterUrl: string;

  constructor(mcpRouterUrl = 'http://127.0.0.1:3000') {
    this.mcpRouterUrl = mcpRouterUrl;
  }

  /**
   * 检查用户登录状态
   */
  async checkLoginStatus(userId: string): Promise<MCPLoginResult> {
    try {
      console.log(`[MCP Auth] Checking login status for user ${userId}`);

      const response = await axios.post(`${this.mcpRouterUrl}/mcp/call`, {
        userId,
        toolName: 'xiaohongshu_check_login',
        arguments: {}
      });

      if (response.data.success) {
        console.log(`[MCP Auth] User ${userId} login status: ${response.data.data?.status}`);
        return {
          success: true,
          data: response.data.data,
          status: response.data.data?.isLoggedIn ? 'logged_in' : 'need_qr'
        };
      } else {
        return {
          success: false,
          error: response.data.error || 'Unknown error',
          status: 'error'
        };
      }
    } catch (error: any) {
      console.error(`[MCP Auth] Error checking login status:`, error.message);
      return {
        success: false,
        error: error.message,
        status: 'error'
      };
    }
  }

  /**
   * 启动自动登录流程
   */
  async startAutoLogin(userId: string): Promise<MCPLoginResult> {
    try {
      console.log(`[MCP Auth] Starting auto login for user ${userId}`);

      // 先检查登录状态
      const statusCheck = await this.checkLoginStatus(userId);
      if (statusCheck.success && statusCheck.status === 'logged_in') {
        console.log(`[MCP Auth] User ${userId} already logged in`);
        return {
          success: true,
          data: statusCheck.data,
          status: 'logged_in'
        };
      }

      // 获取登录二维码
      const response = await axios.post(`${this.mcpRouterUrl}/mcp/call`, {
        userId,
        toolName: 'xiaohongshu_get_login_qrcode',
        arguments: {}
      });

      if (response.data.success) {
        console.log(`[MCP Auth] Login QR code obtained for user ${userId}`);
        return {
          success: true,
          data: response.data.data,
          status: 'need_qr'
        };
      } else {
        return {
          success: false,
          error: response.data.error || 'Failed to get QR code',
          status: 'error'
        };
      }
    } catch (error: any) {
      console.error(`[MCP Auth] Error starting auto login:`, error.message);
      return {
        success: false,
        error: error.message,
        status: 'error'
      };
    }
  }

  /**
   * 等待登录完成 - 定期检查登录状态
   */
  async waitForLogin(userId: string, maxWaitTime = 300000): Promise<MCPLoginResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const checkInterval = setInterval(async () => {
        try {
          const elapsed = Date.now() - startTime;

          if (elapsed > maxWaitTime) {
            clearInterval(checkInterval);
            resolve({
              success: false,
              error: 'Login timeout',
              status: 'qr_expired'
            });
            return;
          }

          const statusCheck = await this.checkLoginStatus(userId);
          if (statusCheck.success && statusCheck.status === 'logged_in') {
            clearInterval(checkInterval);
            console.log(`[MCP Auth] Login successful for user ${userId}`);
            resolve({
              success: true,
              data: statusCheck.data,
              status: 'logged_in'
            });
          }
        } catch (error: any) {
          console.error(`[MCP Auth] Error during login wait:`, error.message);
          // 继续等待，不要因为单次检查失败就退出
        }
      }, 5000); // 每5秒检查一次
    });
  }

  /**
   * 发布内容到小红书
   */
  async publishContent(userId: string, content: {
    title: string;
    description: string;
    images?: string[];
    tags?: string[];
    type?: 'normal' | 'video';
  }): Promise<MCPPublishResult> {
    try {
      console.log(`[MCP Auth] Publishing content for user ${userId}`);

      const response = await axios.post(`${this.mcpRouterUrl}/mcp/call`, {
        userId,
        toolName: content.type === 'video' ? 'xiaohongshu_publish_video' : 'xiaohongshu_publish_content',
        arguments: content
      });

      if (response.data.success) {
        console.log(`[MCP Auth] Content published successfully for user ${userId}`);
        return {
          success: true,
          data: response.data.data
        };
      } else {
        return {
          success: false,
          error: response.data.error || 'Publish failed'
        };
      }
    } catch (error: any) {
      console.error(`[MCP Auth] Error publishing content:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 搜索小红书内容
   */
  async searchContent(userId: string, keyword: string, limit = 20): Promise<any> {
    try {
      console.log(`[MCP Auth] Searching content for keyword: ${keyword}`);

      const response = await axios.post(`${this.mcpRouterUrl}/mcp/call`, {
        userId,
        toolName: 'xiaohongshu_search_feeds',
        arguments: { keyword, limit }
      });

      return response.data;
    } catch (error: any) {
      console.error(`[MCP Auth] Error searching content:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取用户个人资料
   */
  async getUserProfile(userId: string): Promise<any> {
    try {
      const response = await axios.post(`${this.mcpRouterUrl}/mcp/call`, {
        userId,
        toolName: 'xiaohongshu_user_profile',
        arguments: {}
      });

      return response.data;
    } catch (error: any) {
      console.error(`[MCP Auth] Error getting user profile:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 直接调用MCP工具
   */
  async callMCPTool(userId: string, toolName: string, args: any = {}): Promise<any> {
    try {
      console.log(`[MCP Auth] Calling MCP tool: ${toolName} for user ${userId}`);

      const response = await axios.post(`${this.mcpRouterUrl}/mcp/call`, {
        userId,
        toolName,
        arguments: args
      });

      return response.data;
    } catch (error: any) {
      console.error(`[MCP Auth] Error calling MCP tool ${toolName}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}
