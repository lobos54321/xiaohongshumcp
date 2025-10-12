# 🚀 自动登录系统使用指南

## 📋 概述

本系统提供**完全自动化的二维码登录**功能，用户无需手动提取Cookie，只需扫码即可完成登录。

## ✨ 功能特点

### 1. **一键自动登录** 🎯
- 自动生成二维码
- 实时检测登录状态
- 自动保存登录凭证
- 自动同步到后端服务

### 2. **多种登录方式**
- ✅ **方式1：一键自动登录**（推荐）- 完全自动化
- ✅ **方式2：手动导入Cookie** - 适用于特殊场景
- ✅ **方式3：传统登录页** - 兼容旧版本

## 🎬 使用流程

### 方式1：一键自动登录（推荐）

1. **访问系统首页**
   ```
   https://xiaohongshu-ai-k8m2.zeabur.app/auto-manager.html
   ```

2. **点击"🚀 一键自动登录"按钮**
   - 系统自动打开Playwright浏览器
   - 访问小红书登录页面
   - 自动生成并捕获二维码

3. **扫描二维码**
   - 使用小红书App扫描弹窗中的二维码
   - 在App中确认登录

4. **自动完成登录**
   - 系统自动检测登录成功
   - 自动保存Cookie到本地
   - 自动同步到MCP Router
   - 自动跳转到下一步配置

### 方式2：手动导入Cookie（备选）

如果自动登录失败，可以使用手动方式：

1. **点击"🔧 手动导入Cookie"按钮**

2. **在浏览器中登录**
   - 访问 https://www.xiaohongshu.com/login
   - 完成登录

3. **提取Cookie**
   - 按F12打开开发者工具
   - 进入Application → Cookies → https://www.xiaohongshu.com
   - 复制`web_session`和`a1`的值

4. **粘贴并提交**
   - 在弹出的表单中粘贴Cookie值
   - 点击"提交Cookie并验证"

## 🏗️ 技术架构

### 登录流程图

```
用户点击登录
    ↓
调用 /agent/xiaohongshu/auto-login
    ↓
尝试MCP Router获取QR码
    ↓ (失败)
Playwright后备方案
    ↓
启动headless浏览器 → 访问登录页 → 捕获QR码
    ↓
返回QR码给前端展示
    ↓
前端轮询检查登录状态 (每3秒)
    ↓
检测到登录成功
    ↓
保存Cookie → 同步到MCP Router → 完成
```

### 关键组件

#### 1. **PlaywrightLoginManager** (后端)
```typescript
// 位置: playwright-service/claude-agent-service/src/server.ts

class PlaywrightLoginManager {
  async startLogin(userId: string): Promise<{ qrImage: string }>
  async launchSession(userId: string): Promise<LoginSession>
  async captureQRCode(page: Page): Promise<string>
  private startWatchers(session: LoginSession): void
}
```

**功能**：
- 启动Chromium浏览器
- 访问小红书登录页
- 捕获二维码图片（base64）
- 监控登录状态变化
- 自动提取并保存Cookie

#### 2. **前端自动登录** (auto-manager.html)
```javascript
async function startAutoLogin() {
  // 1. 显示二维码弹窗
  // 2. 调用后端API生成QR码
  // 3. 开始轮询登录状态
  // 4. 检测到登录成功后自动刷新
}
```

#### 3. **Cookie自动同步**
```typescript
// AutoCookieImporter - 每15秒自动检测新Cookie
autoCookieImporter.startAutoImport(15000);

// 监控路径
WATCH_PATHS = [
  '/app/mcp-router/cookies/latest.json',
  '/tmp/xiaohongshu_cookies.json'
]
```

## 🔧 部署配置

### Dockerfile 要求

必须安装Playwright依赖：

```dockerfile
# 安装Playwright Chromium依赖
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libatspi2.0-0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libxcb1 \
    libxkbcommon0 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    fonts-liberation \
    fonts-noto-cjk

# 安装Playwright Chromium浏览器
RUN npx playwright install chromium
```

### 环境变量

```bash
# Claude Agent Service
PLAYWRIGHT_AUTO_INSTALL=true  # 自动安装Playwright（可选）
MCP_ROUTER_URL=http://localhost:3001

# MCP Router
HTTP_PORT=3001
COOKIE_DIR=./cookies
```

## 🧪 测试步骤

### 本地测试

1. **启动服务**
   ```bash
   cd playwright-service/claude-agent-service
   npm run dev
   ```

