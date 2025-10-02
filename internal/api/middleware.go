package api

import (
	"fmt"
	"strings"

	"github.com/gin-gonic/gin"

	"xiaohongshu-proxy/internal/auth"
	"xiaohongshu-proxy/internal/user"
)

// AuthMiddleware JWT认证中间件
func AuthMiddleware(authService *auth.Service, userService *user.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(401, Response{
				Code:    401,
				Message: "Authorization header required",
			})
			c.Abort()
			return
		}

		// 检查Bearer前缀
		if !strings.HasPrefix(authHeader, "Bearer ") {
			c.JSON(401, Response{
				Code:    401,
				Message: "Invalid authorization header format",
			})
			c.Abort()
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")

		// 验证token
		claims, err := authService.ValidateToken(tokenString)
		if err != nil {
			c.JSON(401, Response{
				Code:    401,
				Message: "Invalid token",
			})
			c.Abort()
			return
		}

		// 检查用户是否存在且状态正常
		user, err := userService.GetUserByID(claims.UserID)
		if err != nil {
			c.JSON(401, Response{
				Code:    401,
				Message: "User not found",
			})
			c.Abort()
			return
		}

		if user.Status != "active" {
			c.JSON(403, Response{
				Code:    403,
				Message: "User account is inactive",
			})
			c.Abort()
			return
		}

		// 将用户信息存储到context中
		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("user_plan", claims.Plan)

		c.Next()
	}
}

// APIKeyMiddleware API Key认证中间件
func APIKeyMiddleware(userService *user.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		apiKey := c.GetHeader("X-API-Key")
		if apiKey == "" {
			c.JSON(401, Response{
				Code:    401,
				Message: "API key required",
			})
			c.Abort()
			return
		}

		// 验证API Key
		user, err := userService.GetUserByAPIKey(apiKey)
		if err != nil {
			c.JSON(401, Response{
				Code:    401,
				Message: "Invalid API key",
			})
			c.Abort()
			return
		}

		if user.Status != "active" {
			c.JSON(403, Response{
				Code:    403,
				Message: "User account is inactive",
			})
			c.Abort()
			return
		}

		// 将用户信息存储到context中
		c.Set("user_id", user.ID)
		c.Set("username", user.Username)
		c.Set("user_plan", user.Plan)

		c.Next()
	}
}

// CORSMiddleware 跨域中间件
func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Authorization, X-API-Key")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

// LoggerMiddleware 日志中间件
func LoggerMiddleware() gin.HandlerFunc {
	return gin.LoggerWithFormatter(func(param gin.LogFormatterParams) string {
		return fmt.Sprintf("%s - [%s] \"%s %s %s %d %s \"%s\" %s\"\n",
			param.ClientIP,
			param.TimeStamp.Format("02/Jan/2006:15:04:05 -0700"),
			param.Method,
			param.Path,
			param.Request.Proto,
			param.StatusCode,
			param.Latency,
			param.Request.UserAgent(),
			param.ErrorMessage,
		)
	})
}