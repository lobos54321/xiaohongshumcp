# 完全自动化发布测试指南

## 前提条件

由于新的持久化浏览器会话架构，您需要先通过二维码登录创建浏览器session，然后才能进行自动发布。

## 测试步骤

### 1. 启动后端服务

```bash
cd /Users/boliu/promeplatform&xiaohongshu/xiaohongshumcp/playwright-service/claude-agent-service
npm start
```

### 2. 在前端进行二维码登录

1. 打开浏览器访问：`http://localhost:5173`
2. 导航到"小红书自动化"页面
3. 点击 "扫码登录"
4. 用手机小红书APP扫描二维码
5. 确认登录成功（前端应显示已登录状态）

### 3. 触发自动发布测试

打开新终端运行测试脚本：

```bash
cd /Users/boliu/promeplatform&xiaohongshu/xiaohongshumcp/playwright-service/claude-agent-service
node test-publish.js
```

## 预期结果

✅ **成功场景**:
- 日志显示: `[PlaywrightPublisher] ✅ Using existing browser session for user_xxx`
- 浏览器自动打开发布页面
- 上传图片、填写标题和内容
- 点击发布按钮
- 返回发布成功消息

❌ **失败场景（预期）**:
- 如果没有先登录，会看到错误: `No active browser session for user xxx. Please login first via QR code.`
- 这是正确的行为！说明session验证工作正常

## 新架构工作原理

1. **QR登录** → 创建Playwright浏览器session → 注册到BrowserSessionManager
2. **发布内容** → 从BrowserSessionManager获取已存在的session → 直接使用（无需传输Cookie）
3. **退出登录** → 关闭浏览器session → 清理所有临时文件

## 会话超时

- 默认超时: 30分钟无活动自动清理
-每5分钟检查一次过期session
- 手动退出登录会立即关闭session

## 故障排除

### 问题: 提示"No active browser session"
**解决**: 先通过前端二维码登录

### 问题: 浏览器session已过期
**解决**: 重新登录即可,旧session会自动清理并创建新的

### 问题: 发布仍然跳转到登录页
**解决**: 这种情况不应该再出现!如果出现,说明需要检查session是否正确注册
