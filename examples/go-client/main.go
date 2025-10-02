package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
)

// XiaohongshuClient 小红书客户端
type XiaohongshuClient struct {
	BaseURL string
	APIKey  string
	Client  *http.Client
}

// NewClient 创建新客户端
func NewClient(baseURL, apiKey string) *XiaohongshuClient {
	return &XiaohongshuClient{
		BaseURL: baseURL,
		APIKey:  apiKey,
		Client:  &http.Client{},
	}
}

// PublishRequest 发布请求
type PublishRequest struct {
	Title   string   `json:"title"`
	Content string   `json:"content"`
	Images  []string `json:"images,omitempty"`
	Tags    []string `json:"tags,omitempty"`
}

// SearchRequest 搜索请求
type SearchRequest struct {
	Keyword string `json:"keyword"`
	Limit   int    `json:"limit"`
}

// Response 通用响应
type Response struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// request 发送请求
func (c *XiaohongshuClient) request(method, path string, data interface{}) (*Response, error) {
	var body io.Reader
	if data != nil {
		jsonData, err := json.Marshal(data)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal data: %w", err)
		}
		body = bytes.NewBuffer(jsonData)
	}

	req, err := http.NewRequest(method, c.BaseURL+path, body)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("X-API-Key", c.APIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.Client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	var result Response
	if err := json.Unmarshal(responseBody, &result); err != nil {
		return nil, fmt.Errorf("failed to unmarshal response: %w", err)
	}

	if result.Code != 200 {
		return &result, fmt.Errorf("API error: %s", result.Message)
	}

	return &result, nil
}

// CheckLoginStatus 检查登录状态
func (c *XiaohongshuClient) CheckLoginStatus() (*Response, error) {
	return c.request("GET", "/api/v1/xiaohongshu/api/login-status", nil)
}

// PublishContent 发布内容
func (c *XiaohongshuClient) PublishContent(req *PublishRequest) (*Response, error) {
	return c.request("POST", "/api/v1/xiaohongshu/api/publish", req)
}

// SearchFeeds 搜索内容
func (c *XiaohongshuClient) SearchFeeds(req *SearchRequest) (*Response, error) {
	return c.request("POST", "/api/v1/xiaohongshu/api/search", req)
}

// GetRecommendedFeeds 获取推荐内容
func (c *XiaohongshuClient) GetRecommendedFeeds() (*Response, error) {
	return c.request("GET", "/api/v1/xiaohongshu/api/feeds/recommended", nil)
}

func main() {
	// 从环境变量获取配置
	baseURL := getEnv("XIAOHONGSHU_PROXY_URL", "http://localhost:8080")
	apiKey := getEnv("XIAOHONGSHU_API_KEY", "")

	if apiKey == "" {
		fmt.Println("❌ Error: XIAOHONGSHU_API_KEY environment variable is required")
		fmt.Println("Please set your API key: export XIAOHONGSHU_API_KEY=your-api-key")
		os.Exit(1)
	}

	// 创建客户端
	client := NewClient(baseURL, apiKey)

	fmt.Println("🤖 小红书代理服务客户端示例")
	fmt.Printf("🔗 服务地址: %s\n", baseURL)
	fmt.Printf("🔑 API Key: %s...\n", apiKey[:8])
	fmt.Println()

	// 1. 检查登录状态
	fmt.Println("1️⃣ 检查登录状态...")
	loginResp, err := client.CheckLoginStatus()
	if err != nil {
		fmt.Printf("❌ 检查登录状态失败: %v\n", err)
	} else {
		fmt.Printf("✅ 登录状态检查成功: %s\n", loginResp.Message)
	}
	fmt.Println()

	// 2. 搜索内容
	fmt.Println("2️⃣ 搜索美食相关内容...")
	searchResp, err := client.SearchFeeds(&SearchRequest{
		Keyword: "美食",
		Limit:   5,
	})
	if err != nil {
		fmt.Printf("❌ 搜索失败: %v\n", err)
	} else {
		fmt.Printf("✅ 搜索成功: %s\n", searchResp.Message)
		if searchResp.Data != nil {
			fmt.Printf("📊 搜索结果: %v\n", searchResp.Data)
		}
	}
	fmt.Println()

	// 3. 获取推荐内容
	fmt.Println("3️⃣ 获取推荐内容...")
	feedsResp, err := client.GetRecommendedFeeds()
	if err != nil {
		fmt.Printf("❌ 获取推荐内容失败: %v\n", err)
	} else {
		fmt.Printf("✅ 获取推荐内容成功: %s\n", feedsResp.Message)
	}
	fmt.Println()

	// 4. 发布内容
	fmt.Println("4️⃣ 发布测试内容...")
	publishResp, err := client.PublishContent(&PublishRequest{
		Title:   "AI自动化测试",
		Content: "这是通过小红书代理服务发布的测试内容。🤖\n\n今天天气真好，适合出门走走！",
		Images:  []string{}, // 实际使用时添加图片路径
		Tags:    []string{"AI", "自动化", "测试", "科技"},
	})
	if err != nil {
		fmt.Printf("❌ 发布内容失败: %v\n", err)
	} else {
		fmt.Printf("✅ 发布内容成功: %s\n", publishResp.Message)
		if publishResp.Data != nil {
			fmt.Printf("📊 发布结果: %v\n", publishResp.Data)
		}
	}
	fmt.Println()

	fmt.Println("🎉 示例运行完成！")
	fmt.Println()
	fmt.Println("💡 提示:")
	fmt.Println("   - 如果登录状态检查失败，请先确保小红书账号已登录")
	fmt.Println("   - 发布功能需要有效的小红书账号和登录状态")
	fmt.Println("   - 更多API文档请查看 README.md")
}

// getEnv 获取环境变量，如果不存在则返回默认值
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}