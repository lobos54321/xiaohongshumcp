/**
 * 测试小红书MCP系统的8大核心功能模块
 */

const { XiaohongshuMCPProcessManager } = require('./playwright-service/mcp-router/dist/processManager.js');

async function test8CoreFunctions() {
  console.log('🎯 开始测试小红书MCP系统8大核心功能模块\n');

  const manager = new XiaohongshuMCPProcessManager(
    './playwright-service/mcp-router/xiaohongshu-mcp',
    './cookies'
  );

  try {
    // 获取或创建进程
    console.log('📡 启动MCP进程...');
    const port = await manager.getOrCreateProcess('test-user');
    console.log(`✅ MCP进程已启动，端口: ${port}\n`);

    const testResults = {};

    // 1. 登录管理 - check_login_status
    console.log('1️⃣ 测试登录管理 (check_login_status)...');
    try {
      const loginResult = await manager.callTool('test-user', '/api/v1/login/status', 'GET');
      testResults.login_status = {
        status: 'success',
        data: loginResult,
        description: '登录状态检查'
      };
      console.log(`✅ 登录状态: ${JSON.stringify(loginResult)}`);
    } catch (error) {
      testResults.login_status = {
        status: 'error',
        error: error.message,
        description: '登录状态检查失败'
      };
      console.log(`❌ 登录状态检查失败: ${error.message}`);
    }

    // 2. 推荐获取 - list_feeds
    console.log('\n2️⃣ 测试推荐获取 (list_feeds)...');
    try {
      const feedsResult = await manager.callTool('test-user', '/api/v1/feeds?limit=3', 'GET');
      testResults.list_feeds = {
        status: 'success',
        data: feedsResult,
        description: '获取推荐内容列表'
      };
      console.log(`✅ 推荐获取成功，获得 ${feedsResult?.data?.length || 0} 条内容`);
    } catch (error) {
      testResults.list_feeds = {
        status: 'error',
        error: error.message,
        description: '推荐获取失败'
      };
      console.log(`❌ 推荐获取失败: ${error.message}`);
    }

    // 3. 内容搜索 - search_feeds
    console.log('\n3️⃣ 测试内容搜索 (search_feeds)...');
    try {
      const searchResult = await manager.callTool('test-user', '/api/v1/search?keyword=美食&limit=3', 'GET');
      testResults.search_feeds = {
        status: 'success',
        data: searchResult,
        description: '搜索相关内容'
      };
      console.log(`✅ 内容搜索成功，找到 ${searchResult?.data?.length || 0} 条结果`);
    } catch (error) {
      testResults.search_feeds = {
        status: 'error',
        error: error.message,
        description: '内容搜索失败'
      };
      console.log(`❌ 内容搜索失败: ${error.message}`);
    }

    // 4. 详情获取 - get_feed_detail
    console.log('\n4️⃣ 测试详情获取 (get_feed_detail)...');
    try {
      // 使用一个示例feed_id，实际使用中应该从feeds列表获取
      const detailResult = await manager.callTool('test-user', '/api/v1/feed/detail?feed_id=example_id', 'GET');
      testResults.get_feed_detail = {
        status: 'success',
        data: detailResult,
        description: '获取内容详细信息'
      };
      console.log(`✅ 详情获取成功`);
    } catch (error) {
      testResults.get_feed_detail = {
        status: 'error',
        error: error.message,
        description: '详情获取失败'
      };
      console.log(`❌ 详情获取失败: ${error.message}`);
    }

    // 5. 用户主页 - user_profile
    console.log('\n5️⃣ 测试用户主页 (user_profile)...');
    try {
      const profileResult = await manager.callTool('test-user', '/api/v1/user/profile', 'GET');
      testResults.user_profile = {
        status: 'success',
        data: profileResult,
        description: '获取用户主页信息'
      };
      console.log(`✅ 用户主页获取成功`);
    } catch (error) {
      testResults.user_profile = {
        status: 'error',
        error: error.message,
        description: '用户主页获取失败'
      };
      console.log(`❌ 用户主页获取失败: ${error.message}`);
    }

    // 6. 图文发布 - publish_content
    console.log('\n6️⃣ 测试图文发布 (publish_content)...');
    try {
      const publishData = {
        content: '测试发布内容 #测试',
        images: [],
        privacy: 'public'
      };
      const publishResult = await manager.callTool('test-user', '/api/v1/publish', 'POST', publishData);
      testResults.publish_content = {
        status: 'success',
        data: publishResult,
        description: '发布图文内容'
      };
      console.log(`✅ 图文发布成功`);
    } catch (error) {
      testResults.publish_content = {
        status: 'error',
        error: error.message,
        description: '图文发布失败'
      };
      console.log(`❌ 图文发布失败: ${error.message}`);
    }

    // 7. 视频发布 - publish_with_video
    console.log('\n7️⃣ 测试视频发布 (publish_with_video)...');
    try {
      const videoData = {
        content: '测试视频发布 #视频测试',
        video_path: '/path/to/test/video.mp4',
        privacy: 'public'
      };
      const videoResult = await manager.callTool('test-user', '/api/v1/publish/video', 'POST', videoData);
      testResults.publish_with_video = {
        status: 'success',
        data: videoResult,
        description: '发布视频内容'
      };
      console.log(`✅ 视频发布成功`);
    } catch (error) {
      testResults.publish_with_video = {
        status: 'error',
        error: error.message,
        description: '视频发布失败'
      };
      console.log(`❌ 视频发布失败: ${error.message}`);
    }

    // 8. 评论发布 - post_comment_to_feed
    console.log('\n8️⃣ 测试评论发布 (post_comment_to_feed)...');
    try {
      const commentData = {
        feed_id: 'example_feed_id',
        content: '这是一条测试评论',
        reply_to: null
      };
      const commentResult = await manager.callTool('test-user', '/api/v1/comment', 'POST', commentData);
      testResults.post_comment_to_feed = {
        status: 'success',
        data: commentResult,
        description: '发布评论'
      };
      console.log(`✅ 评论发布成功`);
    } catch (error) {
      testResults.post_comment_to_feed = {
        status: 'error',
        error: error.message,
        description: '评论发布失败'
      };
      console.log(`❌ 评论发布失败: ${error.message}`);
    }

    // 输出测试总结
    console.log('\n📊 测试结果总结:');
    console.log('='.repeat(50));

    let successCount = 0;
    let errorCount = 0;

    Object.entries(testResults).forEach(([key, result], index) => {
      const status = result.status === 'success' ? '✅' : '❌';
      const statusText = result.status === 'success' ? '成功' : '失败';

      console.log(`${index + 1}. ${key}: ${status} ${statusText} - ${result.description}`);

      if (result.status === 'success') {
        successCount++;
      } else {
        errorCount++;
        console.log(`   错误: ${result.error}`);
      }
    });

    console.log('='.repeat(50));
    console.log(`🎯 总计: ${successCount + errorCount} 个功能`);
    console.log(`✅ 成功: ${successCount} 个`);
    console.log(`❌ 失败: ${errorCount} 个`);
    console.log(`📈 成功率: ${((successCount / (successCount + errorCount)) * 100).toFixed(1)}%`);

    // 保存完整结果到文件
    const fs = require('fs');
    const resultPath = './test-results-8-functions.json';
    fs.writeFileSync(resultPath, JSON.stringify(testResults, null, 2));
    console.log(`\n📄 详细测试结果已保存到: ${resultPath}`);

  } catch (error) {
    console.error('❌ 测试过程中发生错误:', error.message);
    console.error(error.stack);
  } finally {
    // 清理资源
    console.log('\n🧹 正在清理资源...');
    manager.cleanup();
    process.exit(0);
  }
}

// 处理退出信号
process.on('SIGINT', () => {
  console.log('\n⚠️ 收到中断信号，正在清理...');
  process.exit(0);
});

// 启动测试
test8CoreFunctions();