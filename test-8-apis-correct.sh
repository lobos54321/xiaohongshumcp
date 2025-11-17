#!/bin/bash

echo "🎯 开始测试小红书MCP系统8大核心功能模块"
echo "==================================================="

# 基础URL - 修改为 MCP Router 端口
BASE_URL="http://localhost:3000"
TEST_USER="test_user"

echo ""
echo "1️⃣ 测试登录管理 (check_login_status)..."
curl -X GET "$BASE_URL/api/xiaohongshu/login/status?userId=$TEST_USER" \
  -H "Content-Type: application/json" \
  --max-time 10 \
  -s | jq '.' || echo "❌ 登录状态检查失败"

echo ""
echo "2️⃣ 测试推荐获取 (list_feeds)..."
curl -X GET "$BASE_URL/api/xiaohongshu/feeds/list?userId=$TEST_USER&limit=3" \
  -H "Content-Type: application/json" \
  --max-time 10 \
  -s | jq '.' || echo "❌ 推荐获取失败"

echo ""
echo "3️⃣ 测试内容搜索 (search_feeds)..."
curl -X GET "$BASE_URL/api/xiaohongshu/feeds/search?userId=$TEST_USER&keyword=美食&limit=3" \
  -H "Content-Type: application/json" \
  --max-time 10 \
  -s | jq '.' || echo "❌ 内容搜索失败"

echo ""
echo "4️⃣ 测试详情获取 (get_feed_detail)..."
curl -X POST "$BASE_URL/mcp/call" \
  -H "Content-Type: application/json" \
  -d '{"userId":"'$TEST_USER'","toolName":"xiaohongshu_get_feed_detail","arguments":{"feed_id":"example_id"}}' \
  --max-time 10 \
  -s | jq '.' || echo "❌ 详情获取失败"

echo ""
echo "5️⃣ 测试用户主页 (user_profile)..."
curl -X POST "$BASE_URL/mcp/call" \
  -H "Content-Type: application/json" \
  -d '{"userId":"'$TEST_USER'","toolName":"xiaohongshu_user_profile","arguments":{"user_id":"example_user_id","xsec_token":"token"}}' \
  --max-time 10 \
  -s | jq '.' || echo "❌ 用户主页获取失败"

echo ""
echo "6️⃣ 测试图文发布 (publish_content)..."
curl -X POST "$BASE_URL/api/xiaohongshu/publish" \
  -H "Content-Type: application/json" \
  -d '{"userId":"'$TEST_USER'","content":"测试发布内容 #测试","images":[],"privacy":"public"}' \
  --max-time 10 \
  -s | jq '.' || echo "❌ 图文发布失败"

echo ""
echo "7️⃣ 测试视频发布 (publish_with_video)..."
curl -X POST "$BASE_URL/api/xiaohongshu/publish/video" \
  -H "Content-Type: application/json" \
  -d '{"userId":"'$TEST_USER'","content":"测试视频发布 #视频测试","video_path":"/path/to/test/video.mp4","privacy":"public"}' \
  --max-time 10 \
  -s | jq '.' || echo "❌ 视频发布失败"

echo ""
echo "8️⃣ 测试评论发布 (post_comment_to_feed)..."
curl -X POST "$BASE_URL/mcp/call" \
  -H "Content-Type: application/json" \
  -d '{"userId":"'$TEST_USER'","toolName":"xiaohongshu_post_comment","arguments":{"feed_id":"example_feed_id","content":"这是一条测试评论","reply_to":null}}' \
  --max-time 10 \
  -s | jq '.' || echo "❌ 评论发布失败"

echo ""
echo "==================================================="
echo "🎯 测试完成"
