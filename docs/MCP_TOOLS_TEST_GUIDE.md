# 小红书MCP工具完整测试指南

## 测试目标
系统性测试所有11个MCP工具，确保每个功能正常工作。

## 测试环境
- **后端**: https://xiaohongshu-automation-ai.zeabur.app
- **前端**: https://prome-platform.zeabur.app
- **测试用户**: user_9dee489189a644ee8fe869097846e97d_prome

---

## 11个MCP工具详细说明

### 1. login_qrcode - 获取登录二维码 ✅ 
**功能**: 生成小红书登录二维码，用户扫码登录

**测试端点**: 
```bash
GET https://xiaohongshu-automation-ai.zeabur.app/api/test/mcp/login_qrcode?userId=user_9dee489189a644ee8fe869097846e97d_prome
```

**预期结果**:
- 返回base64格式的二维码图片
- 返回格式: `data:image/png;base64,iVBORw0KG...`

**验证点**:
- [ ] 二维码图片能正常显示
- [ ] 扫码后能成功登录
- [ ] Cookie能正确保存

---

### 2. check_login - 检查登录状态 ✅
**功能**: 检查当前Cookie是否有效，是否已登录

**测试端点**:
```bash
GET https://xiaohongshu-automation-ai.zeabur.app/api/test/mcp/check_login?userId=user_9dee489189a644ee8fe869097846e97d_prome
```

**预期结果**:
```json
{
  "success": true,
  "data": {
    "logged_in": true,
    "user_id": "xxx",
    "message": "已登录"
  }
}
```

**验证点**:
- [ ] 已登录用户返回 `logged_in: true`
- [ ] 未登录用户返回 `logged_in: false`
- [ ] 能正确返回用户ID

---

### 3. publish_content - 发布图文内容 ⭐
**功能**: 发布带图片的小红书笔记

**测试端点**:
```bash
POST https://xiaohongshu-automation-ai.zeabur.app/api/test/mcp/publish_content
Content-Type: application/json

{
  "userId": "user_9dee489189a644ee8fe869097846e97d_prome",
  "title": "测试标题 - AI自动发布",
  "content": "这是一条测试内容\n\n✅ 功能测试\n✅ 图片上传\n✅ 标签测试\n\n#AI创作 #自动化测试",
  "images": [
    "https://lfjslsygnitdgdnfboiy.supabase.co/storage/v1/object/public/images/test_image_1.png",
    "https://lfjslsygnitdgdnfboiy.supabase.co/storage/v1/object/public/images/test_image_2.png"
  ]
}
```

**预期结果**:
```json
{
  "success": true,
  "message": "发布成功",
  "data": {
    "note_id": "xxx",
    "url": "https://www.xiaohongshu.com/explore/xxx"
  }
}
```

**验证点**:
- [ ] 内容能成功发布
- [ ] 图片能正确上传并显示
- [ ] 标题和内容完整显示
- [ ] 标签能正确添加
- [ ] 返回笔记ID和URL

---

### 4. publish_with_video - 发布视频内容 🎥
**功能**: 发布视频笔记

**测试端点**:
```bash
POST https://xiaohongshu-automation-ai.zeabur.app/api/test/mcp/publish_with_video
Content-Type: application/json

{
  "userId": "user_9dee489189a644ee8fe869097846e97d_prome",
  "title": "测试视频 - AI自动发布",
  "content": "这是一条视频测试内容\n\n📹 视频上传测试\n✅ 自动化发布\n\n#视频创作 #AI工具",
  "videoUrl": "https://example.com/test_video.mp4",
  "coverImage": "https://example.com/cover.jpg"
}
```

**预期结果**:
```json
{
  "success": true,
  "message": "视频发布成功",
  "data": {
    "note_id": "xxx",
    "url": "https://www.xiaohongshu.com/explore/xxx"
  }
}
```

**验证点**:
- [ ] 视频能成功上传
- [ ] 封面图正确显示
- [ ] 标题和内容完整
- [ ] 返回笔记ID

---

### 5. list_feeds - 获取首页Feed列表 📱
**功能**: 获取小红书首页推荐内容列表

**测试端点**:
```bash
GET https://xiaohongshu-automation-ai.zeabur.app/api/test/mcp/list_feeds?userId=user_9dee489189a644ee8fe869097846e97d_prome&page=1&limit=20
```

**预期结果**:
```json
{
  "success": true,
  "data": {
    "feeds": [
      {
        "note_id": "xxx",
        "title": "标题",
        "content": "内容摘要",
        "images": ["url1", "url2"],
        "author": {
          "user_id": "xxx",
          "nickname": "昵称",
          "avatar": "头像URL"
        },
        "stats": {
          "likes": 100,
          "comments": 20,
          "favorites": 50
        },
        "created_at": "2024-11-05T00:00:00Z"
      }
    ],
    "total": 100,
    "has_more": true
  }
}
```

