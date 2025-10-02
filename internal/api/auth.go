package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"xiaohongshu-proxy/internal/auth"
	"xiaohongshu-proxy/internal/user"
	"xiaohongshu-proxy/pkg/logger"
)

// Response 统一响应结构
type Response struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// PageResponse 分页响应结构
type PageResponse struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data"`
	Page    int         `json:"page"`
	Size    int         `json:"size"`
	Total   int64       `json:"total"`
}

// AuthHandler 认证相关处理器
type AuthHandler struct {
	userService *user.Service
	authService *auth.Service
}

// NewAuthHandler 创建认证处理器
func NewAuthHandler(userService *user.Service, authService *auth.Service) *AuthHandler {
	return &AuthHandler{
		userService: userService,
		authService: authService,
	}
}

// Register 用户注册
func (h *AuthHandler) Register(c *gin.Context) {
	var req user.CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Invalid request parameters",
		})
		return
	}

	newUser, err := h.userService.CreateUser(&req)
	if err != nil {
		logger.WithFields(map[string]interface{}{
			"error":    err.Error(),
			"username": req.Username,
			"email":    req.Email,
		}).Error("Failed to create user")

		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: err.Error(),
		})
		return
	}

	// 生成 JWT Token
	token, err := h.authService.GenerateToken(newUser.ID, newUser.Username, newUser.Plan)
	if err != nil {
		logger.WithField("user_id", newUser.ID).Error("Failed to generate token")
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to generate token",
		})
		return
	}

	c.JSON(http.StatusCreated, Response{
		Code:    201,
		Message: "User created successfully",
		Data: map[string]interface{}{
			"user":  newUser.ToResponse(),
			"token": token,
		},
	})
}

// Login 用户登录
func (h *AuthHandler) Login(c *gin.Context) {
	var req user.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Invalid request parameters",
		})
		return
	}

	authenticatedUser, err := h.userService.Authenticate(&req)
	if err != nil {
		c.JSON(http.StatusUnauthorized, Response{
			Code:    401,
			Message: "Invalid credentials",
		})
		return
	}

	// 生成 JWT Token
	token, err := h.authService.GenerateToken(authenticatedUser.ID, authenticatedUser.Username, authenticatedUser.Plan)
	if err != nil {
		logger.WithField("user_id", authenticatedUser.ID).Error("Failed to generate token")
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to generate token",
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Login successful",
		Data: map[string]interface{}{
			"user":  authenticatedUser.ToResponse(),
			"token": token,
		},
	})
}

// RefreshToken 刷新token
func (h *AuthHandler) RefreshToken(c *gin.Context) {
	authHeader := c.GetHeader("Authorization")
	if authHeader == "" {
		c.JSON(http.StatusUnauthorized, Response{
			Code:    401,
			Message: "Authorization header required",
		})
		return
	}

	tokenString := strings.TrimPrefix(authHeader, "Bearer ")
	newToken, err := h.authService.RefreshToken(tokenString)
	if err != nil {
		c.JSON(http.StatusUnauthorized, Response{
			Code:    401,
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Token refreshed successfully",
		Data: map[string]interface{}{
			"token": newToken,
		},
	})
}

// GetProfile 获取用户信息
func (h *AuthHandler) GetProfile(c *gin.Context) {
	userID := c.GetString("user_id")

	user, err := h.userService.GetUserByID(userID)
	if err != nil {
		c.JSON(http.StatusNotFound, Response{
			Code:    404,
			Message: "User not found",
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Success",
		Data:    user.ToResponse(),
	})
}

// UpdateProfile 更新用户信息
func (h *AuthHandler) UpdateProfile(c *gin.Context) {
	userID := c.GetString("user_id")

	var req user.UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Invalid request parameters",
		})
		return
	}

	updatedUser, err := h.userService.UpdateUser(userID, &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Profile updated successfully",
		Data:    updatedUser.ToResponse(),
	})
}

// GetUserStats 获取用户统计信息
func (h *AuthHandler) GetUserStats(c *gin.Context) {
	userID := c.GetString("user_id")

	stats, err := h.userService.GetUserStats(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to get user stats",
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Success",
		Data:    stats,
	})
}

// GetUsageHistory 获取使用历史
func (h *AuthHandler) GetUsageHistory(c *gin.Context) {
	userID := c.GetString("user_id")

	// 获取分页参数
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))

	if page < 1 {
		page = 1
	}
	if size < 1 || size > 100 {
		size = 20
	}

	records, total, err := h.userService.GetUsageHistory(userID, page, size)
	if err != nil {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to get usage history",
		})
		return
	}

	c.JSON(http.StatusOK, PageResponse{
		Code:    200,
		Message: "Success",
		Data:    records,
		Page:    page,
		Size:    size,
		Total:   total,
	})
}