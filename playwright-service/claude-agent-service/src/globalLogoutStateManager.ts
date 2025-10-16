/**
 * 全局退出状态管理器
 * 提供统一的退出状态检查，防止所有Cookie保存机制在用户退出后重新创建Cookie
 * 同时管理全局登录会话状态，防止新登录会话的创建
 */

export class GlobalLogoutStateManager {
  private static instance: GlobalLogoutStateManager;
  private loggedOutUsers: Set<string> = new Set();
  private logoutTimestamps: Map<string, number> = new Map();
  private globalLogoutState: boolean = false; // 全局退出状态
  private globalLogoutTimestamp: number = 0;
  private static readonly LOGOUT_COOLDOWN = 120000; // 2分钟冷却期，比AutoCookieImporter更长
  private static readonly GLOBAL_LOGOUT_COOLDOWN = 180000; // 全局退出保护3分钟

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

    // 启动全局退出状态
    this.activateGlobalLogoutState();

    // 设置定时器，在冷却期后自动清除退出状态
    setTimeout(() => {
      this.loggedOutUsers.delete(userId);
      this.logoutTimestamps.delete(userId);
      console.log(`[GlobalLogoutState] 用户 ${userId} 的退出保护期已结束`);
    }, GlobalLogoutStateManager.LOGOUT_COOLDOWN);
  }

  /**
   * 激活全局退出状态 - 阻止所有新登录会话
   */
  public activateGlobalLogoutState(): void {
    console.log(`[GlobalLogoutState] 🌐 激活全局退出状态，阻止所有新登录会话创建`);
    this.globalLogoutState = true;
    this.globalLogoutTimestamp = Date.now();

    // 设置定时器，在全局冷却期后清除全局退出状态
    setTimeout(() => {
      this.globalLogoutState = false;
      console.log(`[GlobalLogoutState] 🌐 全局退出保护期已结束，允许新登录会话`);
    }, GlobalLogoutStateManager.GLOBAL_LOGOUT_COOLDOWN);
  }

  /**
   * 检查是否在全局退出状态 - 阻止任何新登录会话
   */
  public isInGlobalLogoutState(): boolean {
    if (!this.globalLogoutState) {
      return false;
    }

    const timeSinceGlobalLogout = Date.now() - this.globalLogoutTimestamp;
    const stillInGlobalCooldown = timeSinceGlobalLogout < GlobalLogoutStateManager.GLOBAL_LOGOUT_COOLDOWN;

    if (stillInGlobalCooldown) {
      const remainingTime = Math.ceil((GlobalLogoutStateManager.GLOBAL_LOGOUT_COOLDOWN - timeSinceGlobalLogout) / 1000);
      console.log(`[GlobalLogoutState] 🌐 系统仍在全局退出保护期内，剩余 ${remainingTime} 秒`);
    }

    return stillInGlobalCooldown;
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
    // 首先检查全局退出状态
    if (this.isInGlobalLogoutState()) {
      console.log(`[GlobalLogoutState] 🛡️ 阻止 ${source} 为用户 ${userId} 保存Cookie - 系统在全局退出保护期内`);
      return false;
    }

    // 然后检查特定用户的退出状态
    if (this.isUserInLogoutCooldown(userId)) {
      console.log(`[GlobalLogoutState] 🛡️ 阻止 ${source} 为用户 ${userId} 保存Cookie - 在退出保护期内`);
      return false;
    }
    return true;
  }

  /**
   * 检查是否允许创建新登录会话
   */
  public canCreateNewLoginSession(userId: string = 'unknown'): boolean {
    if (this.isInGlobalLogoutState()) {
      console.log(`[GlobalLogoutState] 🚫 阻止为用户 ${userId} 创建新登录会话 - 系统在全局退出保护期内`);
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
   * 强制清除全局退出状态（紧急使用）
   */
  public forceResetGlobalLogoutState(): void {
    console.log(`[GlobalLogoutState] ⚡ 强制重置全局退出状态`);
    this.globalLogoutState = false;
    this.globalLogoutTimestamp = 0;
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

  /**
   * 获取全局退出状态的详细信息
   */
  public getGlobalLogoutInfo(): { inGlobalCooldown: boolean; globalLogoutTime?: number; remainingSeconds?: number } {
    if (!this.globalLogoutState) {
      return { inGlobalCooldown: false };
    }

    const timeSinceGlobalLogout = Date.now() - this.globalLogoutTimestamp;
    const remainingTime = GlobalLogoutStateManager.GLOBAL_LOGOUT_COOLDOWN - timeSinceGlobalLogout;

    return {
      inGlobalCooldown: remainingTime > 0,
      globalLogoutTime: this.globalLogoutTimestamp,
      remainingSeconds: Math.ceil(remainingTime / 1000)
    };
  }
}

// 导出单例实例
export const globalLogoutState = GlobalLogoutStateManager.getInstance();