**验证点**:
- [ ] 能获取到Feed列表
- [ ] 数据结构完整
- [ ] 分页功能正常
- [ ] 图片URL有效

---

### 6. search_feeds - 搜索内容 🔍
**功能**: 根据关键词搜索小红书内容

**测试端点**:
```bash
POST https://xiaohongshu-automation-ai.zeabur.app/api/test/mcp/search_feeds
Content-Type: application/json

{
  "userId": "user_9dee489189a644ee8fe869097846e97d_prome",
  "keyword": "AI创作工具",
  "sort": "hot",
  "page": 1,
  "limit": 20
}
```

**预期结果**:
```json
{
  "success": true,
  "data": {
    "keyword": "AI创作工具",
    "results": [
      {
        "note_id": "xxx",
        "title": "标题",
        "content": "内容",
        "images": ["url"],
        "author": {
          "nickname": "昵称"
        },
        "stats": {
          "likes": 100
        }
      }
    ],
    "total": 50,
    "has_more": true
  }
}
```

**验证点**:
- [ ] 搜索功能正常
- [ ] 能按热度排序
- [ ] 能按时间排序
- [ ] 筛选功能正常

---

### 7. get_feed_detail - 获取笔记详情 📄
**功能**: 获取指定笔记的完整信息

**测试端点**:
```bash
GET https://xiaohongshu-automation-ai.zeabur.app/api/test/mcp/get_feed_detail?userId=user_9dee489189a644ee8fe869097846e97d_prome&noteId=6541234567890abcdef
```

**预期结果**:
```json
{
  "success": true,
  "data": {
    "note_id": "6541234567890abcdef",
    "title": "完整标题",
    "content": "完整内容...",
    "images": ["url1", "url2", "url3"],
    "video": {
      "url": "视频URL",
      "cover": "封面URL"
    },
    "author": {
      "user_id": "xxx",
      "nickname": "昵称",
      "avatar": "头像",
      "description": "简介"
    },
    "stats": {
      "likes": 1000,
      "comments": 100,
      "favorites": 500,
      "shares": 50
    },
    "tags": ["#标签1", "#标签2"],
    "location": "地点",
    "created_at": "2024-11-05T00:00:00Z",
    "comments": [
      {
        "comment_id": "xxx",
        "content": "评论内容",
        "author": {
          "nickname": "评论者"
        },
        "likes": 10
      }
    ]
  }
}
```

**验证点**:
- [ ] 能获取笔记详情
- [ ] 数据完整准确
- [ ] 图片/视频URL有效
- [ ] 包含评论列表

---

### 8. post_comment_to_feed - 发表评论 💬
**功能**: 在指定笔记下发表评论

**测试端点**:
```bash
POST https://xiaohongshu-automation-ai.zeabur.app/api/test/mcp/post_comment_to_feed
Content-Type: application/json

{
  "userId": "user_9dee489189a644ee8fe869097846e97d_prome",
  "noteId": "6541234567890abcdef",
  "content": "这是一条测试评论！👍 内容很赞~"
}
```

**预期结果**:
```json
{
  "success": true,
  "message": "评论成功",
  "data": {
    "comment_id": "xxx",
    "content": "这是一条测试评论！👍 内容很赞~",
    "created_at": "2024-11-05T00:15:00Z"
  }
}
```

**验证点**:
- [ ] 评论能成功发表
- [ ] 评论内容完整
- [ ] 返回评论ID
- [ ] 能在笔记下看到评论

---

### 9. like_feed - 点赞/取消点赞 ❤️
**功能**: 对笔记进行点赞或取消点赞

**测试端点**:
```bash
POST https://xiaohongshu-automation-ai.zeabur.app/api/test/mcp/like_feed
Content-Type: application/json

{
  "userId": "user_9dee489189a644ee8fe869097846e97d_prome",
  "noteId": "6541234567890abcdef",
  "action": "like"
}
```

**预期结果**:
```json
{
  "success": true,
  "message": "点赞成功",
  "data": {
    "note_id": "6541234567890abcdef",
    "liked": true,
    "likes_count": 1001
  }
}
```

**验证点**:
- [ ] 能成功点赞
- [ ] 能取消点赞
- [ ] 点赞数正确更新
- [ ] 状态正确返回

---

### 10. favorite_feed - 收藏/取消收藏 ⭐
**功能**: 收藏笔记到收藏夹

