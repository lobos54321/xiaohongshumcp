# 🚀 部署指令 - 符号链接修复版本

## 📋 修复内容总结

本次部署修复了以下关键问题：

| 问题 | 状态 | 影响 |
|------|------|------|
| Timer Leak (550秒 socket hang up) | ✅ 已修复 | 长时间发布操作 |
| ProcessManager 超时不一致 | ✅ 已修复 | 5分钟超时 |
| Hashtags 验证缺失 | ✅ 已修复 | 空标签发布失败 |
| MCP Binary 版本过旧 | ✅ 已升级 | Tags 长度限制 |
| **Cookie 符号链接冲突** | ✅ **已修复** | **EEXIST 错误** |

---

## ⚠️ 重要：部署前必须清理旧数据

由于历史遗留的测试数据和失效符号链接，**必须先清理数据再部署**。

---

## 🧹 步骤1: 清理旧数据（Docker 容器内）

### 1.1 找到运行中的容器

```bash
docker ps
```

找到 xiaohongshu 相关的容器，记下容器 ID 或名称。

### 1.2 进入容器并清理

```bash
# 进入容器（替换 <container-id> 为实际容器 ID）
docker exec -it <container-id> sh

# 或者如果知道容器名称
docker exec -it xiaohongshu-automation sh
```

### 1.3 执行清理命令

```bash
# 1. 删除全局符号链接（防止失效符号链接）
rm -f /app/data/cookies.json

# 2. 查看现有用户 cookies 目录
ls -la /app/playwright-service/mcp-router/cookies/

# 3. 删除所有 cookies 数据（用户需要重新登录）
rm -rf /app/playwright-service/mcp-router/cookies/*

# 4. 验证清理结果
ls -la /app/playwright-service/mcp-router/cookies/
ls -la /app/data/

# 5. 退出容器
exit
```

**预期结果**:
- `/app/data/cookies.json` 不存在 ✅
- `/app/playwright-service/mcp-router/cookies/` 为空目录 ✅

---

## 🐳 步骤2: 重新构建 Docker 镜像

### 2.1 停止现有服务

```bash
cd /Users/boliu/xiaohongshumcp-new
docker-compose down
```

### 2.2 构建新镜像

```bash
# 构建镜像（包含最新修复）
docker build -t xiaohongshu-automation:latest .
```

**预计耗时**: 10-15 分钟

**关键变更**:
- ✅ MCP Binary 升级到 v2025.10.26（包含 tags 长度限制）
- ✅ ProcessManager 启动时自动清理旧符号链接
- ✅ ensureCookieSymlink 使用 lstatSync 检测失效符号链接

### 2.3 启动服务

```bash
docker-compose up -d
```

### 2.4 查看启动日志

```bash
docker-compose logs -f
```

**预期日志（启动时）**:
```
[ProcessManager] No existing symlink at /app/data/cookies.json, clean start
```
或
```
[ProcessManager] 🧹 Cleaning up old symlink at startup: /app/data/cookies.json -> /app/playwright-service/mcp-router/cookies/test/cookies.json
[ProcessManager] ✅ Cleaned up old symlink successfully
```

---

## ✅ 步骤3: 验证修复

### 3.1 用户登录

1. 打开前端页面
2. 使用真实账号登录
3. 扫描二维码完成登录

**预期日志**:
```
[ProcessManager] Starting MCP process for user user_<timestamp>_<random>
[ProcessManager] Service ready on port 18060
```

### 3.2 创建内容任务

1. 创建新的内容任务
2. 等待 Claude 生成内容和标签

**预期行为**:
- ✅ 标签数量 ≥ 5 个
- ✅ 标签不为空数组
- ✅ 如果标签缺失，显示清晰错误

### 3.3 批准发布（关键测试）

1. 点击"批准发布"按钮
2. 观察日志输出

**预期日志（发布时）**:
```
[ProcessManager] Calling POST http://localhost:18060/api/v1/publish for user user_xxx
[ProcessManager] No existing file at /app/data/cookies.json, will create new symlink
[ProcessManager] ✅ Created cookie symlink for user user_xxx
[ProcessManager]    /app/data/cookies.json -> /app/playwright-service/mcp-router/cookies/user_xxx/cookies.json
[ProcessManager] Timeout: 600000ms (600s)
...
[ProcessManager] ✅ Request completed in 185000ms (185.00s)
✅ [批准发布] 发布成功
```

**不应该看到的错误**:
- ❌ `EEXIST: file already exists, symlink`
- ❌ `socket hang up` (550秒)
- ❌ `timeout of 300000ms exceeded`
- ❌ `标签缺失`

