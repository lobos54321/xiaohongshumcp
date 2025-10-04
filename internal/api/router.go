package api

import (
	"github.com/gin-gonic/gin"

	"xiaohongshu-proxy/internal/auth"
	"xiaohongshu-proxy/internal/claude"
	"xiaohongshu-proxy/internal/user"
)

// Router 路由配置
type Router struct {
	authHandler        *AuthHandler
	xiaohongshuHandler *XiaohongshuHandler
	browserHandler     *BrowserHandler
	playwrightHandler  *PlaywrightHandler
	authService        *auth.Service
	userService        *user.Service
}

// NewRouter 创建路由
func NewRouter(
	userService *user.Service,
	authService *auth.Service,
	claudeService *claude.Service,
) *Router {
	return &Router{
		authHandler:        NewAuthHandler(userService, authService),
		xiaohongshuHandler: NewXiaohongshuHandler(claudeService, userService),
		browserHandler:     NewBrowserHandler(userService),
		playwrightHandler:  NewPlaywrightHandler(),
		authService:        authService,
		userService:        userService,
	}
}

// SetupRoutes 设置路由
func (r *Router) SetupRoutes() *gin.Engine {
	// 创建gin实例
	router := gin.New()

	// 添加中间件
	router.Use(LoggerMiddleware())
	router.Use(gin.Recovery())
	router.Use(CORSMiddleware())

	// 健康检查
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, Response{
			Code:    200,
			Message: "Service is healthy",
			Data: map[string]interface{}{
				"service": "xiaohongshu-proxy",
				"version": "1.0.0",
				"status":  "running",
			},
		})
	})

	// API版本分组
	v1 := router.Group("/api/v1")

	// 认证相关路由（无需认证）
	auth := v1.Group("/auth")
	{
		auth.POST("/register", r.authHandler.Register)
		auth.POST("/login", r.authHandler.Login)
		auth.POST("/refresh", r.authHandler.RefreshToken)
	}

	// 用户相关路由（需要JWT认证）
	user := v1.Group("/user")
	user.Use(AuthMiddleware(r.authService, r.userService))
	{
		user.GET("/profile", r.authHandler.GetProfile)
		user.PUT("/profile", r.authHandler.UpdateProfile)
		user.GET("/stats", r.authHandler.GetUserStats)
		user.GET("/usage", r.authHandler.GetUsageHistory)
	}

	// 小红书功能路由（支持JWT和API Key两种认证方式）
	xiaohongshu := v1.Group("/xiaohongshu")
	{
		// JWT认证的路由
		jwtAuth := xiaohongshu.Group("")
		jwtAuth.Use(AuthMiddleware(r.authService, r.userService))
		{
			jwtAuth.POST("/process", r.xiaohongshuHandler.ProcessXiaohongshuRequest)
			jwtAuth.GET("/login-status", r.xiaohongshuHandler.CheckLoginStatus)
			jwtAuth.POST("/publish", r.xiaohongshuHandler.PublishContent)
			jwtAuth.POST("/search", r.xiaohongshuHandler.SearchFeeds)
			jwtAuth.GET("/feeds/recommended", r.xiaohongshuHandler.GetRecommendedFeeds)

			// Playwright 自动化路由（新版）
			jwtAuth.POST("/playwright/publish", r.playwrightHandler.SubmitPublishTask)
			jwtAuth.GET("/playwright/task/:taskId", r.playwrightHandler.GetTaskStatus)
			jwtAuth.POST("/playwright/login/qrcode", r.playwrightHandler.GetLoginQRCode)
			jwtAuth.GET("/playwright/login/status", r.playwrightHandler.CheckLoginStatus)

			// 浏览器自动化相关路由（旧版，保留兼容）
			jwtAuth.POST("/browser/login/qrcode", r.browserHandler.GetLoginQRCode)
			jwtAuth.GET("/browser/login/status", r.browserHandler.CheckLoginStatus)
			jwtAuth.POST("/browser/publish", r.browserHandler.PublishNote)
		}

		// API Key认证的路由（供第三方集成使用）
		apiAuth := xiaohongshu.Group("/api")
		apiAuth.Use(APIKeyMiddleware(r.userService))
		{
			apiAuth.POST("/process", r.xiaohongshuHandler.ProcessXiaohongshuRequest)
			apiAuth.GET("/login-status", r.xiaohongshuHandler.CheckLoginStatus)
			apiAuth.POST("/publish", r.xiaohongshuHandler.PublishContent)
			apiAuth.POST("/search", r.xiaohongshuHandler.SearchFeeds)
			apiAuth.GET("/feeds/recommended", r.xiaohongshuHandler.GetRecommendedFeeds)

			// 浏览器自动化相关路由
			apiAuth.POST("/browser/login/qrcode", r.browserHandler.GetLoginQRCode)
			apiAuth.GET("/browser/login/status", r.browserHandler.CheckLoginStatus)
			apiAuth.POST("/browser/publish", r.browserHandler.PublishNote)
		}
	}

	// 管理员路由（未来扩展）
	admin := v1.Group("/admin")
	admin.Use(AuthMiddleware(r.authService, r.userService))
	// admin.Use(AdminMiddleware()) // 管理员权限检查中间件
	{
		// admin.GET("/users", r.adminHandler.ListUsers)
		// admin.GET("/stats", r.adminHandler.GetSystemStats)
	}

	return router
}