**测试端点**:
```bash
POST https://xiaohongshu-automation-ai.zeabur.app/api/test/mcp/favorite_feed
Content-Type: application/json

{
  "userId": "user_9dee489189a644ee8fe869097846e97d_prome",
  "noteId": "6541234567890abcdef",
  "action": "favorite"
}
```

**预期结果**:
```json
{
  "success": true,
  "message": "收藏成功",
  "data": {
    "note_id": "6541234567890abcdef",
    "favorited": true,
    "favorites_count": 501
  }
}
```

**验证点**:
- [ ] 能成功收藏
- [ ] 能取消收藏
- [ ] 收藏数正确更新
- [ ] 能在收藏列表中看到

---

### 11. user_profile - 获取用户主页 👤
**功能**: 获取用户的主页信息和作品列表

**测试端点**:
```bash
GET https://xiaohongshu-automation-ai.zeabur.app/api/test/mcp/user_profile?userId=user_9dee489189a644ee8fe869097846e97d_prome&targetUserId=target_user_id
```

**预期结果**:
```json
{
  "success": true,
  "data": {
    "user_id": "target_user_id",
    "nickname": "用户昵称",
    "avatar": "头像URL",
    "description": "个人简介",
    "gender": "female",
    "location": "上海",
    "stats": {
      "notes_count": 100,
      "followers": 10000,
      "following": 500,
      "likes_received": 50000
    },
    "is_followed": false,
    "notes": [
      {
        "note_id": "xxx",
        "title": "笔记标题",
        "cover": "封面URL",
        "likes": 100
      }
    ]
  }
}
```

**验证点**:
- [ ] 能获取用户信息
- [ ] 数据完整准确
- [ ] 能看到用户作品列表
- [ ] 关注状态正确

---

## 测试流程

### 阶段1: 登录测试
1. 测试 `login_qrcode` - 获取二维码
2. 扫码登录
3. 测试 `check_login` - 验证登录状态

### 阶段2: 内容发布测试
4. 测试 `publish_content` - 发布图文
5. 测试 `publish_with_video` - 发布视频

### 阶段3: 内容浏览测试
6. 测试 `list_feeds` - 浏览首页
7. 测试 `search_feeds` - 搜索内容
8. 测试 `get_feed_detail` - 查看详情

### 阶段4: 互动测试
9. 测试 `post_comment_to_feed` - 发表评论
10. 测试 `like_feed` - 点赞
11. 测试 `favorite_feed` - 收藏

### 阶段5: 用户测试
12. 测试 `user_profile` - 查看用户主页

---

## 快速测试命令

### 使用curl测试

```bash
# 1. 检查登录状态
curl "https://xiaohongshu-automation-ai.zeabur.app/api/test/mcp/check_login?userId=user_9dee489189a644ee8fe869097846e97d_prome"

# 2. 获取Feed列表
curl "https://xiaohongshu-automation-ai.zeabur.app/api/test/mcp/list_feeds?userId=user_9dee489189a644ee8fe869097846e97d_prome"

# 3. 发布内容
curl -X POST "https://xiaohongshu-automation-ai.zeabur.app/api/test/mcp/publish_content" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_9dee489189a644ee8fe869097846e97d_prome",
    "title": "测试发布",
    "content": "这是测试内容 #测试",
    "images": []
  }'
```

---

## 测试记录表

| 工具 | 状态 | 测试时间 | 测试结果 | 问题描述 |
|------|------|----------|----------|----------|
| login_qrcode | ⏳ | - | - | - |
| check_login | ⏳ | - | - | - |
| publish_content | ⏳ | - | - | - |
| publish_with_video | ⏳ | - | - | - |
| list_feeds | ⏳ | - | - | - |
| search_feeds | ⏳ | - | - | - |
| get_feed_detail | ⏳ | - | - | - |
| post_comment_to_feed | ⏳ | - | - | - |
| like_feed | ⏳ | - | - | - |
| favorite_feed | ⏳ | - | - | - |
| user_profile | ⏳ | - | - | - |

状态标记:
- ⏳ 待测试
- ✅ 测试通过
- ❌ 测试失败
- ⚠️ 部分功能异常

---

## 常见问题

### Q1: 测试时提示"未登录"
**A**: 先执行 `login_qrcode` 并扫码登录，然后用 `check_login` 验证登录状态。

### Q2: 图片上传失败
**A**: 检查图片URL是否有效，图片格式是否支持（支持jpg、png）。

### Q3: 发布失败
**A**: 检查：
1. 是否已登录
2. Cookie是否过期
3. 内容是否违规
4. 图片是否过大

### Q4: 搜索无结果
**A**: 尝试更换关键词，或检查网络连接。

---

## 下一步

测试完成后，请：
1. 填写测试记录表
2. 记录所有发现的问题
3. 提交测试报告
4. 优化有问题的工具
