# 内容生成问题诊断指南

## 🔍 问题现象
- 前端显示"默认标题"和"默认内容"
- 任务状态显示"ready"但内容未生成
- 所有任务都使用默认占位符

## 🎯 根本原因分析

### 1. 环境变量未配置
缺少必要的API密钥导致Claude API调用失败。

**需要配置的环境变量：**
```bash
# Claude API（必需）
ANTHROPIC_API_KEY=sk-ant-xxx

# 图片生成（必需）
GEMINI_API_KEY=xxx
UNSPLASH_API_KEY=xxx  # 可选，备用图片源

# Supabase存储（必需）
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=xxx

# 可选配置
CLAUDE_MODEL=claude-3-haiku-20240307
PORT=4000
NODE_ENV=production
```

### 2. JSON解析失败
Claude API返回的格式不符合预期，导致解析失败。

**期望的JSON格式：**
```json
{
  "title": "吸引人的标题",
  "content": "完整的正文内容，包含表情符号和话题标签",
  "imagePrompts": [
    "第1张图片的详细描述",
    "第2张图片的详细描述",
    "第3张图片的详细描述",
    "第4张图片的详细描述"
  ],
  "hashtags": ["标签1", "标签2", "标签3"]
}
```

### 3. 代码逻辑中的默认值处理
`autoContentManager.ts` line 971-972:
```javascript
title: taskDetails.title || '默认标题',
content: taskDetails.content || '默认内容',
```

当Claude返回的JSON中title/content为空时，使用默认值。

## 🛠️ 诊断步骤

### 步骤1: 检查Zeabur日志
在Zeabur日志中搜索以下关键词：

```bash
# 成功的情况
✅ "Claude响应原文:"
✅ "清理后的JSON:"
✅ "任务创建成功"

# 失败的情况
❌ "JSON解析失败:"
❌ "任务创建失败:"
❌ "演示模式"  # 说明API KEY未配置
```

### 步骤2: 验证API KEY
1. 登录Zeabur控制台
2. 进入项目环境变量设置
3. 确认以下变量已配置且有效：
   - `ANTHROPIC_API_KEY`
   - `GEMINI_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_KEY`

### 步骤3: 测试API调用
使用以下命令测试Claude API：

```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-3-haiku-20240307",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### 步骤4: 查看完整错误堆栈
检查日志中的完整错误信息：
```
❌ [任务创建] JSON解析失败: [错误详情]
📝 [任务创建] 完整响应文本: [Claude原始响应]
📝 [任务创建] 清理后文本: [清理后的JSON]
```

## 🔧 修复方案

### 方案1: 配置环境变量（推荐）
在Zeabur环境变量中添加所有必需的API密钥。

### 方案2: 增强JSON解析容错性
如果JSON解析经常失败，可以增强容错逻辑：

```javascript
// 在 autoContentManager.ts 中增强解析
try {
  taskDetails = JSON.parse(cleanedText);

  // 验证必需字段
  if (!taskDetails.title || !taskDetails.content) {
    console.warn('⚠️ Claude返回的JSON缺少必需字段，使用备用提取方法');
    taskDetails = this.extractContentFromText(responseText);
  }
} catch (parseError) {
  // 备用方案：从文本中提取关键信息
  console.error('❌ JSON解析失败，尝试文本提取');
  taskDetails = this.extractContentFromText(responseText);
}
```

### 方案3: 使用更强大的Claude模型
将 `CLAUDE_MODEL` 升级为更智能的模型：
```bash
CLAUDE_MODEL=claude-3-5-sonnet-20241022  # 更好的JSON生成能力
```

## 📋 检查清单

- [ ] 已配置 `ANTHROPIC_API_KEY`
- [ ] 已配置 `GEMINI_API_KEY`
- [ ] 已配置 `SUPABASE_URL` 和 `SUPABASE_KEY`
- [ ] API KEY有效且有足够配额
- [ ] 查看了Zeabur日志中的Claude响应
- [ ] 确认JSON格式符合预期
- [ ] 测试了单个内容生成API
- [ ] 检查了网络连接和API访问

## 🎯 快速测试

在Zeabur重新部署后，访问以下API测试：

```bash
# 1. 健康检查
GET https://your-app.zeabur.app/health

# 2. 启动自动模式（会触发内容生成）
POST https://your-app.zeabur.app/agent/auto/start
{
  "userId": "test-user",
  "productName": "测试产品",
  "audience": "年轻妈妈",
  "postsPerDay": 1
}

# 3. 查看生成计划
GET https://your-app.zeabur.app/agent/auto/plan/test-user

# 4. 查看内容策略
GET https://your-app.zeabur.app/agent/auto/strategy/test-user
```

## 📊 预期结果

**正常情况：**
- 任务标题：有意义的中文标题（如"周末亲子时光：户外探索的5个好处"）
- 任务内容：完整的小红书风格文案（800-1000字）
- 图片：4张AI生成的配图
- 状态：ready → published

**异常情况：**
- 标题：默认标题
- 内容：默认内容
- 图片：占位图片
- 日志：包含错误信息

## 🆘 获取帮助

如果以上步骤无法解决问题，请提供以下信息：

1. Zeabur完整日志（包含Claude响应部分）
2. 环境变量配置截图（隐藏敏感信息）
3. 前端显示的具体内容
4. API调用的返回结果

将以上信息发送给开发团队以获取进一步支持。
