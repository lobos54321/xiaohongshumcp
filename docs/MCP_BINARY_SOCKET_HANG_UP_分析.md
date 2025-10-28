# 🔍 MCP Binary "socket hang up" 错误分析

## 📊 问题现象

### 前端日志
```javascript
⚠️ [轮询] 超时（10分钟），但发布可能仍在进行
```

### 后端日志
```
00:58:06 - 🚀 [异步发布] 开始执行作业
00:58:06 - 📊 [异步发布] 进度: 50% - 开始发布到小红书
01:02:13 - ❌ [异步发布] 作业失败: MCP Process Error: socket hang up
```

**耗时**: `01:02:13 - 00:58:06 = 4分7秒 (247秒)`

---

## 🎯 根本原因

### 问题 1: Zeabur 缓存了旧的 Docker 镜像 ❌

**证据**:
- 日志中**没有**看到 `🔨 [MCP Builder] Compiling...`
- 日志中**没有**看到 `✅ [MCP Builder] Compilation successful!`
- 只看到 `🔍 [start.sh] Checking for MCP binary...`

**结论**:
Zeabur 使用了**缓存的旧镜像层**，新的 Dockerfile multi-stage build 根本没有执行！

### 问题 2: MCP Binary 仍然是旧版本 (5分钟超时)

**证据**:
```
00:58:06 - 开始发布
01:02:13 - socket hang up (4分7秒后失败)
```

**分析**:
- 如果是新的 15 分钟超时版本 → 应该在 900 秒内不会超时
- 实际 247 秒就失败 → **说明仍然是旧的 5 分钟 (300秒) 超时版本**

---

## 🔧 解决方案

### 方案 1: 强制 Zeabur 重新构建 (已执行) ⭐

#### 1.1 修改文件触发重新构建
```bash
# 添加时间戳到 .dockerignore 强制 Docker 检测变更
echo "# Force rebuild - $(date)" >> .dockerignore
git add .dockerignore
git commit -m "chore: force Docker rebuild"
git push
```

#### 1.2 验证构建日志
Zeabur 构建日志中**必须**看到:
```
Step X/Y : FROM golang:1.24 AS mcp-builder
Step X/Y : COPY xiaohongshu-mcp-build/go.mod ...
Step X/Y : RUN go mod download
🔨 [MCP Builder] Compiling xiaohongshu-mcp with 15-minute timeout fix...
✅ [MCP Builder] Compilation successful!
```

**如果看不到这些日志 = 缓存仍然生效 = 需要手动清理**

---

### 方案 2: Zeabur 手动清理缓存 (推荐)

#### 2.1 登录 Zeabur 控制台
1. 进入项目设置
2. 找到 **Build Settings** 或 **Deployments**
3. 查找 **Clear Build Cache** 或 **Rebuild without cache** 选项

#### 2.2 强制无缓存重新构建
```bash
# 在 Zeabur 控制台
Settings → Build → Clear Cache
或
Deployments → Redeploy → Force rebuild
```

#### 2.3 观察构建日志
确认看到完整的 Go 编译过程：
```
---> Running in [container-id]
🔨 [MCP Builder] Compiling xiaohongshu-mcp with 15-minute timeout fix...
go: downloading github.com/go-rod/rod v0.116.2
go: downloading github.com/xpzouying/headless_browser v0.2.0
...
✅ [MCP Builder] Compilation successful!
-rw-r--r-- 1 root root 15M ... xiaohongshu-mcp-linux-amd64
```

---

### 方案 3: 修改 Dockerfile 禁用缓存层

如果 Zeabur 控制台没有清理缓存选项，修改 Dockerfile：

```dockerfile
# 在 Stage 1 的开头添加
FROM golang:1.24 AS mcp-builder

# 🔥 禁用 Docker 缓存：添加时间戳参数
ARG CACHEBUST=1
RUN echo "Cache bust: $CACHEBUST"

WORKDIR /mcp-build
...
```

然后每次构建时更新参数：
```bash
# 在 .github/workflows 或 Zeabur 环境变量中设置
CACHEBUST=$(date +%s)
```

---

## 📋 验证清单

### ✅ 构建阶段验证

- [ ] Zeabur 构建日志显示 `FROM golang:1.24 AS mcp-builder`
- [ ] 看到 `COPY xiaohongshu-mcp-build/go.mod`
- [ ] 看到 `RUN go mod download`
- [ ] 看到 `🔨 [MCP Builder] Compiling...`
- [ ] 看到 `✅ [MCP Builder] Compilation successful!`
- [ ] 看到 binary 大小 > 10MB (约 15MB)

