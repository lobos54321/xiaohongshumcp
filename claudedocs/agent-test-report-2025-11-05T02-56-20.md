# MCP 工具自动化测试报告

**测试时间**: 2025-11-05T02:56:20.130Z
**测试环境**: production (https://xiaohongshu-automation-ai.zeabur.app)
**用户ID**: user_9dee489189a644ee8fe869097846e97d_prome
**总耗时**: 24.78s

## 测试摘要

- ✅ 成功: 0/8
- ❌ 失败: 3/8
- ⏭️  跳过: 5/8

## 详细结果

### Phase 0: 登录状态验证

#### ✅ check_login_status
- **状态**: 通过
- **耗时**: 2.09s
- **返回数据**:
```json
{
  "logged_in": true,
  "message": "Cookie登录状态检测成功",
  "user_id": "user_9dee489189a644ee8fe869097846e97d_prome",
  "source": "local_cookies"
}...
```


### Phase 1: 独立工具

#### ❌ user_profile
- **状态**: 失败
- **耗时**: 3.6s
- **错误类型**: UNKNOWN_ERROR
- **错误信息**: HTTP 404: Not Found - <!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>Cannot POST /agent/xiaohongshu/user-profile</pre>
</body>
</html>



### Phase 2: 信息获取

#### ❌ list_feeds
- **状态**: 失败
- **耗时**: 3.54s
- **错误类型**: UNKNOWN_ERROR
- **错误信息**: HTTP 404: Not Found - <!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>Cannot POST /agent/xiaohongshu/list-feeds</pre>
</body>
</html>


#### ❌ search_feeds
- **状态**: 失败
- **耗时**: 3.53s
- **错误类型**: UNKNOWN_ERROR
- **错误信息**: HTTP 404: Not Found - <!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>Cannot POST /agent/xiaohongshu/search</pre>
</body>
</html>



### Phase 3: 详情查询

#### ⏭️ get_feed_detail
- **状态**: 跳过
- **原因**: No feed_id available


### Phase 4: 互动操作

#### ⏭️ like_feed
- **状态**: 跳过
- **原因**: No feed_id available

#### ⏭️ favorite_feed
- **状态**: 跳过
- **原因**: No feed_id available

#### ⏭️ post_comment_to_feed
- **状态**: 跳过
- **原因**: No feed_id available


### Phase 5: 高级功能

#### ⏭️ publish_with_video
- **状态**: 跳过
- **原因**: 需要视频文件


## 问题汇总

1. **user_profile** (UNKNOWN_ERROR): HTTP 404: Not Found - <!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>Cannot POST /agent/xiaohongshu/user-profile</pre>
</body>
</html>

2. **list_feeds** (UNKNOWN_ERROR): HTTP 404: Not Found - <!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>Cannot POST /agent/xiaohongshu/list-feeds</pre>
</body>
</html>

3. **search_feeds** (UNKNOWN_ERROR): HTTP 404: Not Found - <!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Error</title>
</head>
<body>
<pre>Cannot POST /agent/xiaohongshu/search</pre>
</body>
</html>


## 建议

- 检查后端日志获取更多错误信息
- 尝试手动测试失败的工具


---

*报告由 Claude Code Agent 自动生成*
