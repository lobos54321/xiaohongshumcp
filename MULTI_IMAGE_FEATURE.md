# 🎨 多图生成与预览功能实现文档

## 📅 更新时间
2025-10-06

## 🎯 功能概述

实现了基于您反馈的多图生成和显示功能：

> "你要记住 现在生成图片后。不是给用户图片URL，而是显示图片给用户看。应该是多图的。不是一张的。"

### 核心改进

1. **多图生成**：从单张图片 → 默认生成3张图片（最多9张）
2. **图片显示**：从只返回URL → 显示图片预览（带hover效果）
3. **任务模式**：支持生成预览后再发布的工作流

## 🔧 技术实现

### 1. 后端改动

#### 文件：`claudeAgentHTTP.ts`

**新增参数：`count`**
```typescript
{
  name: 'generate_image',
  description: '使用AI生成适合小红书发布的配图。可以生成多张图片。',
  input_schema: {
    type: 'object' as const,
    properties: {
      prompt: { type: 'string', description: '图片描述' },
      style: { type: 'string', enum: ['realistic', 'cartoon', 'painting', 'sketch'] },
      aspectRatio: { type: 'string', enum: ['1:1', '9:16', '16:9'] },
      count: { type: 'number', description: '生成图片数量，默认3张，最多9张', minimum: 1, maximum: 9 }
    },
    required: ['prompt']
  }
}
```

**调用批量生成API：**
```typescript
private async callMCPTool(toolName: string, args: any): Promise<any> {
  if (toolName === 'generate_image') {
    const count = Math.min(Math.max(args.count || 3, 1), 9); // 默认3张，最多9张
    const response = await axios.post('http://localhost:4000/agent/image/generate-batch', {
      prompt: args.prompt,
      style: args.style || 'realistic',
      aspectRatio: args.aspectRatio || '1:1',
      count: count
    });
    return response.data.data;
  }
  // ...
}
```

#### 文件：`server.ts`

**新增批量生成端点：**
```typescript
// 批量图片生成API
app.post('/agent/image/generate-batch', async (req, res) => {
  const imageCount = Math.min(Math.max(count || 3, 1), 9);

  // 为每张图片创建略微不同的请求
  const requests = Array.from({ length: imageCount }, (_, i) => ({
    prompt: i === 0 ? prompt : `${prompt}, variation ${i + 1}`,
    style: style || 'realistic',
    aspectRatio: aspectRatio || '1:1'
  }));

  const results = await imageService.generateBatchImages(requests);

  res.json({
    success: true,
    data: {
      images,           // 完整图片信息
      count: images.length,
      totalCost,
      localPaths: images.map(img => img.localPath).filter(p => p),
      urls: images.map(img => img.url)
    }
  });
});
```

**新增预览生成端点（任务模式专用）：**
```typescript
app.post('/agent/xiaohongshu/generate-preview', async (req, res) => {
  const prompt = `请帮我创作一篇关于"${topic}"的小红书帖子内容。
要求：
1. 生成${length || 500}字左右的文案
2. 使用generate_image工具生成3张配图
3. 只返回内容和图片，不要发布`;

  const result = await agent.processRequest({ userId, prompt });

  // 从工具调用中提取图片信息
  const imageToolCall = result.toolCalls.find((tc: any) => tc.name === 'generate_image');
  const images = imageToolCall ? imageToolCall.result?.images || [] : [];

  res.json({
    success: true,
    data: {
      content: result.content,
      images: images,      // 返回图片数组
      toolCalls: result.toolCalls
    }
  });
});
```

#### 文件：`imageGenerationService.ts`

**已有批量生成方法：**
```typescript
async generateBatchImages(requests: ImageRequest[]): Promise<ImageResult[]> {
  const results: ImageResult[] = [];

  for (const request of requests) {
    try {
      const result = await this.generateImage(request);
      results.push(result);

      // 避免API限制，每次生成后等待2秒
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      results.push(this.getPlaceholderImage(request));
    }
  }

  return results;
}
```

**下载图片到本地：**
```typescript
private async downloadImage(url: string, source: string): Promise<string> {
  const response = await fetch(url);
  const buffer = await response.buffer();

  const downloadDir = path.join(process.cwd(), 'downloads', 'images');
  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }

  const timestamp = Date.now();
  const extension = this.getImageExtension(url);
  const filename = `${source}_${timestamp}${extension}`;
  const filepath = path.join(downloadDir, filename);

  fs.writeFileSync(filepath, buffer);

  console.log(`📁 图片已保存: ${filepath}`);
  return filepath;  // 返回本地绝对路径
}
```

### 2. 前端改动

