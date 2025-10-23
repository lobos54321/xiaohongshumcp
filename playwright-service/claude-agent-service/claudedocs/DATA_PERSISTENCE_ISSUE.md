# 数据持久化问题完整分析

## 🎯 问题总结

**现象**: 容器重启后，所有自动生成的内容计划数据丢失，`/app/data/auto-content` 目录为空。

**根本原因**: `/app/data` 目录未配置为 Docker 持久卷，导致容器重启时数据丢失。

## 📊 证据链分析

### 证据1: 数据确实被保存了

**日志证据**（runtime-log-20251021-223625.log.gz）:
```
2025-10-21 22:26:52,💾 数据已保存: /app/data/auto-content/user_1760873748455_hsrofz6nl.json
2025-10-21 22:26:52,✅ [任务生成] 任务 1 生成成功并已保存 (总进度: 1/1)
```

**结论**: `saveData()` 方法正常工作，数据成功写入文件系统。

### 证据2: 数据在容器重启后丢失

**容器时间线分析**:
```
2025-10-21 22:26:52 - 数据保存成功（旧容器运行中）
2025-10-22 03:43:05 - 新容器开始启动（容器被替换）
2025-10-22 03:43:01 - loadPersistedData() 尝试加载数据
2025-10-22 03:43:01 - contentPlans 总数: 0（找不到任何文件）
```

**用户确认**:
```
/app/data/auto-content 目录是完全空的，没有任何 .json 文件
```

**结论**: 旧容器中保存的数据，在新容器启动时完全丢失。

### 证据3: 缺少持久卷配置

**Dockerfile 分析**:
```dockerfile
# Line 160: 只创建目录，未声明 VOLUME
RUN mkdir -p /app/data /app/playwright-service/mcp-router/cookies

# ❌ 缺少: VOLUME ["/app/data"]
```

**结论**: `/app/data` 只是容器内部文件系统的普通目录，未标记为持久卷。

## 🔧 问题机制详解

### Docker 容器文件系统机制

```
容器生命周期：
┌──────────────────────────────────────┐
│ 容器启动                              │
│  ↓                                   │
│ 创建临时文件系统层（writable layer）   │
│  ↓                                   │
│ 应用运行，数据写入 /app/data          │
│  ↓                                   │
│ 容器停止/删除                         │
│  ↓                                   │
│ ❌ 临时文件系统层被删除                │
│  ↓                                   │
│ 数据丢失                              │
└──────────────────────────────────────┘

持久卷机制：
┌──────────────────────────────────────┐
│ 容器启动                              │
│  ↓                                   │
│ 挂载外部卷到 /app/data               │
│  ↓                                   │
│ 应用运行，数据写入外部卷               │
│  ↓                                   │
│ 容器停止/删除                         │
│  ↓                                   │
│ ✅ 外部卷保留                         │
│  ↓                                   │
│ 新容器启动，挂载同一外部卷             │
│  ↓                                   │
│ ✅ 数据仍然存在                       │
└──────────────────────────────────────┘
```

### 为什么 Zeabur 容器会被替换？

可能的触发场景：
1. **代码更新推送** - Git push 触发自动部署
2. **平台维护** - Zeabur 节点维护或迁移
3. **资源重新调度** - 容器被调度到不同的节点
4. **健康检查失败** - 容器被自动重启
5. **手动重启** - 用户手动触发重启

## ✅ 解决方案

### 方案1: Dockerfile VOLUME 声明（已实施）

**修改**: Dockerfile line 162-164
```dockerfile
# 🔥 CRITICAL: Declare /app/data as persistent volume
# This ensures data (auto-content plans, cookies) persists across container restarts
VOLUME ["/app/data"]
```

**效果**:
- Docker 会自动为 `/app/data` 创建匿名卷
- 容器删除时，卷默认保留
- 新容器可以挂载已有的卷

**局限**:
- 需要手动管理卷的生命周期
- 不同容器实例可能使用不同的卷
- 在云平台（如 Zeabur）上可能需要额外配置

### 方案2: Zeabur 持久卷配置（推荐）

Zeabur 支持持久卷功能，需要在项目配置中启用。

#### 配置步骤

**方法A: Zeabur Dashboard 配置**
1. 打开 Zeabur 项目设置
2. 进入 "Volumes" 或"存储"选项卡
3. 添加持久卷：
   - 挂载路径: `/app/data`
   - 卷大小: 1GB（根据需要调整）
4. 保存并重新部署

**方法B: zeabur.json 配置**（如果 Zeabur 支持配置文件）
```json
{
  "volumes": [
    {
      "name": "app-data",
      "mount": "/app/data",
      "size": "1Gi"
    }
  ]
}
```

**方法C: Docker Compose 本地测试**
```yaml
version: '3.8'
services:
  xiaohongshu-app:
    build: .
    volumes:
      - app-data:/app/data
    ports:
      - "8080:8080"

volumes:
  app-data:
    driver: local
```

### 方案3: 外部存储（高级）

如果 Zeabur 持久卷不可用，可以使用外部存储：