2. **测试自动登录API**
   ```bash
   curl -X POST http://localhost:8080/agent/xiaohongshu/auto-login \
     -H "Content-Type: application/json" \
     -d '{"userId":"test_user"}'
   ```

3. **检查响应**
   ```json
   {
     "success": true,
     "data": {
       "qrcode_url": "data:image/png;base64,...",
       "polling_endpoint": "/agent/xiaohongshu/login/status?userId=test_user"
     }
   }
   ```

### 生产环境测试

1. **访问系统**
   ```
   https://xiaohongshu-ai-k8m2.zeabur.app/auto-manager.html
   ```

2. **点击自动登录按钮**

3. **观察控制台日志**
   ```javascript
   console.log('自动登录响应:', result);
   console.log('轮询登录状态...');
   console.log('登录成功！');
   ```

## 🐛 常见问题

### Q1: 点击自动登录后没有反应？

**检查步骤**：
1. 打开浏览器控制台（F12）
2. 查看Network标签，检查API请求是否成功
3. 检查响应内容是否包含`qrcode_url`

**可能原因**：
- Playwright依赖未安装 → 重新部署Dockerfile
- 浏览器启动失败 → 检查服务器日志

### Q2: 二维码生成失败？

**错误示例**：
```json
{
  "success": false,
  "error": "Host system is missing dependencies to run browsers"
}
```

**解决方案**：
1. 确保Dockerfile包含Playwright依赖
2. 手动安装依赖：
   ```bash
   npx playwright install-deps
   npx playwright install chromium
   ```

### Q3: 扫码后没有自动检测到登录？

**检查**：
1. Cookie是否成功保存
2. MCP Router是否正常运行
3. 轮询间隔是否合适（当前3秒）

**调试**：
```bash
# 检查MCP Router状态
curl http://localhost:3001/health

# 检查登录状态
curl "http://localhost:8080/agent/xiaohongshu/login/status?userId=test_user"
```

### Q4: 手动导入Cookie后还是未登录？

**检查**：
1. 确保复制了`web_session`和`a1`两个关键Cookie
2. Cookie值没有包含空格或换行
3. Cookie格式正确：`name=value`

**正确格式**：
```
web_session=0400698d9fb534196e46b2b4df3a4ba975b8ff
a1=198ccc36a9ey50pve9z01aw6ngtt9inrpymtduwzm30000139274
```

## 📊 监控与日志

### 后端日志关键点

```bash
# 启动Playwright
[PlaywrightLogin] Chromium executable ready for fallback QR login

# 生成二维码
[XHS Auto Login] Playwright fallback QR generated

# 检测登录成功
[PlaywrightLogin] Login detected! Saving cookies...

# Cookie同步
[AutoCookieImporter] ✅ 自动导入成功
```

### 前端控制台日志

```javascript
🚀 启动自动登录...
自动登录响应: {success: true, data: {...}}
✨ 请使用小红书App扫描二维码登录
轮询登录状态...
✅ 登录成功！
```

## 🚀 部署更新

当修改Dockerfile后，需要重新部署：

### Zeabur部署

1. **提交代码**
   ```bash
   git add Dockerfile
   git commit -m "feat: add Playwright auto-login support"
   git push
   ```

2. **触发重新构建**
   - Zeabur会自动检测到Dockerfile变化
   - 自动重新构建镜像
   - 部署新版本

3. **验证部署**
   ```bash
   # 检查服务健康
   curl https://xiaohongshu-ai-k8m2.zeabur.app/health

   # 测试自动登录
   # 访问前端点击"一键自动登录"
   ```

## 💡 最佳实践

### 1. 用户体验优化

- ✅ 优先使用自动登录（最简单）
- ✅ 自动登录失败时才提示手动导入
- ✅ 提供清晰的错误提示和解决方案

### 2. 安全考虑

- ✅ Cookie仅存储在服务器端，加密保存
- ✅ 使用HTTPS传输二维码
- ✅ 定期清理过期Cookie
- ✅ 限制Cookie访问权限

### 3. 性能优化

- ✅ 复用Playwright浏览器实例
- ✅ 合理设置轮询间隔（3秒平衡体验和性能）
- ✅ 超时自动关闭浏览器会话（3分钟）
- ✅ 自动清理过期登录会话

## 🎯 下一步计划

- [ ] 添加登录失败自动重试机制
- [ ] 支持多账号同时登录
- [ ] 添加登录状态持久化
- [ ] 优化二维码刷新机制
- [ ] 添加登录统计和监控

---

**最后更新**: 2025-10-12
**维护者**: Claude AI Assistant
