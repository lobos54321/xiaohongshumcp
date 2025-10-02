package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"gorm.io/gorm"

	"xiaohongshu-proxy/internal/api"
	"xiaohongshu-proxy/internal/auth"
	"xiaohongshu-proxy/internal/claude"
	"xiaohongshu-proxy/internal/config"
	"xiaohongshu-proxy/internal/mcp"
	"xiaohongshu-proxy/internal/user"
	"xiaohongshu-proxy/pkg/database"
	"xiaohongshu-proxy/pkg/logger"
)

func main() {
	// 加载配置
	cfg, err := config.Load("./configs")
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// 初始化日志
	logger.Init(cfg.Logging.Level, cfg.Logging.Format)
	logger.Info("Starting xiaohongshu-proxy server...")

	// 初始化数据库
	if err := database.Init(&cfg.Database); err != nil {
		logger.Fatalf("Failed to initialize database: %v", err)
	}

	// 自动迁移数据库
	if err := migrateDatabase(); err != nil {
		logger.Fatalf("Failed to migrate database: %v", err)
	}

	// 初始化服务
	userService := user.NewService()
	authService := auth.NewService(&cfg.JWT)
	mcpManager := mcp.NewManager(&cfg.MCP)
	claudeService := claude.NewService(&cfg.Claude, mcpManager)

	// 启动MCP连接清理例程
	ctx, cancel := context.WithCancel(context.Background())
	go mcpManager.StartCleanupRoutine(ctx, 5*time.Minute)

	// 设置路由
	router := api.NewRouter(userService, authService, claudeService)
	ginEngine := router.SetupRoutes()

	// 创建HTTP服务器
	server := &http.Server{
		Addr:         fmt.Sprintf("%s:%d", cfg.App.Host, cfg.App.Port),
		Handler:      ginEngine,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// 启动服务器
	go func() {
		logger.Infof("Server starting on %s:%d", cfg.App.Host, cfg.App.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatalf("Failed to start server: %v", err)
		}
	}()

	// 等待中断信号
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")

	// 优雅关闭
	cancel() // 停止后台任务

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Errorf("Server forced to shutdown: %v", err)
	}

	// 关闭数据库连接
	if err := database.Close(); err != nil {
		logger.Errorf("Failed to close database: %v", err)
	}

	logger.Info("Server shutdown complete")
}

// migrateDatabase 数据库迁移
func migrateDatabase() error {
	db := database.GetDB()

	// 自动迁移用户相关表
	if err := db.AutoMigrate(
		&user.User{},
		&user.XiaohongshuAccount{},
		&user.UsageRecord{},
	); err != nil {
		return fmt.Errorf("failed to migrate database: %w", err)
	}

	// 创建默认管理员用户（如果不存在）
	if err := createDefaultAdmin(db); err != nil {
		logger.Warnf("Failed to create default admin: %v", err)
	}

	logger.Info("Database migration completed")
	return nil
}

// createDefaultAdmin 创建默认管理员用户
func createDefaultAdmin(db *gorm.DB) error {
	var count int64
	if err := db.Model(&user.User{}).Count(&count).Error; err != nil {
		return err
	}

	// 如果已有用户，跳过创建默认管理员
	if count > 0 {
		return nil
	}

	admin := &user.User{
		Username: "admin",
		Email:    "admin@xiaohongshu-proxy.com",
		Name:     "Administrator",
		Status:   "active",
		Plan:     "enterprise",
	}

	if err := admin.HashPassword("admin123"); err != nil {
		return err
	}

	if err := db.Create(admin).Error; err != nil {
		return err
	}

	logger.WithFields(map[string]interface{}{
		"username": admin.Username,
		"email":    admin.Email,
		"api_key":  admin.APIKey,
	}).Info("Default admin user created")

	return nil
}