# Zeabur部署指南 - 小红书自动化系统

## 🚀 概述

本指南介绍如何将小红书自动化系统部署到Zeabur平台，包含完整的QR登录支持和Cookie持久化功能。

## 📋 部署前准备

### 1. 环境变量设置

在Zeabur项目中配置以下环境变量：

```bash
# 必需的环境变量
NODE_ENV=production
PORT=3000
HTTP_PORT=3000

# QR登录支持（关键配置）
ROD_BROWSER_BIN=/usr/bin/chromium
COOKIES_PATH=/app/data/cookies.json
CHROMIUM_NO_SANDBOX=true

# API密钥（如果需要）
ANTHROPIC_API_KEY=your_claude_api_key
GEMINI_API_KEY=your_gemini_api_key
```

### 2. 持久化存储配置

在Zeabur中配置持久化卷：
- **挂载点**: `/app/data`
- **大小**: 1GB（足够存储cookies和日志）

## 🐳 Docker配置

### 使用的Dockerfile

项目使用 `Dockerfile.zeabur` 进行部署，已包含：

- ✅ Chromium浏览器支持（QR登录必需）
- ✅ Cookie持久化目录
- ✅ 双服务架构（MCP Binary + HTTP Router）
- ✅ 健康检查机制
- ✅ 生产环境优化

### 关键特性

1. **QR登录支持**
   - 完整的Chromium环境
   - 自动QR码生成API
   - 登录状态检测

2. **Cookie持久化**
   - `/app/data/cookies.json` 存储登录状态
   - 容器重启后保持登录
   - 多用户隔离支持

3. **双服务架构**
   - MCP Binary服务（端口18070）
   - HTTP Router服务（端口3000）
   - 自动故障检测和重启

## 🌐 API端点

部署完成后，以下API端点将可用：

### QR登录相关
```bash
# 获取QR登录码
GET /api/xiaohongshu/login/qrcode?userId=your_user_id

# 检查登录状态
GET /api/xiaohongshu/login/status?userId=your_user_id
```

### 小红书MCP工具
```bash
# 9个xiaohongshu MCP工具通过以下端点访问：
GET /api/xiaohongshu/{tool_name}?userId=your_user_id

# 可用工具：
# - login/qrcode (QR登录)
# - login/status (登录状态)
# - search/notes (搜索笔记)
# - user/info (用户信息)
# - content/create (创建内容)
# - content/publish (发布内容)
# - analytics/data (数据分析)
# - interaction/like (点赞互动)
# - interaction/comment (评论互动)
```

### 自动化管理
```bash
# Claude代理服务
GET /agent/auto/start
GET /agent/auto/status
GET /agent/auto/plan

# 健康检查
GET /health
```

## 📱 QR登录流程

### 1. 获取QR码
```javascript
// 前端调用
fetch('/api/xiaohongshu/login/qrcode?userId=user123')
  .then(response => response.json())
  .then(data => {
    // 显示QR码图片
    document.getElementById('qr-img').src = data.qrcode_image;
  });
```

### 2. 监控登录状态
```javascript
// 轮询检查登录状态
const checkLogin = setInterval(() => {
  fetch('/api/xiaohongshu/login/status?userId=user123')
    .then(response => response.json())
    .then(data => {
      if (data.data.is_logged_in) {
        console.log('登录成功！');
        clearInterval(checkLogin);
        // 开始使用其他MCP工具
      }
    });
}, 2000); // 每2秒检查一次
```

## 🔧 部署步骤

### 1. 推送代码到GitHub

确保你的代码已推送到GitHub仓库，包含：
- `Dockerfile.zeabur`
- `.dockerignore`
- 所有源代码文件

### 2. 在Zeabur创建项目

1. 登录 [Zeabur控制台](https://zeabur.com)
2. 点击"Create Project"
3. 连接你的GitHub仓库
4. 选择项目目录

### 3. 配置构建设置

在Zeabur项目设置中：
1. **Dockerfile路径**: `Dockerfile.zeabur`
2. **端口设置**: `3000`
3. **内存限制**: 建议至少512MB（Chromium需要）

### 4. 设置环境变量

在Environment页面添加所有必需的环境变量（见上文列表）

### 5. 配置持久化存储

1. 进入Storage页面
2. 创建新的持久化卷
3. 挂载到 `/app/data`

### 6. 部署和测试

1. 点击"Deploy"开始部署
2. 等待构建完成（约5-10分钟）
3. 访问分配的域名测试健康检查
4. 测试QR登录API

## 🔍 故障排除

### 常见问题

1. **QR登录失败**
   ```bash
   # 检查Chromium是否正确安装
   curl https://your-domain.zeabur.app/health
   ```

2. **Cookie未持久化**
   ```bash
   # 确认持久化卷已正确挂载
   # 检查环境变量 COOKIES_PATH=/app/data/cookies.json
   ```

3. **服务启动失败**
   ```bash
   # 查看构建日志
   # 确认所有环境变量已设置
   # 检查内存限制是否足够
   ```

### 日志查看

在Zeabur控制台的"Logs"页面可以查看：
- 构建日志
- 运行时日志
- 错误信息

### 健康检查

访问以下端点验证部署状态：
```bash
# 基础健康检查
curl https://your-domain.zeabur.app/health

# MCP登录状态检查
curl https://your-domain.zeabur.app/api/xiaohongshu/login/status?userId=test
```

## 📈 生产环境优化

### 性能调优

1. **内存设置**: 建议1GB以上
2. **CPU设置**: 建议0.5 CPU以上
3. **并发连接**: 支持多用户同时使用

### 安全考虑

1. **环境变量**: 敏感信息使用Zeabur的加密环境变量
2. **域名配置**: 使用自定义域名和HTTPS
3. **访问控制**: 考虑添加API认证

### 监控和日志

1. **健康检查**: 内置健康检查端点
2. **错误日志**: 自动记录到Zeabur日志系统
3. **性能监控**: 使用Zeabur内置监控工具

## 🎯 成功标准

部署成功后，你应该能够：

✅ 访问主页和健康检查端点
✅ 调用QR登录API获取二维码
✅ 扫码登录后状态持久化
✅ 使用所有9个xiaohongshu MCP工具
✅ 自动化代理服务正常工作
✅ 容器重启后登录状态保持

---

**部署完成！** 🎉

你的小红书自动化系统现在已经在Zeabur上运行，具备完整的QR登录功能和生产级别的稳定性。