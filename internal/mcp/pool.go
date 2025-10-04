package mcp

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

// MCPContainer MCP 容器实例
type MCPContainer struct {
	UserID      string
	ContainerID string
	Port        int
	LastUsed    time.Time
	client      *client.Client
}

// MCPPool MCP 容器池
type MCPPool struct {
	containers    map[string]*MCPContainer
	maxContainers int
	dockerClient  *client.Client
	mutex         sync.RWMutex
	basePort      int
	usedPorts     map[int]bool
}

// NewMCPPool 创建容器池
func NewMCPPool(maxContainers int, basePort int) (*MCPPool, error) {
	dockerClient, err := client.NewClientWithOpts(client.FromEnv)
	if err != nil {
		return nil, fmt.Errorf("failed to create docker client: %w", err)
	}

	pool := &MCPPool{
		containers:    make(map[string]*MCPContainer),
		maxContainers: maxContainers,
		dockerClient:  dockerClient,
		basePort:      basePort,
		usedPorts:     make(map[int]bool),
	}

	// 启动自动清理
	go pool.autoCleanup()

	return pool, nil
}

// GetOrCreate 获取或创建用户的 MCP 容器
func (p *MCPPool) GetOrCreate(userID string) (*MCPContainer, error) {
	p.mutex.Lock()
	defer p.mutex.Unlock()

	// 如果容器已存在，更新使用时间并返回
	if container, exists := p.containers[userID]; exists {
		container.LastUsed = time.Now()
		return container, nil
	}

	// 检查容器数量限制
	if len(p.containers) >= p.maxContainers {
		// 移除最久未使用的容器
		p.removeOldest()
	}

	// 创建新容器
	container, err := p.createContainer(userID)
	if err != nil {
		return nil, err
	}

	p.containers[userID] = container
	return container, nil
}

// createContainer 创建 Docker 容器
func (p *MCPPool) createContainer(userID string) (*MCPContainer, error) {
	ctx := context.Background()

	// 分配端口
	port := p.allocatePort()

	// 创建容器配置
	config := &container.Config{
		Image: "xpzouying/xiaohongshu-mcp:latest",
		ExposedPorts: map[string]struct{}{
			"18060/tcp": {},
		},
	}

	hostConfig := &container.HostConfig{
		PortBindings: map[string][]container.PortBinding{
			"18060/tcp": {{HostPort: fmt.Sprintf("%d", port)}},
		},
		Resources: container.Resources{
			Memory:   256 * 1024 * 1024, // 256MB
			NanoCPUs: 100000000,          // 0.1 CPU
		},
		RestartPolicy: container.RestartPolicy{
			Name: "on-failure",
		},
		Binds: []string{
			fmt.Sprintf("./data/mcp/%s:/data", userID),
		},
	}

	// 创建容器
	resp, err := p.dockerClient.ContainerCreate(
		ctx,
		config,
		hostConfig,
		nil,
		nil,
		fmt.Sprintf("xiaohongshu-mcp-%s", userID),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create container: %w", err)
	}

	// 启动容器
	if err := p.dockerClient.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		return nil, fmt.Errorf("failed to start container: %w", err)
	}

	// 等待容器启动（最多30秒）
	time.Sleep(5 * time.Second)

	return &MCPContainer{
		UserID:      userID,
		ContainerID: resp.ID,
		Port:        port,
		LastUsed:    time.Now(),
		client:      p.dockerClient,
	}, nil
}

// allocatePort 分配可用端口
func (p *MCPPool) allocatePort() int {
	for port := p.basePort; port < p.basePort+1000; port++ {
		if !p.usedPorts[port] {
			p.usedPorts[port] = true
			return port
		}
	}
	return p.basePort
}

// removeOldest 移除最久未使用的容器
func (p *MCPPool) removeOldest() {
	var oldestUserID string
	var oldestTime time.Time

	for userID, container := range p.containers {
		if oldestUserID == "" || container.LastUsed.Before(oldestTime) {
			oldestUserID = userID
			oldestTime = container.LastUsed
		}
	}

	if oldestUserID != "" {
		p.removeContainer(oldestUserID)
	}
}

// removeContainer 移除容器
func (p *MCPPool) removeContainer(userID string) {
	if container, exists := p.containers[userID]; exists {
		ctx := context.Background()

		// 停止容器
		timeout := 10
		p.dockerClient.ContainerStop(ctx, container.ContainerID, container.StopOptions{
			Timeout: &timeout,
		})

		// 删除容器
		p.dockerClient.ContainerRemove(ctx, container.ContainerID, container.RemoveOptions{
			Force: true,
		})

		// 释放端口
		delete(p.usedPorts, container.Port)

		// 从池中移除
		delete(p.containers, userID)
	}
}

// autoCleanup 自动清理超时的容器
func (p *MCPPool) autoCleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		p.mutex.Lock()

		var toRemove []string
		for userID, container := range p.containers {
			// 10分钟未使用则清理
			if time.Since(container.LastUsed) > 10*time.Minute {
				toRemove = append(toRemove, userID)
			}
		}

		for _, userID := range toRemove {
			p.removeContainer(userID)
		}

		p.mutex.Unlock()
	}
}

// GetEndpoint 获取容器的 HTTP 端点
func (c *MCPContainer) GetEndpoint() string {
	return fmt.Sprintf("http://localhost:%d/mcp", c.Port)
}

// CallTool 调用 MCP 工具
func (c *MCPContainer) CallTool(tool string, args map[string]interface{}) (interface{}, error) {
	// TODO: 实现 HTTP MCP 调用
	return nil, nil
}
