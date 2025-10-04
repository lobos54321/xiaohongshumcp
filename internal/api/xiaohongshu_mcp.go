package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"xiaohongshu-proxy/pkg/logger"
)

// XiaohongshuMCPHandler 小红书MCP处理器
type XiaohongshuMCPHandler struct {
	mcpRouterURL string
	client       *http.Client
}

// NewXiaohongshuMCPHandler 创建小红书MCP处理器
func NewXiaohongshuMCPHandler(mcpRouterURL string) *XiaohongshuMCPHandler {
	return &XiaohongshuMCPHandler{
		mcpRouterURL: mcpRouterURL,
		client: &http.Client{
			Timeout: 2 * time.Minute,
		},
	}
}

// MCPCallRequest MCP调用请求
type MCPCallRequest struct {
	UserID    string                 `json:"userId"`
	ToolName  string                 `json:"toolName"`
	Arguments map[string]interface{} `json:"arguments,omitempty"`
}

// MCPCallResponse MCP调用响应
type MCPCallResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// callMCPTool 调用MCP工具（通用方法）
func (h *XiaohongshuMCPHandler) callMCPTool(c *gin.Context, toolName string, args map[string]interface{}) {
	userID := c.GetString("user_id")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, Response{
			Code:    401,
			Message: "User not authenticated",
		})
		return
	}

	// 构造请求
	reqBody := MCPCallRequest{
		UserID:    userID,
		ToolName:  toolName,
		Arguments: args,
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		logger.WithError(err).Error("Failed to marshal MCP request")
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Internal server error",
		})
		return
	}

	// 调用MCP Router
	url := fmt.Sprintf("%s/mcp/call", h.mcpRouterURL)
	req, err := http.NewRequestWithContext(c.Request.Context(), "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		logger.WithError(err).Error("Failed to create MCP request")
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Internal server error",
		})
		return
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := h.client.Do(req)
	if err != nil {
		logger.WithError(err).Error("Failed to call MCP Router")
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Failed to call MCP service",
		})
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		logger.WithError(err).Error("Failed to read MCP response")
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Internal server error",
		})
		return
	}

	var mcpResp MCPCallResponse
	if err := json.Unmarshal(body, &mcpResp); err != nil {
		logger.WithError(err).Error("Failed to unmarshal MCP response")
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: "Internal server error",
		})
		return
	}

	if !mcpResp.Success {
		c.JSON(http.StatusInternalServerError, Response{
			Code:    500,
			Message: mcpResp.Error,
		})
		return
	}

	c.JSON(http.StatusOK, Response{
		Code:    200,
		Message: "Success",
		Data:    mcpResp.Data,
	})
}

// CheckLoginStatus 检查登录状态
func (h *XiaohongshuMCPHandler) CheckLoginStatus(c *gin.Context) {
	h.callMCPTool(c, "xiaohongshu_check_login", nil)
}

// GetLoginQRCode 获取登录二维码
func (h *XiaohongshuMCPHandler) GetLoginQRCode(c *gin.Context) {
	h.callMCPTool(c, "xiaohongshu_get_login_qrcode", nil)
}

// PublishContentRequest 发布内容请求
type PublishContentRequest struct {
	Title   string   `json:"title" binding:"required"`
	Content string   `json:"content" binding:"required"`
	Images  []string `json:"images"`
	Tags    []string `json:"tags"`
}

// PublishContent 发布图文内容
func (h *XiaohongshuMCPHandler) PublishContent(c *gin.Context) {
	var req PublishContentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Invalid request parameters",
		})
		return
	}

	args := map[string]interface{}{
		"title":   req.Title,
		"content": req.Content,
	}

	if len(req.Images) > 0 {
		args["images"] = req.Images
	}

	if len(req.Tags) > 0 {
		args["tags"] = req.Tags
	}

	h.callMCPTool(c, "xiaohongshu_publish_content", args)
}

// PublishVideoRequest 发布视频请求
type PublishVideoRequest struct {
	Title   string   `json:"title" binding:"required"`
	Content string   `json:"content" binding:"required"`
	Video   string   `json:"video" binding:"required"`
	Tags    []string `json:"tags"`
}

// PublishVideo 发布视频
func (h *XiaohongshuMCPHandler) PublishVideo(c *gin.Context) {
	var req PublishVideoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Invalid request parameters",
		})
		return
	}

	args := map[string]interface{}{
		"title":   req.Title,
		"content": req.Content,
		"video":   req.Video,
	}

	if len(req.Tags) > 0 {
		args["tags"] = req.Tags
	}

	h.callMCPTool(c, "xiaohongshu_publish_video", args)
}

// ListFeeds 获取推荐内容列表
func (h *XiaohongshuMCPHandler) ListFeeds(c *gin.Context) {
	h.callMCPTool(c, "xiaohongshu_list_feeds", nil)
}

// SearchFeeds 搜索内容
func (h *iaohongshuMCPHandler) SearchFeeds(c *gin.Context) {
	keyword := c.Query("keyword")
	if keyword == "" {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "keyword is required",
		})
		return
	}

	args := map[string]interface{}{
		"keyword": keyword,
	}

	h.callMCPTool(c, "xiaohongshu_search_feeds", args)
}

// GetFeedDetailRequest 获取帖子详情请求
type GetFeedDetailRequest struct {
	FeedID    string `json:"feed_id" binding:"required"`
	XSecToken string `json:"xsec_token" binding:"required"`
}

// GetFeedDetail 获取帖子详情
func (h *XiaohongshuMCPHandler) GetFeedDetail(c *gin.Context) {
	var req GetFeedDetailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Invalid request parameters",
		})
		return
	}

	args := map[string]interface{}{
		"feed_id":    req.FeedID,
		"xsec_token": req.XSecToken,
	}

	h.callMCPTool(c, "xiaohongshu_get_feed_detail", args)
}

// PostCommentRequest 发表评论请求
type PostCommentRequest struct {
	FeedID    string `json:"feed_id" binding:"required"`
	XSecToken string `json:"xsec_token" binding:"required"`
	Content   string `json:"content" binding:"required"`
}

// PostComment 发表评论
func (h *XiaohongshuMCPHandler) PostComment(c *gin.Context) {
	var req PostCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Invalid request parameters",
		})
		return
	}

	args := map[string]interface{}{
		"feed_id":    req.FeedID,
		"xsec_token": req.XSecToken,
		"content":    req.Content,
	}

	h.callMCPTool(c, "xiaohongshu_post_comment", args)
}

// GetUserProfileRequest 获取用户资料请求
type GetUserProfileRequest struct {
	TargetUserID string `json:"target_user_id" binding:"required"`
	XSecToken    string `json:"xsec_token" binding:"required"`
}

// GetUserProfile 获取用户资料
func (h *XiaohongshuMCPHandler) GetUserProfile(c *gin.Context) {
	var req GetUserProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, Response{
			Code:    400,
			Message: "Invalid request parameters",
		})
		return
	}

	args := map[string]interface{}{
		"target_user_id": req.TargetUserID,
		"xsec_token":     req.XSecToken,
	}

	h.callMCPTool(c, "xiaohongshu_user_profile", args)
}
