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
  details?: any;
  status?: number;
  originalError?: any;
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
      }, {
        timeout: 120000  // 2 分钟超时
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
      }, {
        timeout: 120000  // 2 分钟超时
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
    content: string;  // 🔥 修复：MCP binary期望的是 "content" 而非 "description"
    images?: string[];
    tags?: string[];
    type?: 'normal' | 'video';
  }): Promise<MCPPublishResult> {
    const startTime = Date.now();

    try {
      console.log(`[MCP Auth] Publishing content for user ${userId}`);
      console.log(`[MCP Auth] Timeout: 600000ms (10 minutes) for publish operation`);

      // 🔥 关键修复：增加超时时间到 10 分钟，匹配 MCP Router 的超时配置
      const response = await axios.post(`${this.mcpRouterUrl}/mcp/call`, {
        userId,
        toolName: content.type === 'video' ? 'xiaohongshu_publish_video' : 'xiaohongshu_publish_content',
        arguments: content
      }, {
        timeout: 600000,  // 10 分钟超时，发布操作涉及图片上传和浏览器自动化，需要较长时间
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const duration = Date.now() - startTime;
      console.log(`[MCP Auth] ✅ Publish completed in ${duration}ms (${(duration / 1000).toFixed(2)}s)`);

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
      const duration = Date.now() - startTime;

      // 🔥 增强错误信息，特别处理超时错误
      const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');

      const errorDetails = {
        message: error.message,
        code: error.code,  // 'ECONNABORTED' 表示超时
        timeout: error.timeout,
        isTimeout,
        duration: `${duration}ms`,
        status: error.response?.status,
        data: error.response?.data,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          timeout: error.config?.timeout
        }
      };

      console.error(`[MCP Auth] ❌ Error publishing content after ${duration}ms:`, errorDetails);

      // 优先使用服务器返回的详细错误信息
      let errorMessage = error.response?.data?.error ||
                         error.response?.data?.details?.error ||
                         error.response?.data?.message ||
                         error.message ||
                         'Unknown publish error';

      // 如果是超时错误，提供更明确的说明
      if (isTimeout) {
        errorMessage = `发布操作超时 (超过 ${error.config?.timeout || 600000}ms)。可能原因：图片下载慢、网络延迟、小红书服务器响应慢。请重试或减少图片数量。`;
      }

      return {
        success: false,
        error: errorMessage,
        details: error.response?.data?.details,
        status: error.response?.status,
        originalError: error.response?.data
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
      }, {
        timeout: 120000  // 2 分钟超时
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
      }, {
        timeout: 120000  // 2 分钟超时
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
      }, {
        timeout: 120000  // 2 分钟超时
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
