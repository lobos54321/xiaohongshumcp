# 集成指南：MCP Router 与现有系统

## 架构概览

```
用户请求
    ↓
Go 后端 (prome-platform)
    ↓ 通过 MCP Client
MCP Router
    ↓ 管理用户进程
xiaohongshu-mcp 进程池
    ↓
小红书网站
```

## 方案选择

### ✅ 推荐方案：通过 Go 调用 MCP Router

**优势**:
- 完整功能：支持 xiaohongshu-mcp 的全部9个工具
- 已验证：xiaohongshu-mcp 稳定运行1年+
- 快速实施：2天完成 vs 从零开发15-20天
- 持续更新：跟随上游更新

**实施步骤**:

### 1. 在 Go 后端添加 MCP Client

```go
// internal/mcp/client.go
package mcp

import (
    "encoding/json"
    "os/exec"
    "bufio"
    "context"
)

type MCPClient struct {
    cmd    *exec.Cmd
    stdin  io.WriteCloser
    stdout *bufio.Reader
    msgID  int
}

func NewMCPClient() (*MCPClient, error) {
    cmd := exec.Command("node", "/path/to/mcp-router/dist/index.js")

    stdin, err := cmd.StdinPipe()
    if err != nil {
        return nil, err
    }

    stdout, err := cmd.StdoutPipe()
    if err != nil {
        return nil, err
    }

    if err := cmd.Start(); err != nil {
        return nil, err
    }

    return &MCPClient{
        cmd:    cmd,
        stdin:  stdin,
        stdout: bufio.NewReader(stdout),
        msgID:  0,
    }, nil
}

func (c *MCPClient) CallTool(ctx context.Context, toolName string, args map[string]interface{}) (interface{}, error) {
    c.msgID++

    request := map[string]interface{}{
        "jsonrpc": "2.0",
        "method":  "tools/call",
        "id":      c.msgID,
        "params": map[string]interface{}{
            "name":      toolName,
            "arguments": args,
        },
    }

    // 发送请求
    data, _ := json.Marshal(request)
    c.stdin.Write(append(data, '\n'))

    // 读取响应
    line, err := c.stdout.ReadString('\n')
    if err != nil {
        return nil, err
    }

    var response struct {
        Result struct {
            Content []struct {
                Type string `json:"type"`
                Text string `json:"text"`
            } `json:"content"`
        } `json:"result"`
    }

    json.Unmarshal([]byte(line), &response)

    if len(response.Result.Content) > 0 {
        var result interface{}
        json.Unmarshal([]byte(response.Result.Content[0].Text), &result)
        return result, nil
    }

    return nil, fmt.Errorf("empty response")
}

func (c *MCPClient) Close() error {
    c.stdin.Close()
    return c.cmd.Wait()
}
```

### 2. 在 API Handler 中使用