#### 文件：`v2.html`

**修改createTask函数调用新端点：**
```javascript
async function createTask() {
  const topic = document.getElementById('taskTopic').value;
  const style = document.getElementById('taskStyle').value;
  const length = document.getElementById('taskLength').value;

  if (!topic) {
    alert('请输入主题');
    return;
  }

  alert('🎨 正在生成内容和配图，请稍候...');

  // 调用预览生成API（不发布）
  const response = await fetch(`${API_BASE}/agent/xiaohongshu/generate-preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: getUserId(),
      topic: topic,
      style: style,
      length: parseInt(length)
    })
  });

  const data = await response.json();

  if (data.success) {
    // 显示待审核任务（包含图片数组）
    showPendingTask({
      id: Date.now(),
      topic: topic,
      content: data.data.content,
      images: data.data.images || [],  // 图片数组
      style: style
    });
  }
}
```

**新增图片预览显示：**
```javascript
function showPendingTask(task) {
  const container = document.getElementById('pendingTasks');

  // 生成图片预览HTML
  let imagesHTML = '';
  if (task.images && task.images.length > 0) {
    imagesHTML = `
      <div class="mb-3">
        <div class="text-sm font-medium mb-2">📷 配图预览 (${task.images.length}张)</div>
        <div class="grid grid-cols-3 gap-2">
          ${task.images.map((img, index) => `
            <div class="relative group">
              <img src="${img.url}"
                   alt="预览${index + 1}"
                   class="w-full h-32 object-cover rounded border border-gray-300" />
              <div class="absolute inset-0 bg-black bg-opacity-50 opacity-0
                          group-hover:opacity-100 transition-opacity
                          flex items-center justify-center text-white text-xs rounded">
                ${img.source === 'unsplash' ? '📷 Unsplash' :
                  img.source === 'gemini' ? '🎨 AI生成' : '🖼️ 占位图'}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="border rounded-lg p-4 bg-yellow-50">
      <div class="flex justify-between items-start mb-3">
        <div>
          <div class="font-bold">${task.topic}</div>
          <div class="text-sm text-gray-600">风格: ${task.style}</div>
        </div>
        <span class="text-xs bg-yellow-200 px-2 py-1 rounded">待审核</span>
      </div>
      ${imagesHTML}
      <div class="bg-white p-3 rounded mb-3 text-sm whitespace-pre-wrap">${task.content}</div>
      <div class="flex gap-2">
        <button onclick="approveTask(${task.id})"
                class="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded">
          ✅ 确认发布
        </button>
        <button onclick="editTask(${task.id})"
                class="px-4 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded">
          ✏️ 修改
        </button>
        <button onclick="rejectTask(${task.id})"
                class="px-4 bg-red-600 hover:bg-red-700 text-white py-2 rounded">
          ❌ 重新生成
        </button>
      </div>
    </div>
  `;
}
```

## 📊 使用流程

### 任务模式流程

```
用户操作
  ↓
输入主题："咖啡拉花教程"
  ↓
点击"创建任务"
  ↓
前端调用 /agent/xiaohongshu/generate-preview
  ↓
Claude Agent处理：
  - 检查登录状态
  - 生成文案内容
  - 调用 generate_image (count=3)
  ↓
后端处理：
  - 调用 /agent/image/generate-batch
  - 生成3张图片（variation 1, 2, 3）
  - 从Unsplash搜索并下载
  - 保存到 downloads/images/
  ↓
返回数据：
{
  content: "文案内容...",
  images: [
    { url: "http://...", localPath: "/path/to/image1.jpg", source: "unsplash" },
    { url: "http://...", localPath: "/path/to/image2.jpg", source: "unsplash" },
    { url: "http://...", localPath: "/path/to/image3.jpg", source: "unsplash" }
  ]
}
  ↓
前端显示：
  - 3张图片预览（grid布局）
  - 鼠标悬停显示来源
  - 文案内容
  - 操作按钮（确认发布/修改/重新生成）
  ↓
用户审核：
  - 查看图片
  - 阅读文案
  - 点击"确认发布" → 发布到小红书
  - 点击"重新生成" → 重新创建任务
```

### 对话模式流程

```
用户输入："发一篇关于咖啡的文章"
  ↓
Claude Agent自动：
  1. 检查登录状态
  2. 调用 generate_image (count=3)
  3. 生成3张咖啡图片
  4. 创作文案
  5. 调用 xiaohongshu_publish_content
     - images: [localPath1, localPath2, localPath3]
  ↓
直接发布到小红书（带3张配图）
```

## 🎨 UI效果

### 图片预览卡片

```
┌─────────────────────────────────────────┐
│ 📷 配图预览 (3张)                      │
├─────────────┬─────────────┬─────────────┤
│ ┌─────────┐ │ ┌─────────┐ │ ┌─────────┐ │
│ │         │ │ │         │ │ │         │ │
│ │ Image 1 │ │ │ Image 2 │ │ │ Image 3 │ │
│ │         │ │ │         │ │ │         │ │
│ └─────────┘ │ └─────────┘ │ └─────────┘ │
│ [鼠标悬停显示来源]                       │
└─────────────────────────────────────────┘
```

### Hover效果

鼠标悬停时，图片上会显示半透明黑色遮罩 + 图片来源：
- 📷 Unsplash
- 🎨 AI生成
- 🖼️ 占位图

## 🔌 API端点

### 新增端点

| 端点 | 方法 | 说明 |
|-----|------|-----|
| `/agent/image/generate-batch` | POST | 批量生成图片 |
| `/agent/xiaohongshu/generate-preview` | POST | 生成内容预览（不发布） |

### 请求示例

**批量生成图片：**
```bash
curl -X POST http://localhost:4000/agent/image/generate-batch \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "coffee latte art on wooden table",
    "style": "realistic",
    "aspectRatio": "1:1",
    "count": 3
  }'
```

**响应：**
```json
{
  "success": true,
  "data": {
    "images": [
      {
        "url": "https://images.unsplash.com/...",
        "localPath": "/Users/.../downloads/images/unsplash_1728123456789.jpg",
        "source": "unsplash"
      },
      {
        "url": "https://images.unsplash.com/...",
        "localPath": "/Users/.../downloads/images/unsplash_1728123458790.jpg",
        "source": "unsplash"
      },
      {
        "url": "https://images.unsplash.com/...",
        "localPath": "/Users/.../downloads/images/unsplash_1728123460791.jpg",
        "source": "unsplash"
      }
    ],
    "count": 3,
    "totalCost": 0,
    "localPaths": ["/path1.jpg", "/path2.jpg", "/path3.jpg"],
    "urls": ["http://...", "http://...", "http://..."]
  }
}
```

## ✅ 测试清单

- [x] 后端：多图生成工具定义
- [x] 后端：批量生成API端点
- [x] 后端：预览生成API端点
- [x] 后端：图片下载到本地
- [x] 前端：调用预览API
- [x] 前端：多图显示（grid布局）
- [x] 前端：图片hover效果
- [ ] **待测试：实际创建任务流程**
- [ ] **待测试：图片显示效果**
- [ ] **待测试：发布功能（带多图）**

## 📝 下一步优化

1. **图片编辑功能**：
   - 允许用户选择保留哪些图片
   - 单独重新生成某张图片
   - 拖拽调整图片顺序

2. **更多图片源**：
   - 集成真正的Gemini Imagen API
   - 支持用户上传本地图片
   - 混合使用AI生成和搜索图片

3. **智能推荐**：
   - 根据文案内容自动选择最佳图片
   - 分析小红书热门内容的配图规律
   - 推荐最佳图片数量和比例

4. **性能优化**：
   - 图片预加载
   - 缩略图生成
   - CDN加速

## 🐛 已知问题

1. **图片生成速度**：每张图片间隔2秒（避免API限制），3张需要6秒
2. **图片来源单一**：目前主要依赖Unsplash，需要集成真正的AI生成
3. **图片相似度**：variation方式可能导致图片过于相似

## 📚 相关文件

- `/Users/boliu/xiaohongshumcp/playwright-service/claude-agent-service/src/claudeAgentHTTP.ts`
- `/Users/boliu/xiaohongshumcp/playwright-service/claude-agent-service/src/server.ts`
- `/Users/boliu/xiaohongshumcp/playwright-service/claude-agent-service/src/imageGenerationService.ts`
- `/Users/boliu/xiaohongshumcp/frontend/v2.html`
- `/Users/boliu/xiaohongshumcp/UPDATED_FEATURES.md`

## 🎯 关键改进点总结

根据您的反馈："现在生成图片后。不是给用户图片URL，而是显示图片给用户看。应该是多图的。"

我们实现了：

✅ **不只是URL** → 前端显示实际图片预览
✅ **不是一张** → 默认生成3张，最多9张
✅ **任务模式预览** → 生成后先显示，用户审核再发布
✅ **本地路径支持** → 图片下载到本地，支持xiaohongshu-mcp使用
✅ **视觉反馈** → Grid布局 + Hover效果展示图片来源

---

**版本**: 2.2.0
**更新日期**: 2025-10-06
**核心特性**: 多图生成 + 图片预览 + 任务审核工作流
