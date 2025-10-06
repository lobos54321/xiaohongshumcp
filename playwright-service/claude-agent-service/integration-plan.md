# xiaohongshu-mcp 库集成方案

## 集成概述

将 xpzouying/xiaohongshu-mcp 库直接集成到当前 Claude Agent Service 项目中，替换现有的 MCP Router 架构，实现完全自动化的小红书登录和操作流程。

## 集成步骤

### 1. 下载并集成 xiaohongshu-mcp 二进制文件

- 下载预编译的二进制文件（macOS arm64）
- 集成到项目的 `bin/` 目录
- 配置环境变量和启动脚本

### 2. 创建 Go MCP 服务管理器

- 创建 `MCPServiceManager` 类负责管理 Go MCP 服务
- 支持自动启动/停止服务
- 支持服务健康检查

### 3. 修改 ClaudeAgentHTTP

- 将 MCP Router URL 指向本地 Go 服务 (http://localhost:18060/mcp)
- 更新工具定义以匹配 xiaohongshu-mcp 的 MCP 接口
- 优化错误处理和重试机制

### 4. 实现自动化登录流程

- 集成 xiaohongshu-mcp 的登录工具
- 实现二维码展示和自动检测登录状态
- 自动保存和恢复 cookies

### 5. 更新前端界面

- 添加登录状态展示组件
- 支持二维码扫码登录
- 实时显示登录状态

## 技术实现细节

### Cookie 自动化保存机制

xiaohongshu-mcp 使用以下机制：
- 自动检测用户登录状态
- 登录成功后自动保存 cookies 到本地文件
- 下次启动时自动加载 cookies
- 支持环境变量配置 cookies 路径

### 登录流程优化

1. **自动检测**：启动时自动检查登录状态
2. **智能登录**：如果未登录，自动展示二维码
3. **后台监控**：后台监控登录状态变化
4. **Cookie 持久化**：登录成功后自动保存 cookies

### 服务集成架构

```
Claude Agent Service (Node.js)
    ↓ HTTP 调用
xiaohongshu-mcp Service (Go)
    ↓ Browser 控制
Chrome/Chromium (Rod)
    ↓ 网络请求
小红书网站 (xiaohongshu.com)
```

## 实施计划

1. ✅ 分析现有项目结构
2. ✅ 研究 xiaohongshu-mcp API 和机制
3. 🔄 创建集成代码
4. ⏳ 测试自动化登录流程
5. ⏳ 优化错误处理和用户体验

## 预期效果

- **完全自动化**：用户只需扫码一次，后续自动保持登录状态
- **稳定性提升**：使用成熟的 Go 浏览器自动化库
- **功能完整**：支持发布、搜索、评论等全部小红书功能
- **易于维护**：利用开源库的持续更新和社区支持