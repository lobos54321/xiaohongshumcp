package api

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"xiaohongshu-proxy/internal/user"
	"xiaohongshu-proxy/internal/xiaohongshu"
	"xiaohongshu-proxy/pkg/logger"
)

// BrowserHandler 浏览器自动化处理器
type BrowserHandler struct {
	userService *user.Service
}

// NewBrowserHandler 创建浏览器处理器
func NewBrowserHandler(userService *user.Service) *BrowserHandler {
	return &BrowserHandler{
		userService: userService,
	}
}

// GetLoginQRCode 获取登录二维码
func (h *BrowserHandler) GetLoginQRCode(c *gin.Context) {
	userID := c.GetString("user_id")
	username := c.GetString("username")

	startTime := time.Now()

	// 创建浏览器服务
	browserService := xiaohongshu.NewBrowserService()
	defer browserService.Close()

	// 获取二维码
	qrCodeBase64, err := browserService.GetLoginQRCode()
	if err != nil {
		logger.WithFields(map[string]interface{}{
			"user_id":  userID,
			"username": username,
			"error":    err.Error(),
		}).Error("Failed to get login QR code")

		// 记录失败的使用记录
		_ = h.userService.RecordUsage(userID, "get_login_qrcode", false, err.Error(), 0, time.Since(startTime).Milliseconds())

		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "获取二维码失败",
			Data:    nil,
		})
		return
	}

	// 记录成功的使用记录
	_ = h.userService.RecordUsage(userID, "get_login_qrcode", true, "Success", 0, time.Since(startTime).Milliseconds())

	logger.WithFields(map[string]interface{}{
		"user_id":  userID,
		"username": username,
		"duration": time.Since(startTime).String(),
	}).Info("Login QR code generated successfully")

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "获取二维码成功",
		Data: map[string]interface{}{
			"qrcode": qrCodeBase64,
		},
	})
}

// CheckLoginStatus 检查登录状态
func (h *BrowserHandler) CheckLoginStatus(c *gin.Context) {
	userID := c.GetString("user_id")
	username := c.GetString("username")

	startTime := time.Now()

	// 创建浏览器服务
	browserService := xiaohongshu.NewBrowserService()
	defer browserService.Close()

	// 检查登录状态并获取 cookies
	cookies, err := browserService.CheckLoginStatus()
	if err != nil {
		logger.WithFields(map[string]interface{}{
			"user_id":  userID,
			"username": username,
			"error":    err.Error(),
		}).Error("Failed to check login status")

		// 记录失败的使用记录
		_ = h.userService.RecordUsage(userID, "check_login_status", false, err.Error(), 0, time.Since(startTime).Milliseconds())

		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "检查登录状态失败",
			Data:    nil,
		})
		return
	}

	// TODO: 将 cookies 存储到数据库中，关联到当前用户
	// 这里需要扩展 user.Service 来支持存储用户的小红书 cookies

	// 记录成功的使用记录
	_ = h.userService.RecordUsage(userID, "check_login_status", true, "Success", 0, time.Since(startTime).Milliseconds())

	logger.WithFields(map[string]interface{}{
		"user_id":  userID,
		"username": username,
		"duration": time.Since(startTime).String(),
	}).Info("Login status checked successfully")

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "登录成功",
		Data: map[string]interface{}{
			"cookies": cookies,
			"status":  "logged_in",
		},
	})
}

// PublishNoteRequest 发布笔记请求
type PublishNoteRequest struct {
	Title   string   `json:"title" binding:"required"`
	Content string   `json:"content" binding:"required"`
	Images  []string `json:"images"`
}

// PublishNote 发布笔记
func (h *BrowserHandler) PublishNote(c *gin.Context) {
	userID := c.GetString("user_id")
	username := c.GetString("username")

	var req PublishNoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Invalid request parameters",
		})
		return
	}

	startTime := time.Now()

	// TODO: 从数据库获取用户的小红书 cookies
	// 这里暂时使用空的 cookies map，后续需要实现从数据库读取
	cookies := make(map[string]string)

	// 创建浏览器服务
	browserService := xiaohongshu.NewBrowserService()
	defer browserService.Close()

	// 发布笔记
	err := browserService.PublishNote(cookies, req.Title, req.Content, req.Images)
	if err != nil {
		logger.WithFields(map[string]interface{}{
			"user_id":  userID,
			"username": username,
			"title":    req.Title,
			"error":    err.Error(),
		}).Error("Failed to publish note")

		// 记录失败的使用记录
		_ = h.userService.RecordUsage(userID, "publish_note", false, err.Error(), 0, time.Since(startTime).Milliseconds())

		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "发布笔记失败",
			Data:    nil,
		})
		return
	}

	// 记录成功的使用记录
	_ = h.userService.RecordUsage(userID, "publish_note", true, "Success", 0, time.Since(startTime).Milliseconds())

	logger.WithFields(map[string]interface{}{
		"user_id":  userID,
		"username": username,
		"title":    req.Title,
		"duration": time.Since(startTime).String(),
	}).Info("Note published successfully")

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "发布成功",
		Data: map[string]interface{}{
			"title":   req.Title,
			"content": req.Content,
		},
	})
}
