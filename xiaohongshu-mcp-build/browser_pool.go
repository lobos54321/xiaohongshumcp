package main

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/sirupsen/logrus"
	"github.com/xpzouying/headless_browser"
	"github.com/xpzouying/xiaohongshu-mcp/browser"
	"github.com/xpzouying/xiaohongshu-mcp/configs"
)

// BrowserPool 浏览器进程池
type BrowserPool struct {
	browsers chan *headless_browser.Browser
	mu       sync.Mutex
	closed   bool
	size     int
}

var (
	globalBrowserPool *BrowserPool
	poolOnce          sync.Once
)

// InitBrowserPool 初始化全局浏览器池
func InitBrowserPool(size int) {
	poolOnce.Do(func() {
		globalBrowserPool = &BrowserPool{
			browsers: make(chan *headless_browser.Browser, size),
			size:     size,
		}
		logrus.Infof("🌐 [BrowserPool] 初始化浏览器池，容量: %d", size)
	})
}

// GetBrowserPool 获取全局浏览器池
func GetBrowserPool() *BrowserPool {
	if globalBrowserPool == nil {
		InitBrowserPool(2) // 默认2个浏览器实例
	}
	return globalBrowserPool
}

// AcquireBrowser 获取浏览器实例（带超时）
func (p *BrowserPool) AcquireBrowser(ctx context.Context) (*headless_browser.Browser, error) {
	if p.closed {
		return nil, fmt.Errorf("浏览器池已关闭")
	}

	// 尝试从池中获取
	select {
	case b := <-p.browsers:
		logrus.Info("♻️ [BrowserPool] 复用池中的浏览器实例")
		return b, nil
	default:
		// 池中没有，创建新的
		return p.createBrowserWithTimeout(ctx)
	}
}

// createBrowserWithTimeout 创建浏览器（带超时保护）
func (p *BrowserPool) createBrowserWithTimeout(ctx context.Context) (*headless_browser.Browser, error) {
	logrus.Info("🌐 [BrowserPool] 开始创建新的浏览器实例...")
	
	// 创建超时context（30秒）
	createCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	browserChan := make(chan *headless_browser.Browser, 1)
	errChan := make(chan error, 1)

	// 在goroutine中创建浏览器
	go func() {
		defer func() {
			if r := recover(); r != nil {
				errChan <- fmt.Errorf("浏览器创建panic: %v", r)
			}
		}()

		b := browser.NewBrowser(configs.IsHeadless(), browser.WithBinPath(configs.GetBinPath()))
		browserChan <- b
	}()

	// 等待创建完成或超时
	select {
	case b := <-browserChan:
		logrus.Info("✅ [BrowserPool] 浏览器实例创建成功")
		return b, nil
	case err := <-errChan:
		logrus.Errorf("❌ [BrowserPool] 浏览器创建失败: %v", err)
		return nil, err
	case <-createCtx.Done():
		logrus.Error("⏱️ [BrowserPool] 浏览器创建超时（30秒）")
		return nil, fmt.Errorf("浏览器创建超时")
	case <-ctx.Done():
		logrus.Error("⏱️ [BrowserPool] 请求上下文取消")
		return nil, ctx.Err()
	}
}

// ReleaseBrowser 释放浏览器实例回池
func (p *BrowserPool) ReleaseBrowser(b *headless_browser.Browser) {
	if p.closed || b == nil {
		if b != nil {
			b.Close()
		}
		return
	}

	// 尝试放回池中
	select {
	case p.browsers <- b:
		logrus.Info("♻️ [BrowserPool] 浏览器实例放回池中复用")
	default:
		// 池满了，直接关闭
		logrus.Warn("⚠️ [BrowserPool] 池已满，关闭浏览器实例")
		b.Close()
	}
}

// Close 关闭浏览器池
func (p *BrowserPool) Close() {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.closed {
		return
	}
	p.closed = true

	close(p.browsers)
	for b := range p.browsers {
		b.Close()
	}
	logrus.Info("🔒 [BrowserPool] 浏览器池已关闭")
}

// CleanupZombieProcesses 清理僵尸浏览器进程
func CleanupZombieProcesses() {
	logrus.Info("🧹 [Cleanup] 开始清理僵尸浏览器进程...")
	// 这里可以添加系统命令清理逻辑
	// 但在容器环境中，重启服务是更安全的方式
}
