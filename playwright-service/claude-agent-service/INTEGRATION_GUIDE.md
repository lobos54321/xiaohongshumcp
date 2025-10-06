# xiaohongshu-mcp 集成使用指南

## 🎯 概述

本项目成功集成了 [xpzouying/xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp) 库，实现了完全自动化的小红书登录和操作流程。

## 🚀 快速开始

### 1. 环境准备

```bash
# 1. 配置环境变量
cp .env.xiaohongshu-mcp .env
# 编辑 .env 文件，添加你的 ANTHROPIC_API_KEY

# 2. 启动服务
./start.sh
```

### 2. 首次登录

```bash
# 方法1：通过API启动登录
curl -X POST http://localhost:4000/agent/xiaohongshu/start-login

# 方法2：通过AI对话
curl -X POST http://localhost:4000/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test_user",
    "prompt": "请帮我登录小红书账号"
  }'
```

### 3. 发布内容

```bash
# 智能发布帖子
curl -X POST http://localhost:4000/agent/chat \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test_user",
    "prompt": "请帮我发布一篇关于秋天美食的小红书帖子，风格温馨，字数200字左右"
  }'
```

## 🔧 技术架构

```
Claude Agent Service (Node.js/TypeScript)
    ↓ MCP Protocol
xiaohongshu-mcp Service (Go)
    ↓ Browser Automation (Rod)
Chrome/Chromium Browser
    ↓ Web Requests
小红书网站 (xiaohongshu.com)
```

## 🛠️ 核心功能

### 1. 自动登录系统

- **二维码自动生成**：系统自动打开浏览器显示登录二维码
- **Cookie自动保存**：登录成功后自动保存cookies到本地
- **状态自动检测**：自动检测登录状态，保持长期登录
- **断线重连**：支持自动重新登录

### 2. 智能内容创作

- **AI内容生成**：使用Claude AI生成高质量小红书内容
- **图片自动处理**：支持HTTP链接和本地图片路径
- **标签智能推荐**：自动生成相关话题标签
- **格式自动优化**：符合小红书发布规范

### 3. 完整API支持

| 功能 | API端点 | 描述 |
|------|---------|-----|
| 检查登录状态 | `GET /agent/xiaohongshu/login-status` | 获取当前登录状态 |
| 获取登录二维码 | `GET /agent/xiaohongshu/login-qrcode` | 获取扫码登录二维码 |
| 发布图文内容 | `POST /agent/chat` | 通过AI对话发布内容 |
| 搜索分析内容 | `POST /agent/xiaohongshu/research` | 搜索和分析小红书内容 |
| 批量发布 | `POST /agent/xiaohongshu/batch-publish` | 批量创作和发布帖子 |

## 📱 使用示例

### 示例1：检查登录状态

```javascript
// 请求
fetch('http://localhost:4000/agent/xiaohongshu/login-status')
  .then(res => res.json())
  .then(data => console.log(data));

// 响应
{
  "success": true,
  "data": {
    "content": [
      {
        "type": "text",
        "text": "登录状态检查成功: {is_logged_in: true, username: \"用户名\"}"
      }
    ]
  }
}
```

### 示例2：智能发布内容

```javascript
// 请求
fetch('http://localhost:4000/agent/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user123',
    prompt: '请帮我发布一篇关于咖啡文化的小红书帖子，包含图片和标签'
  })
});

// AI会自动：
// 1. 生成标题和内容
// 2. 创建或找到合适的图片
// 3. 添加相关标签
// 4. 发布到小红书
```

### 示例3：内容研究分析

```javascript
// 请求
fetch('http://localhost:4000/agent/xiaohongshu/research', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user123',
    keyword: '健身',
    task: '分析健身类内容的热门趋势和用户偏好'
  })
});

// AI会自动：
// 1. 搜索"健身"相关内容
// 2. 分析热门帖子特点
// 3. 提供详细的趋势报告
```

## ⚙️ 配置选项

### 环境变量

```bash
# 必需配置
ANTHROPIC_API_KEY=your_api_key_here    # Claude API密钥

# 可选配置
CLAUDE_MODEL=claude-3-5-sonnet-20241022  # Claude模型
MAX_TOKENS=4096                          # 最大token数
PORT=4000                                # HTTP服务端口
MCP_PORT=18060                           # MCP服务端口
HEADLESS=true                            # 无头浏览器模式
LOG_LEVEL=info                           # 日志级别
COOKIES_PATH=./data/cookies.json         # Cookie存储路径
```

### MCP服务配置

```typescript
const mcpServiceManager = new MCPServiceManager({
  port: 18060,                          // MCP服务端口
  headless: true,                       // 无头模式
  cookiesPath: './data/cookies.json',   // Cookie路径
  logLevel: 'info',                     // 日志级别
});
```

## 🔐 安全特性

1. **Cookie加密存储**：本地安全存储登录状态
2. **无敏感信息传输**：不传输用户密码等敏感信息
3. **安全的浏览器自动化**：使用官方浏览器引擎
4. **权限控制**：严格的API访问控制

## 🚨 注意事项

1. **单一登录限制**：小红书不允许同一账号在多个网页端同时登录
2. **使用频率控制**：建议控制发布频率，避免被平台限制
3. **内容合规**：确保发布内容符合小红书社区规范
4. **网络稳定性**：建议在稳定的网络环境下使用

## 🔧 故障排除

### 问题1：MCP服务启动失败

```bash
# 检查端口占用
lsof -i :18060

# 重启MCP服务
curl -X POST http://localhost:4000/mcp/restart
```

### 问题2：登录状态丢失

```bash
# 检查cookie文件
ls -la data/cookies.json

# 重新登录
curl -X POST http://localhost:4000/agent/xiaohongshu/start-login
```

### 问题3：二进制文件下载失败

```bash
# 手动下载
mkdir -p bin
cd bin
# 下载对应平台的二进制文件到bin目录
```

## 📊 性能监控

```bash
# 检查服务健康状态
curl http://localhost:4000/health

# 检查MCP服务状态
curl http://localhost:4000/mcp/status
```

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交改动
4. 推送到分支
5. 创建 Pull Request

## 📄 许可证

本项目基于原项目的开源许可证进行开发。

## 🙏 致谢

特别感谢 [xpzouying](https://github.com/xpzouying) 开发的优秀开源项目 [xiaohongshu-mcp](https://github.com/xpzouying/xiaohongshu-mcp)。