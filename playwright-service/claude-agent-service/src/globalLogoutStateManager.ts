/**
 * 全局退出状态管理器
 * 提供统一的退出状态检查，防止所有Cookie保存机制在用户退出后重新创建Cookie
 */

export class GlobalLogoutStateManager {
  private static instance: GlobalLogoutStateManager;
  private loggedOutUsers: Set<string> = new Set();
  private logoutTimestamps: Map<string, number> = new Map();
  private static readonly LOGOUT_COOLDOWN = 120000; // 2分钟冷却期，比AutoCookieImporter更长

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): GlobalLogoutStateManager {
    if (!GlobalLogoutStateManager.instance) {
      GlobalLogoutStateManager.instance = new GlobalLogoutStateManager();
    }
    return GlobalLogoutStateManager.instance;
  }

  /**
   * 通知用户已退出登录
   */
  public notifyUserLogout(userId: string): void {
    console.log(`[GlobalLogoutState] 🚪 用户 ${userId} 已退出登录，启动全局保护机制`);
    this.loggedOutUsers.add(userId);
    this.logoutTimestamps.set(userId, Date.now());

    // 设置定时器，在冷却期后自动清除退出状态
    setTimeout(() => {
      this.loggedOutUsers.delete(userId);
      this.logoutTimestamps.delete(userId);
      console.log(`[GlobalLogoutState] 用户 ${userId} 的全局退出保护期已结束`);
    }, GlobalLogoutStateManager.LOGOUT_COOLDOWN);
  }

  /**
   * 检查用户是否在退出冷却期内
   */
  public isUserInLogoutCooldown(userId: string): boolean {
    if (!this.loggedOutUsers.has(userId)) {
      return false;
    }

    const logoutTime = this.logoutTimestamps.get(userId);
    if (!logoutTime) {
      return false;
    }

    const timeSinceLogout = Date.now() - logoutTime;
    const stillInCooldown = timeSinceLogout < GlobalLogoutStateManager.LOGOUT_COOLDOWN;

    if (stillInCooldown) {
      const remainingTime = Math.ceil((GlobalLogoutStateManager.LOGOUT_COOLDOWN - timeSinceLogout) / 1000);
      console.log(`[GlobalLogoutState] 🚫 用户 ${userId} 仍在退出保护期内，剩余 ${remainingTime} 秒`);
    }

    return stillInCooldown;
  }

  /**
   * 检查是否允许保存Cookie（统一检查点）
   */
  public canSaveCookies(userId: string, source: string = 'unknown'): boolean {
    if (this.isUserInLogoutCooldown(userId)) {
      console.log(`[GlobalLogoutState] 🛡️ 阻止 ${source} 为用户 ${userId} 保存Cookie - 在退出保护期内`);
      return false;
    }
    return true;
  }

  /**
   * 强制清除用户的退出状态（紧急使用）
   */
  public forceResetUserLogoutState(userId: string): void {
    console.log(`[GlobalLogoutState] ⚡ 强制重置用户 ${userId} 的退出状态`);
    this.loggedOutUsers.delete(userId);
    this.logoutTimestamps.delete(userId);
  }

  /**
   * 获取当前所有在退出状态的用户
   */
  public getLoggedOutUsers(): string[] {
    return Array.from(this.loggedOutUsers);
  }

  /**
   * 获取用户退出状态的详细信息
   */
  public getUserLogoutInfo(userId: string): { inCooldown: boolean; logoutTime?: number; remainingSeconds?: number } {
    if (!this.loggedOutUsers.has(userId)) {
      return { inCooldown: false };
    }

    const logoutTime = this.logoutTimestamps.get(userId);
    if (!logoutTime) {
      return { inCooldown: false };
    }

    const timeSinceLogout = Date.now() - logoutTime;
    const remainingTime = GlobalLogoutStateManager.LOGOUT_COOLDOWN - timeSinceLogout;

    return {
      inCooldown: remainingTime > 0,
      logoutTime,
      remainingSeconds: Math.ceil(remainingTime / 1000)
    };
  }
}

// 导出单例实例
export const globalLogoutState = GlobalLogoutStateManager.getInstance();