```go
// internal/api/xiaohongshu.go
package api

import (
    "github.com/gin-gonic/gin"
    "your-project/internal/mcp"
    "your-project/internal/service"
)

type XiaohongshuHandler struct {
    mcpClient  *mcp.MCPClient
    authService *service.AuthService
}

func NewXiaohongshuHandler(mcpClient *mcp.MCPClient, authService *service.AuthService) *XiaohongshuHandler {
    return &XiaohongshuHandler{
        mcpClient:  mcpClient,
        authService: authService,
    }
}

// 检查登录状态
func (h *XiaohongshuHandler) CheckLogin(c *gin.Context) {
    // 获取当前用户
    user := h.authService.GetCurrentUser(c)

    // 调用 MCP 工具
    result, err := h.mcpClient.CallTool(c.Request.Context(), "xiaohongshu_check_login", map[string]interface{}{
        "userId": user.ID,
    })

    if err != nil {
        c.JSON(500, gin.H{"error": err.Error()})
        return
    }

    c.JSON(200, result)
}

// 获取登录二维码
func (h *XiaohongshuHandler) GetLoginQRCode(c *gin.Context) {
    user := h.authService.GetCurrentUser(c)

    result, err := h.mcpClient.CallTool(c.Request.Context(), "xiaohongshu_get_login_qrcode", map[string]interface{}{
        "userId": user.ID,
    })

    if err != nil {
        c.JSON(500, gin.H{"error": err.Error()})
        return
    }

    c.JSON(200, result)
}

// 发布内容
func (h *XiaohongshuHandler) PublishContent(c *gin.Context) {
    user := h.authService.GetCurrentUser(c)

    var req struct {
        Title   string   `json:"title"`
        Content string   `json:"content"`
        Images  []string `json:"images"`
        Tags    []string `json:"tags"`
    }

    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(400, gin.H{"error": err.Error()})
        return
    }

    result, err := h.mcpClient.CallTool(c.Request.Context(), "xiaohongshu_publish_content", map[string]interface{}{
        "userId":  user.ID,
        "title":   req.Title,
        "content": req.Content,
        "images":  req.Images,
        "tags":    req.Tags,
    })

    if err != nil {
        c.JSON(500, gin.H{"error": err.Error()})
        return
    }

    c.JSON(200, result)
}

// 发布视频
func (h *XiaohongshuHandler) PublishVideo(c *gin.Context) {
    user := h.authService.GetCurrentUser(c)

    var req struct {
        Title   string   `json:"title"`
        Content string   `json:"content"`
        Video   string   `json:"video"`
        Tags    []string `json:"tags"`
    }

    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(400, gin.H{"error": err.Error()})
        return
    }

    result, err := h.mcpClient.CallTool(c.Request.Context(), "xiaohongshu_publish_video", map[string]interface{}{
        "userId":  user.ID,
        "title":   req.Title,
        "content": req.Content,
        "video":   req.Video,
        "tags":    req.Tags,
    })

    if err != nil {
        c.JSON(500, gin.H{"error": err.Error()})
        return
    }

    c.JSON(200, result)
}

// 搜索内容
func (h *XiaohongshuHandler) SearchFeeds(c *gin.Context) {
    user := h.authService.GetCurrentUser(c)
    keyword := c.Query("keyword")

    result, err := h.mcpClient.CallTool(c.Request.Context(), "xiaohongshu_search_feeds", map[string]interface{}{
        "userId":  user.ID,
        "keyword": keyword,
    })

    if err != nil {
        c.JSON(500, gin.H{"error": err.Error()})
        return
    }

    c.JSON(200, result)
}
```

### 3. 注册路由

```go
// cmd/server/main.go
func main() {
    // 初始化 MCP Client
    mcpClient, err := mcp.NewMCPClient()
    if err != nil {
        log.Fatal("Failed to initialize MCP client:", err)
    }
    defer mcpClient.Close()

    // 初始化 Handler
    authService := service.NewAuthService(db)
    xhsHandler := api.NewXiaohongshuHandler(mcpClient, authService)

    // 注册路由
    router := gin.Default()

    xhs := router.Group("/api/xiaohongshu")
    xhs.Use(authMiddleware) // 使用现有的认证中间件
    {
        xhs.GET("/login/status", xhsHandler.CheckLogin)
        xhs.GET("/login/qrcode", xhsHandler.GetLoginQRCode)
        xhs.POST("/publish", xhsHandler.PublishContent)
        xhs.POST("/publish/video", xhsHandler.PublishVideo)
        xhs.GET("/feeds/search", xhsHandler.SearchFeeds)
        // ... 其他路由
    }

    router.Run(":8080")
}
```

## 前端集成

### React 示例

```typescript
// src/services/xiaohongshu.ts
export class XiaohongshuService {
  private baseURL = '/api/xiaohongshu';

  async checkLogin() {
    const response = await fetch(`${this.baseURL}/login/status`, {
      credentials: 'include', // 使用现有的 session/cookie
    });
    return response.json();
  }

  async getLoginQRCode() {
    const response = await fetch(`${this.baseURL}/login/qrcode`, {
      credentials: 'include',
    });
    return response.json();
  }

  async publishContent(data: {
    title: string;
    content: string;
    images: string[];
    tags: string[];
  }) {
    const response = await fetch(`${this.baseURL}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    return response.json();
  }

  async searchFeeds(keyword: string) {
    const response = await fetch(`${this.baseURL}/feeds/search?keyword=${encodeURIComponent(keyword)}`, {
      credentials: 'include',
    });
    return response.json();
  }
}

