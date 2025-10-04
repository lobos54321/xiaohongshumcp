package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
)

type PlaywrightHandler struct {
	playwrightURL string
}

func NewPlaywrightHandler() *PlaywrightHandler {
	url := os.Getenv("PLAYWRIGHT_SERVICE_URL")
	if url == "" {
		url = "http://localhost:3001"
	}

	return &PlaywrightHandler{
		playwrightURL: url,
	}
}

// PublishRequest 发布请求
type PublishRequest struct {
	Mode    string   `json:"mode" binding:"required"` // preview 或 publish
	Title   string   `json:"title" binding:"required"`
	Content string   `json:"content" binding:"required"`
	Images  []string `json:"images"`
	Tags    []string `json:"tags"`
}

// TaskStatusResponse 任务状态响应
type TaskStatusResponse struct {
	TaskID     string      `json:"taskId"`
	Status     string      `json:"status"` // waiting, active, completed, failed
	Progress   int         `json:"progress"`
	Position   int         `json:"position,omitempty"`
	Result     interface{} `json:"result,omitempty"`
	Error      string      `json:"error,omitempty"`
	Screenshot string      `json:"screenshot,omitempty"`
}

// SubmitPublishTask 提交发布任务
func (h *PlaywrightHandler) SubmitPublishTask(c *gin.Context) {
	userID := c.GetString("user_id")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未授权"})
		return
	}

	var req PublishRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 调用 Playwright 服务
	requestBody := map[string]interface{}{
		"userId":  userID,
		"mode":    req.Mode,
		"title":   req.Title,
		"content": req.Content,
		"images":  req.Images,
		"tags":    req.Tags,
	}

	jsonData, _ := json.Marshal(requestBody)

	resp, err := http.Post(
		fmt.Sprintf("%s/api/publish", h.playwrightURL),
		"application/json",
		bytes.NewBuffer(jsonData),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("调用 Playwright 服务失败: %v", err)})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var result map[string]interface{}
	json.Unmarshal(body, &result)

	if resp.StatusCode != http.StatusOK {
		c.JSON(resp.StatusCode, result)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 200,
		"data": result,
	})
}

// GetTaskStatus 查询任务状态
func (h *PlaywrightHandler) GetTaskStatus(c *gin.Context) {
	taskID := c.Param("taskId")

	resp, err := http.Get(fmt.Sprintf("%s/api/task/%s", h.playwrightURL, taskID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("查询失败: %v", err)})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var status TaskStatusResponse
	json.Unmarshal(body, &status)

	c.JSON(http.StatusOK, gin.H{
		"code": 200,
		"data": status,
	})
}

// GetLoginQRCode 获取登录二维码
func (h *PlaywrightHandler) GetLoginQRCode(c *gin.Context) {
	userID := c.GetString("user_id")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未授权"})
		return
	}

	requestBody := map[string]string{
		"userId": userID,
	}

	jsonData, _ := json.Marshal(requestBody)

	resp, err := http.Post(
		fmt.Sprintf("%s/api/login/qrcode", h.playwrightURL),
		"application/json",
		bytes.NewBuffer(jsonData),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("获取二维码失败: %v", err)})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var result map[string]interface{}
	json.Unmarshal(body, &result)

	c.JSON(http.StatusOK, gin.H{
		"code": 200,
		"data": result,
	})
}

// CheckLoginStatus 检查登录状态
func (h *PlaywrightHandler) CheckLoginStatus(c *gin.Context) {
	userID := c.GetString("user_id")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未授权"})
		return
	}

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(fmt.Sprintf("%s/api/login/status?userId=%s", h.playwrightURL, userID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("检查失败: %v", err)})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var result map[string]interface{}
	json.Unmarshal(body, &result)

	c.JSON(http.StatusOK, gin.H{
		"code": 200,
		"data": result,
	})
}
