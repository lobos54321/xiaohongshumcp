/**
 * BrowserSessionManager
 * 
 * Manages persistent Playwright browser contexts for users, enabling
 * session reuse across login and publishing operations to avoid
 * cookie transfer issues that cause session validation failures.
 */

import { BrowserContext, chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

interface BrowserSession {
    userId: string;
    context: BrowserContext;
    createdAt: Date;
    lastActivityAt: Date;
    userDataDir: string;
}

export class BrowserSessionManager {
    private sessions: Map<string, BrowserSession> = new Map();
    private sessionTimeout: number; // milliseconds
    private cleanupInterval?: NodeJS.Timeout;

    constructor(sessionTimeout: number = 30 * 60 * 1000) { // 30 minutes default
        this.sessionTimeout = sessionTimeout;
        this.startCleanupTask();

        console.log(`[BrowserSessionManager] Initialized with ${sessionTimeout / 1000 / 60}min timeout`);
    }

    /**
     * Register an existing browser context for a user
     */
    async registerSession(
        userId: string,
        context: BrowserContext,
        userDataDir: string
    ): Promise<void> {
        // Close any existing session first
        if (this.sessions.has(userId)) {
            console.log(`[BrowserSessionManager] Closing existing session for ${userId}`);
            await this.closeSession(userId);
        }

        const session: BrowserSession = {
            userId,
            context,
            createdAt: new Date(),
            lastActivityAt: new Date(),
            userDataDir
        };

        this.sessions.set(userId, session);
        console.log(`[BrowserSessionManager] ✅ Registered session for ${userId}`);
    }

    /**
     * Get an existing browser context for a user
     */
    getSession(userId: string): BrowserContext | null {
        const session = this.sessions.get(userId);

        if (!session) {
            return null;
        }

        // Update activity timestamp
        session.lastActivityAt = new Date();
        return session.context;
    }

    /**
     * Check if user has an active session
     */
    hasActiveSession(userId: string): boolean {
        return this.sessions.has(userId);
    }

    /**
     * Update the last activity timestamp for a session
     */
    updateActivity(userId: string): void {
        const session = this.sessions.get(userId);
        if (session) {
            session.lastActivityAt = new Date();
            console.log(`[BrowserSessionManager] 🔄 Updated activity for ${userId}`);
        }
    }

    /**
     * Close a specific user's browser session
     */
    async closeSession(userId: string): Promise<void> {
        const session = this.sessions.get(userId);
        if (!session) {
            return;
        }

        try {
            // Close all pages first
            const pages = session.context.pages();
            await Promise.all(pages.map(page => page.close().catch(() => { })));

            // Close the context
            await session.context.close();

            // Clean up temp directory
            if (session.userDataDir && session.userDataDir.startsWith('/tmp/')) {
                try {
                    fs.rmSync(session.userDataDir, { recursive: true, force: true });
                } catch (e) {
                    console.warn(`[BrowserSessionManager] Failed to clean up temp dir: ${e}`);
                }
            }

            this.sessions.delete(userId);
            console.log(`[BrowserSessionManager] ✅ Closed session for ${userId}`);
        } catch (error) {
            console.error(`[BrowserSessionManager] Error closing session for ${userId}:`, error);
            // Still remove from map even if closing failed
            this.sessions.delete(userId);
        }
    }

    /**
     * Get session metadata for debugging
     */
    getSessionInfo(userId: string): { createdAt: Date; lastActivityAt: Date; age: number } | null {
        const session = this.sessions.get(userId);
        if (!session) {
            return null;
        }

        return {
            createdAt: session.createdAt,
            lastActivityAt: session.lastActivityAt,
            age: Date.now() - session.createdAt.getTime()
        };
    }

    /**
     * Get all active session user IDs
     */
    getActiveSessions(): string[] {
        return Array.from(this.sessions.keys());
    }

    /**
     * Cleanup expired sessions based on inactivity
     */
    private async cleanupExpiredSessions(): Promise<void> {
        const now = Date.now();
        const expiredSessions: string[] = [];

        for (const [userId, session] of this.sessions.entries()) {
            const inactiveTime = now - session.lastActivityAt.getTime();

            if (inactiveTime > this.sessionTimeout) {
                console.log(`[BrowserSessionManager] 🧹 Session expired for ${userId} (inactive for ${inactiveTime / 1000 / 60}min)`);
                expiredSessions.push(userId);
            }
        }

        // Close expired sessions
        for (const userId of expiredSessions) {
            await this.closeSession(userId);
        }

        if (expiredSessions.length > 0) {
            console.log(`[BrowserSessionManager] Cleaned up ${expiredSessions.length} expired session(s)`);
        }
    }

    /**
     * Start periodic cleanup task
     */
    private startCleanupTask(): void {
        // Run cleanup every 5 minutes
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredSessions().catch(err => {
                console.error('[BrowserSessionManager] Cleanup task error:', err);
            });
        }, 5 * 60 * 1000);

        console.log('[BrowserSessionManager] 🧹 Cleanup task started (runs every 5 minutes)');
    }

    /**
     * Gracefully shutdown all sessions
     */
    async shutdown(): Promise<void> {
        console.log('[BrowserSessionManager] Shutting down...');

        // Stop cleanup task
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        // Close all sessions
        const userIds = Array.from(this.sessions.keys());
        await Promise.all(userIds.map(userId => this.closeSession(userId)));

        console.log('[BrowserSessionManager] ✅ Shutdown complete');
    }
}
