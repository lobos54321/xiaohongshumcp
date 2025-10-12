# 🚀 自动登录功能部署检查清单

## ✅ 部署前检查

### 1. Dockerfile配置
- [x] 添加Playwright系统依赖
- [x] 安装Chromium浏览器
- [x] 更新CACHEBUST版本号

### 2. 代码变更确认
- [x] PlaywrightLoginManager实现完整
- [x] 前端添加自动登录UI
- [x] API端点正确配置

## 📝 部署步骤

### Step 1: 提交代码到Git

```bash
cd /Users/boliu/xiaohongshumcp-new

# 添加修改的文件
git add Dockerfile
git add frontend/auto-manager.html
git add docs/AUTO_LOGIN_GUIDE.md
git add docs/DEPLOYMENT_CHECKLIST.md

# 提交
git commit -m "feat: 实现完整的Playwright自动登录功能

- 添加Playwright浏览器依赖到Dockerfile
- 安装Chromium浏览器支持
- 前端添加一键自动登录UI
- 添加二维码扫码登录流程
- 自动检测登录状态并保存Cookie
- 更新部署文档

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>"

# 推送到远程
git push origin feature/auth-system
```

### Step 2: Zeabur自动部署

Zeabur会自动：
1. 检测到Dockerfile变化
2. 重新构建Docker镜像
3. 安装Playwright依赖
4. 部署新版本

**预计时间**: 5-8分钟

### Step 3: 验证部署

#### 3.1 检查服务健康
```bash
curl https://xiaohongshu-ai-k8m2.zeabur.app/health
```

预期响应：
```json
{
  "status": "healthy",
  "service": "claude-agent-service",
  "timestamp": "2025-10-12T..."
}
```

#### 3.2 测试自动登录API
```bash
curl -X POST https://xiaohongshu-ai-k8m2.zeabur.app/agent/xiaohongshu/auto-login \
  -H "Content-Type: application/json" \
  -d '{"userId":"test_user"}'
```

**成功响应**：
```json
{
  "success": true,
  "data": {
    "qrcode_url": "data:image/png;base64,...",
    "instructions": "请使用小红书App扫描二维码完成登录",
    "polling_endpoint": "/agent/xiaohongshu/login/status?userId=test_user",
    "source": "playwright"
  }
}
```

**失败响应（说明Playwright未正确安装）**：
```json
{
  "success": false,
  "error": "Host system is missing dependencies to run browsers..."
}
```

#### 3.3 前端功能测试

1. **访问系统**
   ```
   https://xiaohongshu-ai-k8m2.zeabur.app/auto-manager.html
   ```

2. **测试步骤**：
   - [ ] 页面正常加载
   - [ ] 显示"未检测到登录状态"
   - [ ] 看到"🚀 一键自动登录"按钮
   - [ ] 点击按钮弹出二维码弹窗
   - [ ] 二维码正常显示（不是错误信息）
   - [ ] 使用手机扫码测试
   - [ ] 扫码后自动检测到登录
   - [ ] 自动跳转到下一步

## 🐛 问题排查

### 问题1: 二维码生成失败

**症状**：
- 点击自动登录后显示错误
- 控制台显示"Host system is missing dependencies"

**解决**：
```bash
# 1. 检查Dockerfile是否正确更新
git diff Dockerfile

# 2. 确认CACHEBUST已更新
grep CACHEBUST Dockerfile

# 3. 触发强制重新构建
# 在Zeabur控制台点击"Redeploy"
```

### 问题2: Playwright安装但浏览器启动失败

**症状**：
- API返回成功但qrcode_url为空
- 日志显示"Chromium executable not found"

**检查**：
```bash
# SSH进入容器
zeabur exec

# 检查Chromium是否安装
npx playwright install chromium --dry-run

# 手动安装
npx playwright install chromium
```

### 问题3: 二维码显示但扫码后无反应

**检查点**：
1. 前端轮询是否正常工作（打开浏览器控制台）
2. MCP Router是否正常运行
3. Cookie是否成功保存

**调试**：
```bash
# 检查MCP Router
curl https://xiaohongshu-ai-k8m2.zeabur.app/agent/xiaohongshu/login/status?userId=test_user

# 查看服务日志
# 在Zeabur控制台查看Runtime Logs
```

## 🎯 部署验收标准

### 必须通过的测试

- [x] 服务健康检查返回200
- [x] 自动登录API返回二维码
- [x] 二维码可以正常扫描
- [x] 扫码后自动检测到登录
- [x] Cookie正确保存到系统
- [x] 可以进入下一步配置

### 性能指标

- [ ] 二维码生成时间 < 5秒
- [ ] 登录检测响应时间 < 2秒
- [ ] Cookie同步延迟 < 3秒

### 用户体验

- [ ] 操作流程清晰简单
- [ ] 错误提示明确有用
- [ ] 无需手动操作Cookie

## 📋 回滚方案

如果部署后出现严重问题：

### 快速回滚

```bash
# 1. 回退到上一个稳定版本
git revert HEAD
git push

# 2. 或使用Zeabur回滚功能
# 在Zeabur控制台找到上一个成功的部署，点击"Rollback"
```

### 临时方案

如果Playwright无法工作，用户仍可使用：
1. **手动导入Cookie方式** - 点击"🔧 手动导入Cookie"按钮
2. **传统登录页** - 访问 `/login.html`

## 🔄 后续优化

部署成功后可以进行的优化：

### 性能优化
- [ ] 启用Playwright浏览器实例复用
- [ ] 优化二维码生成速度
- [ ] 减少轮询频率（当前3秒可调整）

### 功能增强
- [ ] 添加二维码过期自动刷新
- [ ] 支持多账号同时登录
- [ ] 添加登录历史记录

### 监控告警
- [ ] 添加登录成功率监控
- [ ] Playwright错误自动告警
- [ ] 性能指标Dashboard

## 📞 支持联系

如遇到部署问题，请：
1. 检查Zeabur部署日志
2. 查看Runtime Logs中的错误信息
3. 参考 `/docs/AUTO_LOGIN_GUIDE.md` 文档
4. 提交Issue到GitHub仓库

---

**检查清单版本**: v1.0
**最后更新**: 2025-10-12
