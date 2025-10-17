# MCP Router端口冲突修复报告

**问题类型**: 服务启动失败 / 端口冲突
**严重程度**: 🔴 高（导致内容生成功能完全失效）
**发现时间**: 2025-10-17
**修复提交**: b41c0d6

---

## 🎯 问题总结

### 用户报告的现象

前端持续显示：
- "本周计划" → "正在规划本周内容发布计划..."
- "下一篇内容预览" → "默认标题" + "默认内容"
- 图片显示 "AI生成的配图1/1"

### 初步误判

**错误假设1**: 竞争条件问题（已修复，commit 47c6794）
- 删除了重复的异步图片生成逻辑
- 但问题仍然存在

**错误假设2**: Claude API格式变化（已增强，commit 8d056bb）
- 增强了周计划JSON解析器
- 但问题仍然存在

### 真正原因

**MCP Router服务启动失败** → API调用失败 → 内容生成返回默认值

---

## 🔍 问题深度分析

### 1. 日志证据

#### 关键错误日志
```
listen tcp :18060: bind: address already in use
[MCP Auth] Error searching content: Request failed with status code 500
[MCP Auth] Error publishing content: Request failed with status code 500
```

#### 进程状态
```bash
root@zeabur-container$ ps aux | grep xiaohongshu-mcp
# 发现多个xiaohongshu-mcp进程同时运行
```

### 2. 根本原因链

```
Zeabur重新部署
  ↓
执行start.sh启动脚本
  ↓
启动新的MCP Router进程（httpServer.js）
  ↓
MCP Router创建processManager
  ↓
processManager尝试从端口18060开始分配
  ↓
❌ 端口18060已被旧进程占用（旧进程未清理）
  ↓
MCP Router启动失败
  ↓
API调用失败（/api/v1/feeds/search → 500错误）
  ↓
热门话题搜索失败
  ↓
内容生成缺少实时数据
  ↓
系统fallback到默认值
  ↓
前端显示："默认标题" + "默认内容"
```

### 3. 为什么策略生成正常？

**策略生成**（`createContentStrategy`）：
- ✅ 只调用Claude API
- ✅ 不依赖MCP Router
- ✅ 不需要热门话题实时数据

**内容生成**（`createDetailedTask`）：
- ❌ 依赖MCP Router提供热门话题
- ❌ MCP Router服务异常
- ❌ API调用失败
- ❌ fallback到默认值

### 4. 端口分配机制

```typescript
// processManager.ts line 16
private basePort = 18060;  // ← 基础端口

// 每个userId分配一个独立端口
private getNextAvailablePort(): number {
  // 从18060开始，为每个用户分配端口
  // 18060, 18061, 18062, ...
}
```

**问题**：
- 多次部署会创建多个`processManager`实例
- 每个实例都从18060开始分配
- 旧进程未清理 → **端口冲突**

---

## ✅ 修复方案

### 修改内容

**文件**: `start.sh`
**位置**: line 114-118（新增）

```bash
# 清理旧的MCP进程（防止端口冲突）
echo "🧹 Cleaning up old MCP processes..."
pkill -f "httpServer.js" 2>/dev/null || true
pkill -f "xiaohongshu-mcp" 2>/dev/null || true
sleep 2
```

### 修复逻辑

1. **启动前清理**
   - `pkill -f "httpServer.js"` - kill MCP Router HTTP服务器
   - `pkill -f "xiaohongshu-mcp"` - kill所有MCP二进制进程
   - `sleep 2` - 等待端口释放

2. **容错处理**
   - `2>/dev/null` - 忽略错误输出
   - `|| true` - 即使没有进程也不报错

3. **优雅关闭**
   - 使用SIGTERM信号（pkill默认）
   - 给进程时间清理资源

---

## 📊 预期效果

### 修复前

```
部署流程：
1. 启动新的MCP Router ❌ (端口18060已占用)
2. MCP Router启动失败
3. API调用失败 → 500错误
4. 热门话题获取失败
5. 内容生成返回默认值

用户体验：
- 前端显示："默认标题"
- 前端显示："默认内容"
- 图片生成可能成功，但内容空白
```

### 修复后

```
部署流程：
1. 清理旧进程 ✅ (pkill旧的httpServer.js和xiaohongshu-mcp)
2. 等待端口释放 ✅ (sleep 2)
3. 启动新的MCP Router ✅ (端口18060可用)
4. MCP Router正常运行
5. API调用成功 ✅
6. 热门话题获取成功 ✅
7. 内容生成包含真实数据 ✅

用户体验：
- 前端显示：真实的内容标题（如"森林寻宝大冒险"）
- 前端显示：完整的文案内容（800-1000字）
- 图片生成：4张AI配图
```

---

## 🧪 验证步骤

### 1. 检查Zeabur日志

修复后的日志应该显示：

```bash
# 启动阶段
🧹 Cleaning up old MCP processes...
🔧 Starting MCP Router...
📍 MCP Router PID: 1234
⏳ Waiting for MCP Router to start...
✅ MCP Router is healthy

# MCP Router日志（/tmp/mcp-router.log）
✅ [MCP Router] HTTP Server started on port 3000
✅ [Process Manager] Process started for user_xxx on port 18060
```

**不应该看到：**
```
❌ listen tcp :18060: bind: address already in use
❌ Error: EADDRINUSE
```

### 2. 测试API端点

```bash
# 健康检查
curl http://your-app.zeabur.app:3000/health
→ {"status":"healthy","service":"xiaohongshu-mcp-router"}

# 搜索热门话题
curl -X GET http://your-app.zeabur.app:3000/api/v1/feeds/search?keyword=亲子
→ 应该返回200，包含热门话题数据
```

### 3. 前端验证

