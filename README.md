# 🎨 小红书智能自动化系统

基于 **Claude AI** 的小红书智能内容创作与发布平台

最后更新：2025-10-16

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## ✨ 核心特性

- 🤖 **Claude AI 驱动** - 自然语言交互，智能内容生成
- 🔧 **完整工具支持** - 9个xiaohongshu-mcp工具（登录、发布、搜索等）
- 👥 **多用户隔离** - Cookie独立，进程隔离，最多20并发
- 🚀 **自动化运营** - 创作、研究、批量发布全自动
- 💰 **成本极低** - 每月约¥36（每天10篇）

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/lobos54321/xiaohongshumcp.git
cd xiaohongshumcp
```

### 2. 安装依赖

```bash
npm run build
```

### 3. 配置环境变量

```bash
cd playwright-service/claude-agent-service
cp .env.example .env
# 编辑 .env，添加你的 ANTHROPIC_API_KEY
```

### 4. 启动服务

```bash
npm start
```

### 5. 访问前端

```bash
open frontend/index.html
```

## 📚 详细文档

- 📖 [快速开始指南](./QUICK_START.md)
- 📋 [完整项目总结](./FINAL_SUMMARY.md)
- 🔧 [MCP Router文档](./playwright-service/mcp-router/README.md)
- ⚙️ [Claude Agent设置](./playwright-service/claude-agent-service/SETUP.md)

## 🏗️ 架构

```
用户 → Claude Agent (4000) → MCP Router (3000) → xiaohongshu-mcp → 小红书
```

## 💡 使用示例

```bash
# 智能对话
curl -X POST http://localhost:4000/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"userId":"demo","prompt":"帮我写一篇关于咖啡的文章"}'

# 创作发布
curl -X POST http://localhost:4000/agent/xiaohongshu/create-post \
  -H "Content-Type: application/json" \
  -d '{"userId":"demo","topic":"北京咖啡店","style":"轻松愉快"}'
```

## 📄 许可证

MIT

---

🚀 **开始你的智能自动化之旅！**
# Force rebuild for logout API