// 使用示例
const xhsService = new XiaohongshuService();

// 检查登录
const loginStatus = await xhsService.checkLogin();

// 发布内容
const result = await xhsService.publishContent({
  title: '我的标题',
  content: '文章内容',
  images: ['/uploads/image1.jpg'],
  tags: ['标签1', '标签2'],
});
```

## 部署配置

### 1. 环境变量

```env
# .env
MCP_ROUTER_PATH=/path/to/mcp-router/dist/index.js
MCP_BINARY_PATH=/path/to/xiaohongshu-mcp
COOKIE_DIR=/data/xiaohongshu/cookies
```

### 2. Docker Compose

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "8080:8080"
    environment:
      - MCP_ROUTER_PATH=/app/mcp-router/dist/index.js
    volumes:
      - ./cookies:/data/xiaohongshu/cookies
      - ./mcp-router:/app/mcp-router
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: prome
      POSTGRES_USER: root
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### 3. 健康检查

```go
// 在主程序中添加健康检查
func healthCheck(mcpClient *mcp.MCPClient) error {
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()

    _, err := mcpClient.CallTool(ctx, "xiaohongshu_check_login", map[string]interface{}{
        "userId": "health-check",
    })

    return err
}

// 定期检查
go func() {
    ticker := time.NewTicker(1 * time.Minute)
    for range ticker.C {
        if err := healthCheck(mcpClient); err != nil {
            log.Printf("MCP health check failed: %v", err)
            // 重启 MCP Client
            mcpClient.Close()
            mcpClient, _ = mcp.NewMCPClient()
        }
    }
}()
```

## 监控与日志

### 1. 添加日志

```go
func (h *XiaohongshuHandler) PublishContent(c *gin.Context) {
    user := h.authService.GetCurrentUser(c)

    log.Printf("[Xiaohongshu] User %s publishing content", user.ID)

    result, err := h.mcpClient.CallTool(c.Request.Context(), "xiaohongshu_publish_content", args)

    if err != nil {
        log.Printf("[Xiaohongshu] Publish failed for user %s: %v", user.ID, err)
        c.JSON(500, gin.H{"error": err.Error()})
        return
    }

    log.Printf("[Xiaohongshu] User %s published successfully", user.ID)
    c.JSON(200, result)
}
```

### 2. 性能监控

```go
func mcpMetricsMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        start := time.Now()

        c.Next()

        duration := time.Since(start)
        log.Printf("[Metrics] MCP call took %v", duration)

        // 发送到监控系统（如 Prometheus）
        mcpCallDuration.Observe(duration.Seconds())
    }
}
```

## 故障处理

### 1. 超时处理

```go
func (c *MCPClient) CallToolWithTimeout(toolName string, args map[string]interface{}, timeout time.Duration) (interface{}, error) {
    ctx, cancel := context.WithTimeout(context.Background(), timeout)
    defer cancel()

    resultChan := make(chan interface{}, 1)
    errChan := make(chan error, 1)

    go func() {
        result, err := c.CallTool(context.Background(), toolName, args)
        if err != nil {
            errChan <- err
        } else {
            resultChan <- result
        }
    }()

    select {
    case result := <-resultChan:
        return result, nil
    case err := <-errChan:
        return nil, err
    case <-ctx.Done():
        return nil, fmt.Errorf("timeout after %v", timeout)
    }
}
```

### 2. 重试机制

```go
func (c *MCPClient) CallToolWithRetry(toolName string, args map[string]interface{}, maxRetries int) (interface{}, error) {
    var lastErr error

    for i := 0; i < maxRetries; i++ {
        result, err := c.CallTool(context.Background(), toolName, args)
        if err == nil {
            return result, nil
        }

        lastErr = err
        log.Printf("Retry %d/%d for %s: %v", i+1, maxRetries, toolName, err)
        time.Sleep(time.Second * time.Duration(i+1))
    }

    return nil, fmt.Errorf("failed after %d retries: %v", maxRetries, lastErr)
}
```

## 下一步

1. ✅ 完成 MCP Router（已完成）
2. ⏳ 在 Go 后端集成 MCP Client
3. ⏳ 更新前端调用新的 API
4. ⏳ 端到端测试
5. ⏳ 生产环境部署