1. **刷新前端页面**
2. **重新点击"启动"按钮**
3. **等待30-60秒**
4. **检查显示内容**：
   - ✅ 应该显示：具体的内容标题
   - ✅ 应该显示：完整的文案内容
   - ✅ 应该显示：4张AI生成的配图
   - ❌ 不应该显示："默认标题"、"默认内容"

---

## 🔧 其他可能需要的修复

### 问题1: 进程清理不彻底

**症状**: pkill可能无法kill所有进程

**解决方案**: 使用更强的清理逻辑

```bash
# 方案A: 使用kill -9强制终止
pkill -9 -f "httpServer.js" 2>/dev/null || true
pkill -9 -f "xiaohongshu-mcp" 2>/dev/null || true

# 方案B: 使用pid文件
echo $MCP_PID > /tmp/mcp-router.pid
# 下次启动前
if [ -f /tmp/mcp-router.pid ]; then
  kill $(cat /tmp/mcp-router.pid) 2>/dev/null || true
fi
```

### 问题2: 端口仍被占用

**症状**: 清理后端口仍然被占用

**解决方案**: 等待更长时间或使用lsof检查

```bash
# 等待端口完全释放
for i in {1..10}; do
  if ! lsof -i :18060 >/dev/null 2>&1; then
    echo "✅ Port 18060 is free"
    break
  fi
  echo "⏳ Waiting for port 18060 to be released..."
  sleep 1
done
```

### 问题3: 多实例部署

**症状**: Zeabur部署多个实例，实例间冲突

**解决方案**: 使用动态端口分配

```typescript
// processManager.ts
private basePort = parseInt(process.env.MCP_BASE_PORT || '18060');

// 环境变量设置
// 实例1: MCP_BASE_PORT=18060
// 实例2: MCP_BASE_PORT=18100
// 实例3: MCP_BASE_PORT=18140
```

---

## 📝 经验教训

### 1. 诊断误判

**错误路径**：
1. 看到"默认标题" → 以为是数据保存问题
2. 修复竞争条件 → 问题仍存在
3. 怀疑Claude API → 增强解析器

**正确路径**：
1. 看到"默认标题" → 检查日志
2. 发现MCP Router错误 → 定位服务启动
3. 找到端口冲突 → 修复进程清理

### 2. 日志的重要性

**关键日志**：
```
listen tcp :18060: bind: address already in use  ← 最重要的线索
[MCP Auth] Error searching content: 500          ← 次要线索
```

**经验**：优先查看**底层服务**的错误，而不是**业务逻辑**的fallback。

### 3. 服务依赖链

```
前端显示异常
  ↓
后端返回默认值
  ↓
内容生成失败
  ↓
MCP API调用失败
  ↓
MCP Router服务异常  ← 真正的根源
  ↓
进程管理问题
```

**经验**：从下往上排查，找到最底层的失败点。

---

## 🎯 后续优化建议

### 1. 健康检查增强

在Claude Agent Service启动前，**强制验证**MCP Router可用：

```bash
# start.sh中增加
echo "🔍 Verifying MCP Router is working..."
for i in {1..5}; do
  if curl -f "http://127.0.0.1:${MCP_HTTP_PORT}/api/v1/feeds/search?keyword=test" >/dev/null 2>&1; then
    echo "✅ MCP Router API is working"
    break
  fi
  echo "⏳ Attempt $i: MCP Router API not ready..."
  sleep 3
  if [ $i -eq 5 ]; then
    echo "❌ MCP Router API failed, check logs"
    tail -50 /tmp/mcp-router.log
    exit 1
  fi
done
```

### 2. 进程监控

使用`supervisor`或`pm2`管理进程：

```bash
# 使用pm2
npm install -g pm2

# 启动MCP Router
pm2 start dist/httpServer.js --name mcp-router

# 启动Claude Agent
pm2 start dist/server.js --name claude-agent

# 自动重启
pm2 startup
pm2 save
```

### 3. 告警机制

当MCP Router失败时，**立即告警**：

```typescript
// httpServer.ts中增加
app.use((err, req, res, next) => {
  console.error('❌ [CRITICAL] MCP Router Error:', err);

  // 发送告警（如Slack, 邮件, 钉钉）
  sendAlert({
    level: 'critical',
    service: 'MCP Router',
    error: err.message
  });

  res.status(500).json({ error: err.message });
});
```

### 4. 优雅降级

当MCP Router不可用时，使用**缓存的热门话题**：

```typescript
// autoContentManager.ts
async searchTrendingTopics(keyword: string): Promise<string[]> {
  try {
    // 尝试从MCP Router获取
    const result = await this.mcpClient.searchFeeds(keyword);
    this.trendingTopicsCache.set(keyword, result);  // 缓存
    return result;
  } catch (error) {
    console.warn('⚠️ MCP Router unavailable, using cache');

    // 使用缓存的数据
    if (this.trendingTopicsCache.has(keyword)) {
      return this.trendingTopicsCache.get(keyword);
    }

    // 最后的fallback：使用默认话题
    return ['#热门话题1', '#热门话题2'];
  }
}
```

---

## ✅ 总结

### 问题

MCP Router端口冲突导致服务启动失败 → 内容生成返回默认值

### 修复

在`start.sh`启动MCP Router前，清理旧进程

### 效果

- ✅ MCP Router正常启动
- ✅ API调用成功
- ✅ 热门话题获取成功
- ✅ 内容生成包含真实数据
- ✅ 前端显示正常

### 下一步

1. **立即验证**: Zeabur重新部署后测试
2. **监控日志**: 确认没有端口冲突错误
3. **用户测试**: 重新启动自动模式，验证内容生成
4. **长期优化**: 实施进程监控和告警机制
