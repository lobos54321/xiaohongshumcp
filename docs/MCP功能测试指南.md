# 小红书MCP功能完整测试指南

## 目录
1. [登录相关功能](#登录相关功能)
2. [内容发布功能](#内容发布功能)
3. [内容发现功能](#内容发现功能)
4. [互动功能](#互动功能)
5. [用户功能](#用户功能)

---

## 测试前准备

### 环境要求
- ✅ 已登录小红书账号
- ✅ Cookie已保存到数据库（Supabase + 文件系统）
- ✅ MCP Router 服务正常运行
- ✅ 后端API服务正常运行（port 8080）

### 获取测试所需参数
大部分MCP功能需要以下参数：
- `feed_id`: 笔记ID（从搜索或Feed列表获取）
- `xsec_token`: 访问令牌（从搜索或Feed列表获取）
- `user_id`: 用户ID（从笔记详情或用户主页获取）

---

## 登录相关功能

### 1. check_login_status - 检查登录状态

**工具名称**: `check_login_status`

**参数**: 无

**测试步骤**:
1. 调用MCP工具
2. 检查返回结果是否包含 `logged_in: true`

**预期结果**:
```json
{
  "logged_in": true,
  "message": "已登录"
}
```

**测试命令**（通过MCP Router）:
```bash
curl http://localhost:18060/api/v1/login/status
```

---

### 2. get_login_qrcode - 获取登录二维码

**工具名称**: `get_login_qrcode`

**参数**: 无

**测试步骤**:
1. 调用MCP工具获取二维码
2. 验证返回Base64图片数据
3. 扫描二维码测试登录流程

**预期结果**:
```json
{
  "qrcode": "data:image/png;base64,iVBORw0KG...",
  "timeout": 120
}
```

**测试命令**:
```bash
curl http://localhost:18060/api/v1/login/qrcode
```

---

## 内容发布功能

### 3. publish_content - 发布图文内容

**工具名称**: `publish_content`

**必需参数**:
- `title`: 标题（最多20个中文字）
- `content`: 正文内容
- `images`: 图片列表（至少1张，支持HTTP链接或本地路径）

**可选参数**:
- `tags`: 话题标签列表

**测试步骤**:
1. 准备测试图片（本地或URL）
2. 调用MCP工具发布内容
3. 到小红书平台验证发布成功

**测试数据示例**:
```json
{
  "title": "AI智能创作工具测试",
  "content": "这是一个测试内容，验证MCP发布功能是否正常工作。\n\n✨ 测试特性：\n- 自动发布\n- 图文同步\n- 标签管理",
  "images": [
    "https://example.com/image1.jpg",
    "https://example.com/image2.jpg"
  ],
  "tags": ["AI工具", "效率提升", "内容创作"]
}
```

**预期结果**:
```json
{
  "success": true,
  "message": "发布成功",
  "data": {
    "title": "...",
    "status": "发布完成"
  }
}
```

**测试命令**（通过后端API）:
```bash
curl -X POST http://localhost:8080/agent/auto/approve/USER_ID \
  -H "Content-Type: application/json" \
  -d '{"taskId": "task_id_here"}'
```

---

### 4. publish_with_video - 发布视频内容

**工具名称**: `publish_with_video`

**必需参数**:
- `title`: 标题（最多20个中文字）
- `content`: 正文内容
- `video`: 本地视频绝对路径

**可选参数**:
- `tags`: 话题标签列表

**测试步骤**:
1. 准备测试视频文件（MP4格式推荐）
2. 提供视频绝对路径
3. 调用MCP工具发布
4. 验证视频上传和发布成功

**测试数据示例**:
```json
{
  "title": "AI视频创作测试",
  "content": "测试MCP视频发布功能\n\n🎬 自动化视频发布\n📊 智能内容管理",
  "video": "/Users/user/videos/test_video.mp4",
  "tags": ["视频创作", "AI工具"]
}
```

**注意事项**:
- 仅支持本地文件，不支持URL
- 视频格式: MP4, MOV等常见格式
- 文件大小限制: 根据小红书平台要求

---

## 内容发现功能

### 5. list_feeds - 获取首页Feed列表

**工具名称**: `list_feeds`

**参数**: 无

**测试步骤**:
1. 调用MCP工具
2. 验证返回Feed列表
3. 记录 `feed_id` 和 `xsec_token` 用于后续测试

**预期结果**:
```json
{
  "feeds": [
    {
      "feed_id": "64a123...",
      "xsec_token": "XYZ123...",
      "title": "标题",
      "author": "作者名",
      "likes": 1200,
      "comments": 50
    }
  ]
}
```

**测试命令**:
```bash
curl http://localhost:18060/api/v1/feeds/list
```

---

### 6. search_feeds - 搜索内容

**工具名称**: `search_feeds`

**必需参数**:
- `keyword`: 搜索关键词

**可选参数** (`filters`):
- `sort_by`: 排序（综合|最新|最多点赞|最多评论|最多收藏）
- `note_type`: 笔记类型（不限|视频|图文）
- `publish_time`: 发布时间（不限|一天内|一周内|半年内）
- `search_scope`: 搜索范围（不限|已看过|未看过|已关注）
- `location`: 位置距离（不限|同城|附近）

**测试步骤**:
1. 使用关键词搜索（如"AI工具"）
2. 测试不同筛选条件
3. 记录搜索结果的 `feed_id` 和 `xsec_token`

**测试数据示例**:
```json
{
  "keyword": "AI工具",
  "filters": {
    "sort_by": "最多点赞",
    "note_type": "图文",
    "publish_time": "一周内"
  }
}
```

**预期结果**:
```json
{
  "keyword": "AI工具",
  "results": [
    {
      "feed_id": "...",
      "xsec_token": "...",
      "title": "...",
      "author": "..."
    }
  ],
  "total": 50
}
```

**测试命令**:
```bash
curl -X POST http://localhost:18060/api/v1/feeds/search \
  -H "Content-Type: application/json" \
  -d '{"keyword": "AI工具", "filters": {"sort_by": "最多点赞"}}'
```

---

### 7. get_feed_detail - 获取笔记详情

**工具名称**: `get_feed_detail`

**必需参数**:
- `feed_id`: 笔记ID
- `xsec_token`: 访问令牌

**测试步骤**:
1. 从搜索或Feed列表获取 `feed_id` 和 `xsec_token`
2. 调用MCP工具获取详情
3. 验证返回完整的笔记信息

**测试数据示例**:
```json
{
  "feed_id": "64a123456789",
  "xsec_token": "XYZ123..."
}
```

**预期结果**:
```json
{
  "feed_id": "...",
  "title": "标题",
  "content": "内容",
  "images": ["url1", "url2"],
  "author": {
    "user_id": "...",
    "nickname": "..."
  },
  "stats": {
    "likes": 1200,
    "comments": 50,
    "favorites": 80
  },
  "comments": [
    {
      "author": "...",
      "content": "...",
      "time": "..."
    }
  ]
}
```

**测试命令**:
```bash
curl "http://localhost:18060/api/v1/feeds/detail?feed_id=XXX&xsec_token=YYY"
```

---

## 互动功能

### 8. post_comment_to_feed - 发表评论

**工具名称**: `post_comment_to_feed`

**必需参数**:
- `feed_id`: 笔记ID
- `xsec_token`: 访问令牌
- `content`: 评论内容

**测试步骤**:
1. 选择一个测试笔记
2. 使用MCP工具发表评论
3. 到小红书平台验证评论是否发布成功

**测试数据示例**:
```json
{
  "feed_id": "64a123456789",
  "xsec_token": "XYZ123...",
  "content": "很棒的内容！感谢分享👍"
}
```

**预期结果**:
```json
{
  "success": true,
  "message": "评论成功",
  "comment_id": "comment_xxx"
}
```

**注意事项**:
- 避免频繁评论（可能触发平台限制）
- 评论内容需符合平台规范
- 测试时使用友好的测试评论

---

### 9. like_feed - 点赞笔记

**工具名称**: `like_feed`

**必需参数**:
- `feed_id`: 笔记ID
- `xsec_token`: 访问令牌

**可选参数**:
- `unlike`: 是否取消点赞（true为取消，false或未设置为点赞）

**测试步骤**:
1. 测试点赞功能（`unlike: false`）
2. 测试取消点赞功能（`unlike: true`）
3. 验证已点赞状态会自动跳过重复点赞

**测试数据示例**:
```json
{
  "feed_id": "64a123456789",
  "xsec_token": "XYZ123...",
  "unlike": false
}
```

**预期结果**:
```json
{
  "success": true,
  "message": "点赞成功",
  "action": "liked"
}
```

**测试命令**:
```bash
# 点赞
curl -X POST http://localhost:18060/api/v1/feeds/like \
  -H "Content-Type: application/json" \
  -d '{"feed_id": "XXX", "xsec_token": "YYY", "unlike": false}'

# 取消点赞
curl -X POST http://localhost:18060/api/v1/feeds/like \
  -H "Content-Type: application/json" \
  -d '{"feed_id": "XXX", "xsec_token": "YYY", "unlike": true}'
```

---

### 10. favorite_feed - 收藏笔记

**工具名称**: `favorite_feed`

**必需参数**:
- `feed_id`: 笔记ID
- `xsec_token`: 访问令牌

**可选参数**:
- `unfavorite`: 是否取消收藏（true为取消，false或未设置为收藏）

**测试步骤**:
1. 测试收藏功能（`unfavorite: false`）
2. 测试取消收藏功能（`unfavorite: true`）
3. 验证已收藏状态会自动跳过重复收藏

**测试数据示例**:
```json
{
  "feed_id": "64a123456789",
  "xsec_token": "XYZ123...",
  "unfavorite": false
}
```

**预期结果**:
```json
{
  "success": true,
  "message": "收藏成功",
  "action": "favorited"
}
```

**测试命令**:
```bash
# 收藏
curl -X POST http://localhost:18060/api/v1/feeds/favorite \
  -H "Content-Type: application/json" \
  -d '{"feed_id": "XXX", "xsec_token": "YYY", "unfavorite": false}'

# 取消收藏
curl -X POST http://localhost:18060/api/v1/feeds/favorite \
  -H "Content-Type: application/json" \
  -d '{"feed_id": "XXX", "xsec_token": "YYY", "unfavorite": true}'
```

---

## 用户功能

### 11. user_profile - 获取用户主页

**工具名称**: `user_profile`

**必需参数**:
- `user_id`: 用户ID
- `xsec_token`: 访问令牌

**测试步骤**:
1. 从笔记详情获取作者的 `user_id`
2. 使用MCP工具获取用户主页信息
3. 验证返回用户基本信息和笔记列表

**测试数据示例**:
```json
{
  "user_id": "5e8abc123456",
  "xsec_token": "XYZ123..."
}
```

**预期结果**:
```json
{
  "user_id": "...",
  "nickname": "用户昵称",
  "avatar": "头像URL",
  "description": "个人简介",
  "stats": {
    "followers": 1200,
    "following": 300,
    "likes": 5000,
    "notes": 150
  },
  "notes": [
    {
      "feed_id": "...",
      "title": "...",
      "cover": "..."
    }
  ]
}
```

**测试命令**:
```bash
curl "http://localhost:18060/api/v1/user/profile?user_id=XXX&xsec_token=YYY"
```

---

## 完整测试流程

### 场景1: 内容搜索 → 查看详情 → 互动

1. **搜索内容**
   ```bash
   search_feeds(keyword="AI工具")
   ```

2. **获取笔记详情**
   ```bash
   get_feed_detail(feed_id="...", xsec_token="...")
   ```

3. **点赞笔记**
   ```bash
   like_feed(feed_id="...", xsec_token="...")
   ```

4. **收藏笔记**
   ```bash
   favorite_feed(feed_id="...", xsec_token="...")
   ```

5. **发表评论**
   ```bash
   post_comment_to_feed(feed_id="...", xsec_token="...", content="很有用！")
   ```

6. **查看作者主页**
   ```bash
   user_profile(user_id="...", xsec_token="...")
   ```

---

### 场景2: 自动发布内容

1. **检查登录状态**
   ```bash
   check_login_status()
   ```

2. **发布图文内容**
   ```bash
   publish_content(
     title="AI创作测试",
     content="测试内容...",
     images=["img1.jpg", "img2.jpg"],
     tags=["AI工具", "效率"]
   )
   ```

3. **验证发布成功**
   - 到小红书平台查看发布的内容

---

## 测试检查清单

### 功能测试
- [ ] ✅ 登录状态检查正常
- [ ] ✅ 二维码登录流程完整
- [ ] ✅ 图文内容发布成功
- [ ] ✅ 视频内容发布成功
- [ ] ✅ Feed列表获取正常
- [ ] ✅ 搜索功能返回准确结果
- [ ] ✅ 笔记详情完整
- [ ] ✅ 评论发布成功
- [ ] ✅ 点赞/取消点赞正常
- [ ] ✅ 收藏/取消收藏正常
- [ ] ✅ 用户主页信息完整

### 性能测试
- [ ] ✅ 搜索响应时间 < 3秒
- [ ] ✅ 发布内容响应时间 < 30秒
- [ ] ✅ 获取详情响应时间 < 2秒
- [ ] ✅ 互动操作响应时间 < 1秒

### 异常测试
- [ ] ✅ 无效feed_id处理
- [ ] ✅ 过期xsec_token处理
- [ ] ✅ 重复点赞/收藏处理
- [ ] ✅ 超长内容截断
- [ ] ✅ 无效图片URL处理

---

## 常见问题

### Q1: xsec_token从哪里获取？
**A**: 从 `search_feeds` 或 `list_feeds` 的返回结果中获取，每个笔记都会包含对应的 `xsec_token`。

### Q2: 为什么评论发布失败？
**A**: 可能原因：
- 登录状态失效
- 评论内容违规
- 平台频率限制
- xsec_token过期

### Q3: 如何测试批量操作？
**A**:
1. 先用 `search_feeds` 获取多个笔记
2. 遍历结果列表
3. 对每个笔记调用互动API
4. 注意添加延迟避免触发限流

### Q4: 发布内容时图片加载失败？
**A**:
- 确认图片URL可访问
- 使用本地绝对路径更可靠
- 检查图片格式（推荐JPG/PNG）
- 验证图片大小是否符合平台要求

---

## 测试脚本示例

### Python测试脚本

```python
import requests
import time

BASE_URL = "http://localhost:18060/api/v1"

def test_search_and_interact():
    """测试搜索并互动流程"""

    # 1. 搜索内容
    search_res = requests.post(f"{BASE_URL}/feeds/search", json={
        "keyword": "AI工具",
        "filters": {"sort_by": "最多点赞"}
    })
    feeds = search_res.json()["results"]

    if not feeds:
        print("❌ 搜索无结果")
        return

    # 2. 获取第一个笔记详情
    first_feed = feeds[0]
    detail_res = requests.get(f"{BASE_URL}/feeds/detail", params={
        "feed_id": first_feed["feed_id"],
        "xsec_token": first_feed["xsec_token"]
    })
    detail = detail_res.json()
    print(f"✅ 获取笔记详情: {detail['title']}")

    # 3. 点赞
    time.sleep(1)  # 延迟避免限流
    like_res = requests.post(f"{BASE_URL}/feeds/like", json={
        "feed_id": first_feed["feed_id"],
        "xsec_token": first_feed["xsec_token"],
        "unlike": False
    })
    print(f"✅ 点赞结果: {like_res.json()['message']}")

    # 4. 收藏
    time.sleep(1)
    fav_res = requests.post(f"{BASE_URL}/feeds/favorite", json={
        "feed_id": first_feed["feed_id"],
        "xsec_token": first_feed["xsec_token"],
        "unfavorite": False
    })
    print(f"✅ 收藏结果: {fav_res.json()['message']}")

    # 5. 评论
    time.sleep(1)
    comment_res = requests.post(f"{BASE_URL}/feeds/comment", json={
        "feed_id": first_feed["feed_id"],
        "xsec_token": first_feed["xsec_token"],
        "content": "很棒的内容！👍"
    })
    print(f"✅ 评论结果: {comment_res.json()['message']}")

if __name__ == "__main__":
    test_search_and_interact()
```

---

## 总结

本测试指南覆盖了小红书MCP的全部11个功能：

1. ✅ **登录功能**: 状态检查、二维码登录
2. ✅ **发布功能**: 图文发布、视频发布
3. ✅ **发现功能**: Feed列表、搜索、笔记详情
4. ✅ **互动功能**: 评论、点赞、收藏
5. ✅ **用户功能**: 用户主页查询

完成所有测试后，可以确认MCP功能完整性和稳定性，为自动化运营提供可靠基础。
