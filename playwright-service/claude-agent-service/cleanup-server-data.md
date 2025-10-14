# Zeabur服务器数据清理方案

## 方案1: API端点清理（推荐）

### 调用清理API：
```bash
# 清理特定用户的Cookie数据
curl -X POST https://your-zeabur-domain.com/admin/cleanup/cookies \
  -H "Content-Type: application/json" \
  -d '{"userId": "specific-user-id"}'

# 清理所有Cookie数据
curl -X POST https://your-zeabur-domain.com/admin/cleanup/all-cookies \
  -H "Content-Type: application/json" \
  -d '{"confirm": true}'

# 清理所有用户数据
curl -X POST https://your-zeabur-domain.com/admin/cleanup/all-data \
  -H "Content-Type: application/json" \
  -d '{"confirm": true}'
```

## 方案2: Zeabur控制台重部署

1. 登录Zeabur控制台
2. 找到你的项目
3. 点击 "Redeploy" 或 "Reset Volume"
4. 这会清除所有持久化数据

## 方案3: 环境变量控制

设置环境变量 `CLEAR_DATA_ON_START=true` 让服务启动时自动清理数据

## 方案4: 数据库/存储清理

如果使用了Zeabur的数据库服务，可以直接在控制台清理数据库表