### 3.4 多用户测试（可选但推荐）

1. 使用另一个账号登录（新浏览器或无痕模式）
2. 同时或顺序进行发布操作

**预期行为**:
- ✅ 每个用户使用各自的 cookies
- ✅ 符号链接动态切换，不冲突
- ✅ 所有用户发布成功

**预期日志**:
```
[ProcessManager] Found existing symlink: /app/data/cookies.json -> .../user_A/cookies.json
[ProcessManager] ✅ Removed old symlink
[ProcessManager] ✅ Created cookie symlink for user user_B
[ProcessManager]    /app/data/cookies.json -> .../user_B/cookies.json
```

---

## 🐛 故障排查

### 问题1: 仍然看到 EEXIST 错误

**可能原因**:
- 清理数据步骤未正确执行
- 新镜像未正确构建

**解决方案**:
```bash
# 1. 重新清理
docker exec -it <container-id> sh
rm -f /app/data/cookies.json
exit

# 2. 重启服务
docker-compose restart
```

### 问题2: 找不到 cookies 文件

**错误信息**: `failed to read cookies from tmp file`

**可能原因**:
- 用户未登录
- cookies 文件被意外删除

**解决方案**:
1. 用户重新登录
2. 检查日志确认进程正常启动

### 问题3: 仍然有 test 用户数据

**现象**: 日志中看到 `test/cookies.json`

**解决方案**:
```bash
# 手动删除 test 用户目录
docker exec -it <container-id> sh
rm -rf /app/playwright-service/mcp-router/cookies/test
exit
```

### 问题4: 启动时找不到符号链接

**日志**: `No existing symlink at /app/data/cookies.json, clean start`

**状态**: ✅ 正常！这是预期行为（全新启动）

---

## 📊 预期性能指标

| 操作 | 预期时间 | 超时时间 |
|------|---------|---------|
| 用户登录 | 5-10秒 | 2分钟 |
| 创建任务 | 10-30秒 | 2分钟 |
| 生成图片 | 20-60秒/张 | 2分钟/张 |
| **发布内容（4图）** | **3-5分钟** | **10分钟** |

---

## 🔍 日志关键词监控

**成功指标**:
```
✅ Created cookie symlink for user
✅ Request completed in
✅ [批准发布] 发布成功
```

**失败指标**（不应该出现）:
```
❌ EEXIST
❌ socket hang up
❌ timeout of 300000ms exceeded
❌ 标签缺失
❌ Failed to create cookie symlink
```

---

## 📝 回滚计划（如果出现问题）

### 紧急回滚步骤

```bash
# 1. 停止新版本
docker-compose down

# 2. 回滚到之前的镜像
docker tag xiaohongshu-automation:backup xiaohongshu-automation:latest

# 3. 启动旧版本
docker-compose up -d

# 4. 通知相关人员
```

### 保存备份镜像

```bash
# 部署前创建备份
docker tag xiaohongshu-automation:latest xiaohongshu-automation:backup-$(date +%Y%m%d)
```

---

## 📞 联系信息

**问题反馈**:
- 发现问题立即停止部署
- 记录完整错误日志
- 联系开发团队

**关键日志位置**:
```bash
docker-compose logs -f mcp-router
docker-compose logs -f claude-agent-service
```

---

## ✅ 部署检查清单

部署前：
- [ ] 阅读完整部署文档
- [ ] 确认所有修复已提交并推送
- [ ] 准备好回滚方案

清理数据：
- [ ] 删除 `/app/data/cookies.json`
- [ ] 清空 cookies 目录
- [ ] 验证清理结果

构建部署：
- [ ] 停止现有服务
- [ ] 构建新镜像
- [ ] 启动新服务
- [ ] 查看启动日志

功能测试：
- [ ] 用户登录成功
- [ ] 创建任务成功
- [ ] 标签生成正常（≥5个）
- [ ] 发布成功（3-5分钟）
- [ ] 无 EEXIST 错误
- [ ] 无 socket hang up
- [ ] 多用户测试通过（可选）

监控：
- [ ] 持续观察日志 30 分钟
- [ ] 确认无异常错误
- [ ] 记录性能指标

---

**部署版本**: v1.2.0-20251027-symlink-fix
**部署日期**: 2025-10-27
**修复内容**: Timer Leak + Timeout + Hashtags + MCP Binary + Symlink
**预计停机时间**: 5-10 分钟（重新构建和启动）
**风险等级**: 🟡 中等（需要清理数据，用户需重新登录）