#### 选项1: Supabase Storage
```typescript
// 将数据保存到 Supabase Storage 而非本地文件系统
private async saveData(userId: string): Promise<void> {
  const data = {
    userProfile: this.userProfiles.get(userId),
    contentPlan: this.contentPlans.get(userId),
    savedAt: new Date().toISOString()
  };

  await supabaseClient
    .storage
    .from('auto-content-plans')
    .upload(`${userId}.json`, JSON.stringify(data, null, 2), {
      upsert: true
    });
}
```

#### 选项2: PostgreSQL JSON 字段
```typescript
// 将数据保存到 PostgreSQL 表的 JSONB 字段
await supabaseClient
  .from('content_plans')
  .upsert({
    user_id: userId,
    plan_data: contentPlan,
    updated_at: new Date().toISOString()
  });
```

#### 选项3: Redis
```typescript
// 使用 Redis 存储（需要额外的 Redis 实例）
await redisClient.set(
  `content-plan:${userId}`,
  JSON.stringify(data),
  { EX: 7 * 24 * 60 * 60 } // 7天过期
);
```

## 🔍 验证方案

### 验证1: VOLUME 声明生效

**本地 Docker 测试**:
```bash
# 构建镜像
docker build -t xiaohongshu-app .

# 运行容器
docker run -d --name test-app xiaohongshu-app

# 检查卷
docker inspect test-app | grep -A 10 "Mounts"

# 预期输出：应该看到 /app/data 被挂载到一个匿名卷
```

### 验证2: 数据持久性

**测试步骤**:
```bash
# 1. 启动容器并生成数据
docker run -d --name app1 xiaohongshu-app
# ... 使用应用生成内容计划 ...

# 2. 检查数据文件
docker exec app1 ls -lh /app/data/auto-content/
# 应该看到 .json 文件

# 3. 停止并删除容器
docker stop app1
docker rm app1

# 4. 重新启动容器，挂载同一个卷
# 首先找到卷名
VOLUME_NAME=$(docker volume ls | grep auto-content | awk '{print $2}')

# 5. 启动新容器，挂载已有卷
docker run -d --name app2 -v $VOLUME_NAME:/app/data xiaohongshu-app

# 6. 检查数据是否仍然存在
docker exec app2 ls -lh /app/data/auto-content/
# ✅ 应该看到之前的 .json 文件
```

### 验证3: Zeabur 持久卷

**Zeabur 环境验证**:
1. 部署应用，配置持久卷
2. 生成一些内容计划数据
3. 通过 Zeabur 控制台查看日志，确认数据保存成功
4. 手动触发重新部署（或推送新代码）
5. 部署完成后，检查数据是否仍然存在：
   ```bash
   curl https://your-app.zeabur.app/agent/auto/tasks/user_xxx
   ```
6. ✅ 应该返回之前生成的任务数据

## 📋 部署检查清单

### Dockerfile 层面 ✅
- [x] `VOLUME ["/app/data"]` 声明已添加
- [x] `/app/data` 目录在容器启动时创建
- [x] 权限配置正确（可读写）

### Zeabur 平台层面 🚧
- [ ] 在 Zeabur Dashboard 配置持久卷
  - 挂载路径: `/app/data`
  - 建议大小: 1-5GB
- [ ] 确认卷已成功挂载（查看容器日志）
- [ ] 测试数据持久性（重新部署后数据仍存在）

### 应用代码层面 ✅
- [x] `saveData()` 正确实现并被调用
- [x] `loadPersistedData()` 在启动时加载数据
- [x] 错误处理和日志记录完善

### 监控层面 🚧
- [ ] 监控 `/app/data` 磁盘使用率
- [ ] 监控数据保存失败次数
- [ ] 设置告警（磁盘满、保存失败等）

## 🎯 立即行动项

### 优先级1（立即）
1. ✅ 添加 `VOLUME ["/app/data"]` 到 Dockerfile
2. 🚧 在 Zeabur 配置持久卷
3. 🚧 重新部署应用
4. 🚧 验证数据持久性

### 优先级2（短期）
1. 添加数据备份机制（定期备份到 Supabase Storage）
2. 添加数据恢复功能（从备份恢复）
3. 添加磁盘使用率监控

### 优先级3（长期）
1. 考虑迁移到数据库存储（PostgreSQL JSONB）
2. 实现分布式存储（支持多实例部署）
3. 添加数据同步机制（跨区域备份）

## 📚 相关文档

- Docker Volumes: https://docs.docker.com/storage/volumes/
- Zeabur Persistent Storage: https://docs.zeabur.com/ (查找 volumes 或 persistent storage)
- Supabase Storage API: https://supabase.com/docs/guides/storage

## 🔗 相关文件

- `/Dockerfile` - Docker 镜像配置（已添加 VOLUME 声明）
- `src/autoContentManager.ts:100-119` - saveData() 实现
- `src/autoContentManager.ts:121-183` - loadPersistedData() 实现
- `src/autoContentManager.ts:1422` - saveData() 调用点（渐进式保存）

## 📝 变更历史

- **2025-10-22**:
  - 发现问题：容器重启后数据丢失
  - 分析根因：缺少 VOLUME 声明和持久卷配置
  - 实施修复：添加 `VOLUME ["/app/data"]` 到 Dockerfile
  - 待验证：Zeabur 持久卷配置和数据持久性测试