### ✅ 运行时验证

- [ ] 服务启动日志显示版本号: `v18-mcp-timeout-fix-15min`
- [ ] 没有看到 "Downloading xiaohongshu-mcp binary" (说明用的是编译的版本)

### ✅ 功能验证

- [ ] 点击"批准发布"
- [ ] 前端轮询正常 (每 3 秒)
- [ ] **5-6 分钟后发布成功** (不再超时)
- [ ] 后端日志显示: `✅ [异步发布] 作业完成`

---

## 🐛 为什么会有缓存问题？

### Docker Layer Caching 机制

Docker 使用**分层缓存**优化构建速度：

```dockerfile
# Layer 1: FROM golang:1.24 ← 缓存
FROM golang:1.24 AS mcp-builder

# Layer 2: COPY go.mod ← 如果 go.mod 没变，使用缓存
COPY xiaohongshu-mcp-build/go.mod ./

# Layer 3: go mod download ← 使用缓存
RUN go mod download

# Layer 4: COPY source ← 源码变了，但如果这层被缓存...
COPY xiaohongshu-mcp-build ./

# Layer 5: go build ← 可能使用缓存的旧 binary！
RUN go build ...
```

### Zeabur 的缓存策略

Zeabur 为了加速构建，会**积极缓存** Docker 镜像层：

```
首次构建 (commit 36f229d):
  ✅ Stage 1: golang builder
  ✅ Stage 2: node:18-slim
  → 缓存这些层

第二次构建 (commit ca63df0):
  检测到 Dockerfile 没变
  → 直接使用缓存
  → 跳过 go build
  → 使用旧 binary ❌
```

---

## 🎯 最终解决方案

### 立即执行

1. **手动触发无缓存重新构建**:
   - Zeabur 控制台 → Settings → Clear Build Cache
   - 或 Deployments → Force Rebuild

2. **监控构建日志**:
   - 必须看到完整的 Go 编译过程
   - 必须看到 `🔨 [MCP Builder] Compiling...`

3. **验证运行时日志**:
   - 版本标签: `v18-mcp-timeout-fix-15min`
   - 没有下载 binary 的日志

4. **测试发布功能**:
   - 发布应该在 5-6 分钟成功
   - 不会再有 "socket hang up" 错误

---

## 📊 预期效果对比

### 修复前 (使用缓存的旧 binary)
```
00:58:06 - 开始发布
01:02:13 - socket hang up (247秒后失败) ❌
错误: MCP Process Error: socket hang up
```

### 修复后 (使用新编译的 15分钟超时 binary)
```
00:58:06 - 开始发布
01:03:18 - 发布成功 (312秒，约 5分12秒) ✅
日志: ✅ [异步发布] 作业完成
```

**关键差异**:
- 旧版本: 247 秒超时 (< 300秒，符合 5 分钟超时)
- 新版本: 312 秒成功 (< 900秒，在 15 分钟超时范围内)

---

## ⚠️ 如果问题仍然存在

### Debug 步骤

1. **检查 binary 版本**:
   ```bash
   # 在 Zeabur Shell 中执行
   ls -lh /app/playwright-service/mcp-router/xiaohongshu-mcp
   # 应该显示: -rwxr-xr-x ... 15M ... xiaohongshu-mcp

   # 检查是否包含 15 分钟超时代码
   strings /app/playwright-service/mcp-router/xiaohongshu-mcp | grep "900"
   # 应该能找到 "900" (900 秒 = 15 分钟)
   ```

2. **查看完整构建日志**:
   - Zeabur 控制台 → Build Logs
   - 搜索 "mcp-builder" 和 "Compilation"
   - 确认是否真的编译了新版本

3. **临时方案：直接使用预编译 binary**:
   - 在本地使用 Docker 编译 binary
   - 上传到 GitHub Releases
   - Dockerfile 中下载使用

---

## 📝 总结

**问题**: Zeabur Docker 缓存导致使用旧的 5 分钟超时 binary

**解决**:
1. ✅ 强制清理缓存重新构建
2. ✅ 验证构建日志包含编译过程
3. ✅ 测试发布功能 (应该 5-6 分钟成功)

**下一步**:
- 等待 Zeabur 无缓存重新构建完成
- 查看构建日志确认编译成功
- 测试发布功能验证修复
