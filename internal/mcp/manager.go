package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	"xiaohongshu-proxy/internal/config"
	"xiaohongshu-proxy/pkg/logger"
)

// MCPRequest MCP 请求结构
type MCPRequest struct {
	JSONRPC string      `json:"jsonrpc"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params,omitempty"`
	ID      interface{} `json:"id"`
}

// MCPResponse MCP 响应结构
type MCPResponse struct {
	JSONRPC string      `json:"jsonrpc"`
	Result  interface{} `json:"result,omitempty"`
	Error   *MCPError   `json:"error,omitempty"`
	ID      interface{} `json:"id"`
}

// MCPError MCP 错误结构
type MCPError struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// Connection MCP 连接
type Connection struct {
	ID       string
	UserID   string
	BaseURL  string
	Status   string // active, inactive, error
	LastUsed time.Time
	mutex    sync.RWMutex
	client   *http.Client
}

// Pool MCP 连接池
type Pool struct {
	connections map[string]*Connection
	mutex       sync.RWMutex
	baseURL     string
	timeout     time.Duration
}

// Manager MCP 管理器
type Manager struct {
	pool   *Pool
	config *config.MCPConfig
}

// NewManager 创建 MCP 管理器
func NewManager(cfg *config.MCPConfig) *Manager {
	pool := &Pool{
		connections: make(map[string]*Connection),
		baseURL:     cfg.BaseURL,
		timeout:     cfg.Timeout,
	}

	return &Manager{
		pool:   pool,
		config: cfg,
	}
}

// GetConnection 获取或创建连接
func (m *Manager) GetConnection(userID string) (*Connection, error) {
	m.pool.mutex.Lock()
	defer m.pool.mutex.Unlock()

	connectionID := fmt.Sprintf("mcp_%s", userID)

	// 检查是否已存在连接
	if conn, exists := m.pool.connections[connectionID]; exists {
		conn.LastUsed = time.Now()
		return conn, nil
	}

	// 创建新连接
	conn := &Connection{
		ID:       connectionID,
		UserID:   userID,
		BaseURL:  m.pool.baseURL,
		Status:   "active",
		LastUsed: time.Now(),
		client: &http.Client{
			Timeout: m.pool.timeout,
		},
	}

	m.pool.connections[connectionID] = conn

	logger.WithFields(map[string]interface{}{
		"connection_id": connectionID,
		"user_id":       userID,
	}).Info("Created new MCP connection")

	return conn, nil
}

// CallTool 调用 MCP 工具
func (c *Connection) CallTool(ctx context.Context, toolName string, arguments map[string]interface{}) (*MCPResponse, error) {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	c.LastUsed = time.Now()

	// 构造 MCP 请求
	request := MCPRequest{
		JSONRPC: "2.0",
		Method:  "tools/call",
		Params: map[string]interface{}{
			"name":      toolName,
			"arguments": arguments,
		},
		ID: time.Now().UnixNano(),
	}

	// 序列化请求
	requestBody, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	// 创建 HTTP 请求
	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.BaseURL, bytes.NewBuffer(requestBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	// 发送请求
	resp, err := c.client.Do(httpReq)
	if err != nil {
		c.Status = "error"
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	// 读取响应
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// 解析响应
	var mcpResp MCPResponse
	if err := json.Unmarshal(responseBody, &mcpResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	// 检查 MCP 错误
	if mcpResp.Error != nil {
		return &mcpResp, fmt.Errorf("MCP error: %s (code: %d)", mcpResp.Error.Message, mcpResp.Error.Code)
	}

	c.Status = "active"

	logger.WithFields(map[string]interface{}{
		"connection_id": c.ID,
		"user_id":       c.UserID,
		"tool":          toolName,
	}).Debug("MCP tool called successfully")

	return &mcpResp, nil
}

// ListTools 列出可用工具
func (c *Connection) ListTools(ctx context.Context) (*MCPResponse, error) {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	c.LastUsed = time.Now()

	request := MCPRequest{
		JSONRPC: "2.0",
		Method:  "tools/list",
		ID:      time.Now().UnixNano(),
	}

	requestBody, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.BaseURL, bytes.NewBuffer(requestBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(httpReq)
	if err != nil {
		c.Status = "error"
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var mcpResp MCPResponse
	if err := json.Unmarshal(responseBody, &mcpResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	if mcpResp.Error != nil {
		return &mcpResp, fmt.Errorf("MCP error: %s (code: %d)", mcpResp.Error.Message, mcpResp.Error.Code)
	}

	c.Status = "active"
	return &mcpResp, nil
}

// Ping 检查连接状态
func (c *Connection) Ping(ctx context.Context) error {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	request := MCPRequest{
		JSONRPC: "2.0",
		Method:  "ping",
		ID:      time.Now().UnixNano(),
	}

	requestBody, err := json.Marshal(request)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.BaseURL, bytes.NewBuffer(requestBody))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(httpReq)
	if err != nil {
		c.Status = "error"
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		c.Status = "error"
		return fmt.Errorf("ping failed with status: %d", resp.StatusCode)
	}

	c.Status = "active"
	c.LastUsed = time.Now()
	return nil
}

// RemoveConnection 移除连接
func (m *Manager) RemoveConnection(userID string) {
	m.pool.mutex.Lock()
	defer m.pool.mutex.Unlock()

	connectionID := fmt.Sprintf("mcp_%s", userID)
	if conn, exists := m.pool.connections[connectionID]; exists {
		delete(m.pool.connections, connectionID)
		logger.WithFields(map[string]interface{}{
			"connection_id": connectionID,
			"user_id":       userID,
		}).Info("Removed MCP connection")
		_ = conn
	}
}

// CleanupIdleConnections 清理空闲连接
func (m *Manager) CleanupIdleConnections(maxIdleTime time.Duration) {
	m.pool.mutex.Lock()
	defer m.pool.mutex.Unlock()

	now := time.Now()
	var toRemove []string

	for id, conn := range m.pool.connections {
		if now.Sub(conn.LastUsed) > maxIdleTime {
			toRemove = append(toRemove, id)
		}
	}

	for _, id := range toRemove {
		delete(m.pool.connections, id)
		logger.WithField("connection_id", id).Info("Cleaned up idle MCP connection")
	}
}

// GetConnectionStats 获取连接统计
func (m *Manager) GetConnectionStats() map[string]interface{} {
	m.pool.mutex.RLock()
	defer m.pool.mutex.RUnlock()

	stats := map[string]interface{}{
		"total_connections": len(m.pool.connections),
		"active_connections": 0,
		"error_connections":  0,
	}

	for _, conn := range m.pool.connections {
		switch conn.Status {
		case "active":
			stats["active_connections"] = stats["active_connections"].(int) + 1
		case "error":
			stats["error_connections"] = stats["error_connections"].(int) + 1
		}
	}

	return stats
}

// StartCleanupRoutine 启动清理例程
func (m *Manager) StartCleanupRoutine(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.CleanupIdleConnections(time.Hour) // 清理1小时未使用的连接
		}
	}
}