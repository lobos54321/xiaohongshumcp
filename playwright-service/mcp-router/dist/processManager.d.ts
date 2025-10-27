export declare class XiaohongshuMCPProcessManager {
    private processes;
    private basePort;
    private maxProcesses;
    private cleanupTimeout;
    private mcpBinary;
    private cookieDir;
    constructor(mcpBinaryPath: string, cookieDir: string);
    /**
     * 启动时清理全局符号链接
     * 防止旧数据（如测试用户）的符号链接污染新启动的服务
     */
    private cleanupGlobalSymlink;
    /**
     * 检查端口是否真正可用（操作系统级别）
     */
    private isPortAvailable;
    /**
     * 分配端口 - 改进版：检查操作系统级别的端口占用
     */
    private allocatePort;
    /**
     * 启动用户专属的 MCP 进程
     */
    private startProcess;
    /**
     * 等待服务就绪
     */
    private waitForReady;
    /**
     * 调度自动清理
     */
    private scheduleCleanup;
    /**
     * 杀死进程
     */
    private killProcess;
    /**
     * 获取或创建用户的 MCP 进程
     */
    getOrCreateProcess(userId: string): Promise<number>;
    /**
     * 创建 MCP binary 所需的 cookies 符号链接
     * 🔥 每次调用前都需要创建，因为多个用户共享同一个符号链接路径
     *
     * 修复说明：
     * - 使用 lstatSync 而不是 existsSync，因为 existsSync 无法检测失效的符号链接
     * - 失效符号链接：指向不存在的目标文件，但符号链接本身存在
     * - 详细日志帮助调试和追踪问题
     */
    private ensureCookieSymlink;
    /**
     * 调用 MCP 工具
     */
    callTool(userId: string, endpoint: string, method?: string, data?: any): Promise<any>;
    /**
     * 刷新用户Cookie - 重启对应的MCP进程使用新Cookie
     */
    refreshUserCookies(userId: string, cookies?: any[]): Promise<void>;
    /**
     * 获取统计信息
     */
    getStats(): {
        activeProcesses: number;
        maxProcesses: number;
        processes: {
            userId: string;
            port: number;
            lastUsed: string;
            inactive: number;
        }[];
    };
    /**
     * 清理特定用户的进程
     */
    cleanupUser(userId: string): Promise<void>;
    /**
     * 清理所有进程
     */
    cleanup(): void;
}
//# sourceMappingURL=processManager.d.ts.map