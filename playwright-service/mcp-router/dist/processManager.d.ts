export declare class XiaohongshuMCPProcessManager {
    private processes;
    private basePort;
    private maxProcesses;
    private cleanupTimeout;
    private mcpBinary;
    private cookieDir;
    constructor(mcpBinaryPath: string, cookieDir: string);
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