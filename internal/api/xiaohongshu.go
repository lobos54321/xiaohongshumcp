package api

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"xiaohongshu-proxy/internal/claude"
	"xiaohongshu-proxy/internal/user"
	"xiaohongshu-proxy/pkg/logger"
)

// XiaohongshuHandler 小红书相关处理器
type XiaohongshuHandler struct {
	claudeService *claude.Service
	userService   *user.Service
}

// NewXiaohongshuHandler 创建小红书处理器
func NewXiaohongshuHandler(claudeService *claude.Service, userService *user.Service) *XiaohongshuHandler {
	return &XiaohongshuHandler{
		claudeService: claudeService,
		userService:   userService,
	}
}

// ProcessRequest 处理请求结构
type ProcessRequest struct {
	Prompt string `json:"prompt" binding:"required"`
}

// ProcessXiaohongshuRequest 处理小红书请求
func (h *XiaohongshuHandler) ProcessXiaohongshuRequest(c *gin.Context) {
	userID := c.GetString("user_id")
	username := c.GetString("username")

	var req ProcessRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Invalid request parameters",
		})
		return
	}

	startTime := time.Now()

	// 调用 Claude 服务处理请求
	result, err := h.claudeService.ProcessRequest(c.Request.Context(), userID, req.Prompt)
	if err != nil {
		logger.WithFields(map[string]interface{}{
			"user_id":  userID,
			"username": username,
			"prompt":   req.Prompt,
			"error":    err.Error(),
		}).Error("Failed to process xiaohongshu request")

		// 记录失败的使用记录
		_ = h.userService.RecordUsage(userID, "process_request", false, err.Error(), 0, time.Since(startTime).Milliseconds())

		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to process request",
		})
		return
	}

	// 计算费用（简单示例：根据token使用量计算）
	cost := float64(result.Usage.InputTokens)*0.001 + float64(result.Usage.OutputTokens)*0.002

	// 记录成功的使用记录
	_ = h.userService.RecordUsage(userID, "process_request", true, "Success", cost, result.Duration.Milliseconds())

	logger.WithFields(map[string]interface{}{
		"user_id":       userID,
		"username":      username,
		"input_tokens":  result.Usage.InputTokens,
		"output_tokens": result.Usage.OutputTokens,
		"cost":          cost,
		"duration":      result.Duration.String(),
		"tool_calls":    len(result.ToolCalls),
	}).Info("Xiaohongshu request processed successfully")

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Request processed successfully",
		Data:    result,
	})
}

// CheckLoginStatus 检查登录状态
func (h *XiaohongshuHandler) CheckLoginStatus(c *gin.Context) {
	userID := c.GetString("user_id")

	startTime := time.Now()

	// 调用 Claude 服务检查登录状态
	result, err := h.claudeService.ProcessRequest(c.Request.Context(), userID, "请检查小红书登录状态")
	if err != nil {
		_ = h.userService.RecordUsage(userID, "check_login_status", false, err.Error(), 0, time.Since(startTime).Milliseconds())

		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to check login status",
		})
		return
	}

	cost := float64(result.Usage.InputTokens)*0.001 + float64(result.Usage.OutputTokens)*0.002
	_ = h.userService.RecordUsage(userID, "check_login_status", true, "Success", cost, result.Duration.Milliseconds())

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Login status checked successfully",
		Data:    result,
	})
}

// PublishContent 发布内容
func (h *XiaohongshuHandler) PublishContent(c *gin.Context) {
	userID := c.GetString("user_id")

	var req struct {
		Title   string   `json:"title" binding:"required"`
		Content string   `json:"content" binding:"required"`
		Images  []string `json:"images"`
		Tags    []string `json:"tags"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Invalid request parameters",
		})
		return
	}

	startTime := time.Now()

	// 构造发布内容的prompt
	prompt := fmt.Sprintf("请帮我发布小红书内容：标题：%s，内容：%s", req.Title, req.Content)
	if len(req.Images) > 0 {
		prompt += fmt.Sprintf("，图片：%v", req.Images)
	}
	if len(req.Tags) > 0 {
		prompt += fmt.Sprintf("，标签：%v", req.Tags)
	}

	result, err := h.claudeService.ProcessRequest(c.Request.Context(), userID, prompt)
	if err != nil {
		_ = h.userService.RecordUsage(userID, "publish_content", false, err.Error(), 0, time.Since(startTime).Milliseconds())

		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to publish content",
		})
		return
	}

	cost := float64(result.Usage.InputTokens)*0.001 + float64(result.Usage.OutputTokens)*0.002
	_ = h.userService.RecordUsage(userID, "publish_content", true, "Success", cost, result.Duration.Milliseconds())

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Content published successfully",
		Data:    result,
	})
}

// SearchFeeds 搜索内容
func (h *XiaohongshuHandler) SearchFeeds(c *gin.Context) {
	userID := c.GetString("user_id")

	var req struct {
		Keyword string `json:"keyword" binding:"required"`
		Limit   int    `json:"limit"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Invalid request parameters",
		})
		return
	}

	if req.Limit <= 0 {
		req.Limit = 10
	}

	startTime := time.Now()

	prompt := fmt.Sprintf("请搜索小红书内容，关键词：%s，数量限制：%d", req.Keyword, req.Limit)
	result, err := h.claudeService.ProcessRequest(c.Request.Context(), userID, prompt)
	if err != nil {
		_ = h.userService.RecordUsage(userID, "search_feeds", false, err.Error(), 0, time.Since(startTime).Milliseconds())

		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to search feeds",
		})
		return
	}

	cost := float64(result.Usage.InputTokens)*0.001 + float64(result.Usage.OutputTokens)*0.002
	_ = h.userService.RecordUsage(userID, "search_feeds", true, "Success", cost, result.Duration.Milliseconds())

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Search completed successfully",
		Data:    result,
	})
}

// GetRecommendedFeeds 获取推荐内容
func (h *XiaohongshuHandler) GetRecommendedFeeds(c *gin.Context) {
	userID := c.GetString("user_id")

	startTime := time.Now()

	result, err := h.claudeService.ProcessRequest(c.Request.Context(), userID, "请获取小红书推荐内容列表")
	if err != nil {
		_ = h.userService.RecordUsage(userID, "get_recommended_feeds", false, err.Error(), 0, time.Since(startTime).Milliseconds())

		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to get recommended feeds",
		})
		return
	}

	cost := float64(result.Usage.InputTokens)*0.001 + float64(result.Usage.OutputTokens)*0.002
	_ = h.userService.RecordUsage(userID, "get_recommended_feeds", true, "Success", cost, result.Duration.Milliseconds())

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Recommended feeds retrieved successfully",
		Data:    result,
	})
}