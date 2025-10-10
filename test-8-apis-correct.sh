#!/bin/bash

echo "🎯 开始测试小红书MCP系统8大核心功能模块"
echo "==================================================="

# 基础URL
BASE_URL="http://localhost:18062"

echo ""
echo "1️⃣ 测试登录管理 (check_login_status)..."
curl -X GET "$BASE_URL/api/v1/login/status" \
  -H "Content-Type: application/json" \
  --max-time 10 \
  -s | jq '.' || echo "❌ 登录状态检查失败"

echo ""
echo "2️⃣ 测试推荐获取 (list_feeds)..."
curl -X GET "$BASE_URL/api/v1/feeds?limit=3" \
  -H "Content-Type: application/json" \
  --max-time 10 \
  -s | jq '.' || echo "❌ 推荐获取失败"

echo ""
echo "3️⃣ 测试内容搜索 (search_feeds)..."
curl -X GET "$BASE_URL/api/v1/search?keyword=美食&limit=3" \
  -H "Content-Type: application/json" \
  --max-time 10 \
  -s | jq '.' || echo "❌ 内容搜索失败"

echo ""
echo "4️⃣ 测试详情获取 (get_feed_detail)..."
curl -X GET "$BASE_URL/api/v1/feed/detail?feed_id=example_id" \
  -H "Content-Type: application/json" \
  --max-time 10 \
  -s | jq '.' || echo "❌ 详情获取失败"

echo ""
echo "5️⃣ 测试用户主页 (user_profile)..."
curl -X GET "$BASE_URL/api/v1/user/profile" \
  -H "Content-Type: application/json" \
  --max-time 10 \
  -s | jq '.' || echo "❌ 用户主页获取失败"

echo ""
echo "6️⃣ 测试图文发布 (publish_content)..."
curl -X POST "$BASE_URL/api/v1/publish" \
  -H "Content-Type: application/json" \
  -d '{"content":"测试发布内容 #测试","images":[],"privacy":"public"}' \
  --max-time 10 \
  -s | jq '.' || echo "❌ 图文发布失败"

echo ""
echo "7️⃣ 测试视频发布 (publish_with_video)..."
curl -X POST "$BASE_URL/api/v1/publish/video" \
  -H "Content-Type: application/json" \
  -d '{"content":"测试视频发布 #视频测试","video_path":"/path/to/test/video.mp4","privacy":"public"}' \
  --max-time 10 \
  -s | jq '.' || echo "❌ 视频发布失败"

echo ""
echo "8️⃣ 测试评论发布 (post_comment_to_feed)..."
curl -X POST "$BASE_URL/api/v1/comment" \
  -H "Content-Type: application/json" \
  -d '{"feed_id":"example_feed_id","content":"这是一条测试评论","reply_to":null}' \
  --max-time 10 \
  -s | jq '.' || echo "❌ 评论发布失败"

echo ""
echo "==================================================="
echo "🎯 测试完成"
