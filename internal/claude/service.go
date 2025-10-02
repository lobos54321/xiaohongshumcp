package claude

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"xiaohongshu-proxy/internal/config"
	"xiaohongshu-proxy/internal/mcp"
	"xiaohongshu-proxy/pkg/logger"
)

// ClaudeRequest Claude API 请求结构
type ClaudeRequest struct {
	Model     string    `json:"model"`
	Messages  []Message `json:"messages"`
	MaxTokens int       `json:"max_tokens"`
	Tools     []Tool    `json:"tools,omitempty"`
}

// Message 消息结构
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Tool 工具结构
type Tool struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	InputSchema interface{} `json:"input_schema"`
}

// ClaudeResponse Claude API 响应结构
type ClaudeResponse struct {
	Content []ContentBlock `json:"content"`
	Usage   Usage          `json:"usage"`
}

// ContentBlock 内容块
type ContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
	Name string `json:"name,omitempty"`
	Input interface{} `json:"input,omitempty"`
}

// Usage 使用量统计
type Usage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

// Service Claude 服务
type Service struct {
	apiKey     string
	baseURL    string
	timeout    time.Duration
	maxRetries int
	client     *http.Client
	mcpManager *mcp.Manager
}

// NewService 创建 Claude 服务
func NewService(cfg *config.ClaudeConfig, mcpManager *mcp.Manager) *Service {
	return &Service{
		apiKey:     cfg.APIKey,
		baseURL:    cfg.BaseURL,
		timeout:    cfg.Timeout,
		maxRetries: cfg.MaxRetries,
		client: &http.Client{
			Timeout: cfg.Timeout,
		},
		mcpManager: mcpManager,
	}
}

// ProcessRequest 处理用户请求
func (s *Service) ProcessRequest(ctx context.Context, userID, prompt string) (*ProcessResult, error) {
	startTime := time.Now()

	// 获取 MCP 连接
	mcpConn, err := s.mcpManager.GetConnection(userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get MCP connection: %w", err)
	}

	// 列出可用工具
	toolsResp, err := mcpConn.ListTools(ctx)
	if err != nil {
		logger.WithFields(map[string]interface{}{
			"user_id": userID,
			"error":   err.Error(),
		}).Warn("Failed to list MCP tools, proceeding without tools")
	}

	// 构造 Claude 请求
	request := ClaudeRequest{
		Model:     "claude-3-sonnet-20240229",
		MaxTokens: 1000,
		Messages: []Message{
			{
				Role:    "user",
				Content: prompt,
			},
		},
	}

	// 添加可用工具（如果获取成功）
	if toolsResp != nil && toolsResp.Result != nil {
		tools := s.extractToolsFromMCPResponse(toolsResp.Result)
		request.Tools = tools
	}

	// 调用 Claude API
	claudeResp, err := s.callClaudeAPI(ctx, &request)
	if err != nil {
		return nil, fmt.Errorf("failed to call Claude API: %w", err)
	}

	// 处理工具调用
	result := &ProcessResult{
		UserID:       userID,
		Prompt:       prompt,
		Response:     "",
		ToolCalls:    []ToolCallResult{},
		Usage:        claudeResp.Usage,
		Duration:     time.Since(startTime),
		Success:      true,
	}

	for _, content := range claudeResp.Content {
		switch content.Type {
		case "text":
			result.Response += content.Text
		case "tool_use":
			// 执行工具调用
			toolResult, err := s.executeToolCall(ctx, mcpConn, content.Name, content.Input)
			if err != nil {
				logger.WithFields(map[string]interface{}{
					"user_id":   userID,
					"tool_name": content.Name,
					"error":     err.Error(),
				}).Error("Tool call failed")

				toolResult = &ToolCallResult{
					ToolName: content.Name,
					Success:  false,
					Error:    err.Error(),
				}
			}
			result.ToolCalls = append(result.ToolCalls, *toolResult)
		}
	}

	return result, nil
}

// ProcessResult 处理结果
type ProcessResult struct {
	UserID    string           `json:"user_id"`
	Prompt    string           `json:"prompt"`
	Response  string           `json:"response"`
	ToolCalls []ToolCallResult `json:"tool_calls"`
	Usage     Usage            `json:"usage"`
	Duration  time.Duration    `json:"duration"`
	Success   bool             `json:"success"`
	Error     string           `json:"error,omitempty"`
}

// ToolCallResult 工具调用结果
type ToolCallResult struct {
	ToolName   string        `json:"tool_name"`
	Arguments  interface{}   `json:"arguments"`
	Result     interface{}   `json:"result"`
	Success    bool          `json:"success"`
	Error      string        `json:"error,omitempty"`
	Duration   time.Duration `json:"duration"`
}

// callClaudeAPI 调用 Claude API
func (s *Service) callClaudeAPI(ctx context.Context, request *ClaudeRequest) (*ClaudeResponse, error) {
	requestBody, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	url := fmt.Sprintf("%s/v1/messages", s.baseURL)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(requestBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", s.apiKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := s.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Claude API error: %s (status: %d)", string(responseBody), resp.StatusCode)
	}

	var claudeResp ClaudeResponse
	if err := json.Unmarshal(responseBody, &claudeResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return &claudeResp, nil
}

// executeToolCall 执行工具调用
func (s *Service) executeToolCall(ctx context.Context, mcpConn *mcp.Connection, toolName string, arguments interface{}) (*ToolCallResult, error) {
	startTime := time.Now()

	// 转换参数格式
	args, ok := arguments.(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("invalid tool arguments format")
	}

	// 调用 MCP 工具
	mcpResp, err := mcpConn.CallTool(ctx, toolName, args)
	if err != nil {
		return &ToolCallResult{
			ToolName:  toolName,
			Arguments: arguments,
			Success:   false,
			Error:     err.Error(),
			Duration:  time.Since(startTime),
		}, err
	}

	return &ToolCallResult{
		ToolName:  toolName,
		Arguments: arguments,
		Result:    mcpResp.Result,
		Success:   true,
		Duration:  time.Since(startTime),
	}, nil
}

// extractToolsFromMCPResponse 从 MCP 响应中提取工具信息
func (s *Service) extractToolsFromMCPResponse(result interface{}) []Tool {
	var tools []Tool

	resultMap, ok := result.(map[string]interface{})
	if !ok {
		return tools
	}

	toolsList, ok := resultMap["tools"].([]interface{})
	if !ok {
		return tools
	}

	for _, toolItem := range toolsList {
		toolMap, ok := toolItem.(map[string]interface{})
		if !ok {
			continue
		}

		tool := Tool{
			Name:        getString(toolMap, "name"),
			Description: getString(toolMap, "description"),
			InputSchema: toolMap["inputSchema"],
		}

		if tool.Name != "" {
			tools = append(tools, tool)
		}
	}

	return tools
}

// getString 安全获取字符串值
func getString(m map[string]interface{}, key string) string {
	if val, ok := m[key].(string); ok {
		return val
	}
	return ""
}