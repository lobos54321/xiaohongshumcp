#!/usr/bin/env node

/**
 * Claude Code Agent MCP 工具自动化测试脚本
 *
 * 用途: 自动测试所有小红书 MCP 工具的功能是否正常
 * 使用方式: node claudedocs/run-mcp-test.js
 */

const fs = require('fs');
const path = require('path');

// 配置文件路径
const CONFIG_PATH = path.join(__dirname, 'agent-test-config.json');

// 工具函数
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const categorizeError = (error) => {
  const errorStr = String(error);
  if (errorStr.includes('not logged in') || errorStr.includes('Cookie')) {
    return 'AUTH_ERROR';
  } else if (errorStr.includes('timeout') || errorStr.includes('网络')) {
    return 'NETWORK_ERROR';
  } else if (errorStr.includes('参数') || errorStr.includes('invalid')) {
    return 'PARAM_ERROR';
  } else if (errorStr.includes('限流') || errorStr.includes('rate limit')) {
    return 'RATE_LIMIT';
  } else {
    return 'UNKNOWN_ERROR';
  }
};

// 读取配置
function loadConfig() {
  try {
    const configData = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(configData);
  } catch (error) {
    console.error('❌ 无法读取配置文件:', CONFIG_PATH);
    console.error('请先创建配置文件并填写正确的 user_id');
    process.exit(1);
  }
}

// 调用 MCP 工具 - 使用实际的后端 API 路径
async function callMCPTool(config, toolName, args) {
  let url, method, body;

  // 🔥 映射 MCP 工具到实际的后端 API 端点
  switch (toolName) {
    case 'check_login_status':
      url = `${config.backend_url}/agent/xiaohongshu/login/status?userId=${encodeURIComponent(config.user_id)}`;
      method = 'GET';
      break;

    case 'user_profile':
      url = `${config.backend_url}/agent/xiaohongshu/user-profile`;
      method = 'POST';
      body = { userId: config.user_id };
      break;

    case 'list_feeds':
      url = `${config.backend_url}/agent/xiaohongshu/list-feeds`;
      method = 'POST';
      body = { userId: config.user_id };
      break;

    case 'search_feeds':
      url = `${config.backend_url}/agent/xiaohongshu/search`;
      method = 'POST';
      body = { userId: config.user_id, keyword: args.keyword, sort: args.sort || 'general' };
      break;

    case 'get_feed_detail':
      url = `${config.backend_url}/agent/xiaohongshu/feed-detail`;
      method = 'POST';
      body = { userId: config.user_id, feedId: args.feed_id };
      break;

    case 'like_feed':
      url = `${config.backend_url}/agent/xiaohongshu/like`;
      method = 'POST';
      body = { userId: config.user_id, feedId: args.feed_id };
      break;

    case 'favorite_feed':
      url = `${config.backend_url}/agent/xiaohongshu/favorite`;
      method = 'POST';
      body = { userId: config.user_id, feedId: args.feed_id };
      break;

    case 'post_comment_to_feed':
      url = `${config.backend_url}/agent/xiaohongshu/comment`;
      method = 'POST';
      body = { userId: config.user_id, feedId: args.feed_id, content: args.content };
      break;

    case 'publish_with_video':
      url = `${config.backend_url}/agent/xiaohongshu/publish-video`;
      method = 'POST';
      body = { userId: config.user_id, ...args };
      break;

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }

  console.log(`  📤 请求: ${method} ${url}`);
  if (body) {
    console.log(`  📦 Body:`, JSON.stringify(body, null, 2));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    config.test_settings.timeout_seconds * 1000
  );

  try {
    const fetchOptions = {
      method,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(config.auth_token && { 'Authorization': `Bearer ${config.auth_token}` })
      }
    };

    if (body) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${response.statusText}${errorText ? ' - ' + errorText : ''}`);
    }

    const result = await response.json();
    console.log(`  📥 响应:`, JSON.stringify(result, null, 2).substring(0, 500) + '...');

    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// 重试包装器
async function retryWrapper(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      const errorType = categorizeError(error.message);

      // 认证错误和参数错误不重试
      if (errorType === 'AUTH_ERROR' || errorType === 'PARAM_ERROR') {
        throw error;
      }

      // 最后一次尝试失败则抛出
      if (i === maxRetries - 1) {
        throw error;
      }

      // 指数退避
      const delayMs = Math.pow(2, i) * 1000;
      console.log(`  ⚠️  测试失败，${delayMs/1000}秒后重试 (${i+1}/${maxRetries})`);
      await delay(delayMs);
    }
  }
}

// 单个工具测试
async function testTool(config, toolName, params) {
  const startTime = Date.now();
  console.log(`\n🧪 开始测试: ${toolName}`);

  try {
    const result = await retryWrapper(
      () => callMCPTool(config, toolName, params),
      config.test_settings.retry_count
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (!result.success) {
      throw new Error(result.error || result.message || '未知错误');
    }

    console.log(`  ✅ 测试通过 (耗时: ${duration}s)`);

    return {
      success: true,
      data: result.data,
      duration: parseFloat(duration)
    };

  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`  ❌ 测试失败 (耗时: ${duration}s)`);
    console.error(`  📛 错误信息: ${error.message}`);

    return {
      success: false,
      error: error.message,
      errorType: categorizeError(error.message),
      duration: parseFloat(duration)
    };
  }
}

// 完整测试序列
async function runCompleteTest() {
  const config = loadConfig();
  const results = {};
  const startTime = Date.now();

  console.log('\n🚀 Claude Code Agent 自动化测试开始');
  console.log('📝 配置信息:');
  console.log(`  - 环境: ${config.environment}`);
  console.log(`  - Backend: ${config.backend_url}`);
  console.log(`  - User ID: ${config.user_id}`);
  console.log(`  - 超时时间: ${config.test_settings.timeout_seconds}s`);
  console.log(`  - 重试次数: ${config.test_settings.retry_count}`);
  console.log(`  - 测试间隔: ${config.test_settings.delay_between_tests_ms}ms`);

  // 验证配置
  if (config.user_id === 'YOUR_USER_ID_HERE') {
    console.error('\n❌ 错误: 请在配置文件中填写正确的 user_id');
    process.exit(1);
  }

  // Phase 0: 验证登录状态
  console.log('\n📋 Phase 0: 验证登录状态');
  results.login_check = await testTool(config, 'check_login_status', {});

  if (!results.login_check.success || !results.login_check.data?.logged_in) {
    console.error('\n❌ 错误: 用户未登录或 Cookie 已过期');
    console.error('请先访问平台完成登录: ' + config.backend_url);
    process.exit(1);
  }

  console.log('  ✅ 登录状态正常，继续测试...');
  await delay(config.test_settings.delay_between_tests_ms);

  // Phase 1: 独立工具
  console.log('\n📋 Phase 1: 测试独立工具');

  results.user_profile = await testTool(config, 'user_profile', {});
  await delay(config.test_settings.delay_between_tests_ms);

  // Phase 2: 信息获取
  console.log('\n📋 Phase 2: 测试信息获取');

  results.list_feeds = await testTool(config, 'list_feeds', {});
  await delay(config.test_settings.delay_between_tests_ms);

  results.search_feeds = await testTool(config, 'search_feeds', {
    keyword: config.test_data.search_keyword,
    sort: 'general'
  });
  await delay(config.test_settings.delay_between_tests_ms);

  // Phase 3: 获取详情
  console.log('\n📋 Phase 3: 测试详情查询');

  // 从搜索结果或首页动态中获取 feed_id
  let feedId = null;
  let feedSource = null;

  if (results.search_feeds.success && results.search_feeds.data?.feeds?.length > 0) {
    feedId = results.search_feeds.data.feeds[0].id;
    feedSource = 'search_feeds';
    console.log(`  📌 使用搜索结果中的 feed_id: ${feedId}`);
  } else if (results.list_feeds.success && results.list_feeds.data?.feeds?.length > 0) {
    feedId = results.list_feeds.data.feeds[0].id;
    feedSource = 'list_feeds';
    console.log(`  📌 使用首页动态中的 feed_id: ${feedId}`);
  }

  if (!feedId) {
    console.error('  ❌ 无法获取 feed_id，跳过后续互动测试');
    results.get_feed_detail = { success: false, error: 'No feed_id available', skipped: true };
    results.like_feed = { success: false, error: 'No feed_id available', skipped: true };
    results.favorite_feed = { success: false, error: 'No feed_id available', skipped: true };
    results.post_comment = { success: false, error: 'No feed_id available', skipped: true };
  } else {
    results.get_feed_detail = await testTool(config, 'get_feed_detail', {
      feed_id: feedId
    });
    await delay(config.test_settings.delay_between_tests_ms);

    // Phase 4: 互动操作
    console.log('\n📋 Phase 4: 测试互动操作');

    results.like_feed = await testTool(config, 'like_feed', {
      feed_id: feedId
    });
    await delay(config.test_settings.delay_between_tests_ms);

    results.favorite_feed = await testTool(config, 'favorite_feed', {
      feed_id: feedId
    });
    await delay(config.test_settings.delay_between_tests_ms);

    results.post_comment = await testTool(config, 'post_comment_to_feed', {
      feed_id: feedId,
      content: config.test_data.comment_text
    });
    await delay(config.test_settings.delay_between_tests_ms);
  }

  // Phase 5: 高级功能 (跳过)
  console.log('\n📋 Phase 5: 高级功能');
  console.log('  ⏭️  publish_with_video 需要视频文件，暂时跳过');
  results.publish_with_video = { success: false, skipped: true, reason: '需要视频文件' };

  // 计算总耗时
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);

  // 生成测试报告
  console.log('\n📄 生成测试报告...');
  const report = generateReport(config, results, totalDuration, feedId, feedSource);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const reportPath = path.join(__dirname, `agent-test-report-${timestamp}.md`);
  fs.writeFileSync(reportPath, report, 'utf-8');

  console.log(`  ✅ 报告已保存: ${reportPath}`);

  // 输出摘要
  console.log('\n' + '='.repeat(60));
  console.log('📊 测试摘要');
  console.log('='.repeat(60));

  const stats = calculateStats(results);
  console.log(`✅ 成功: ${stats.success}/${stats.total}`);
  console.log(`❌ 失败: ${stats.failed}/${stats.total}`);
  console.log(`⏭️  跳过: ${stats.skipped}/${stats.total}`);
  console.log(`⏱️  总耗时: ${totalDuration}s`);

  if (stats.failed > 0) {
    console.log('\n⚠️  存在失败的测试，详情请查看报告文件');
  } else if (stats.success === stats.total - stats.skipped) {
    console.log('\n🎉 所有测试通过！');
  }

  console.log('='.repeat(60));

  return results;
}

// 统计结果
function calculateStats(results) {
  const stats = { total: 0, success: 0, failed: 0, skipped: 0 };

  for (const [key, result] of Object.entries(results)) {
    if (key === 'login_check') continue; // 跳过登录检查

    stats.total++;
    if (result.skipped) {
      stats.skipped++;
    } else if (result.success) {
      stats.success++;
    } else {
      stats.failed++;
    }
  }

  return stats;
}

// 生成 Markdown 报告
function generateReport(config, results, totalDuration, feedId, feedSource) {
  const timestamp = new Date().toISOString();
  const stats = calculateStats(results);

  let report = `# MCP 工具自动化测试报告

**测试时间**: ${timestamp}
**测试环境**: ${config.environment} (${config.backend_url})
**用户ID**: ${config.user_id}
**总耗时**: ${totalDuration}s

## 测试摘要

- ✅ 成功: ${stats.success}/${stats.total}
- ❌ 失败: ${stats.failed}/${stats.total}
- ⏭️  跳过: ${stats.skipped}/${stats.total}

## 详细结果

`;

  // Phase 0
  report += `### Phase 0: 登录状态验证\n\n`;
  report += formatToolResult('check_login_status', results.login_check);

  // Phase 1
  report += `\n### Phase 1: 独立工具\n\n`;
  report += formatToolResult('user_profile', results.user_profile);

  // Phase 2
  report += `\n### Phase 2: 信息获取\n\n`;
  report += formatToolResult('list_feeds', results.list_feeds);
  report += formatToolResult('search_feeds', results.search_feeds);

  // Phase 3
  report += `\n### Phase 3: 详情查询\n\n`;
  if (feedId) {
    report += `**使用的 feed_id**: \`${feedId}\` (来源: ${feedSource})\n\n`;
  }
  report += formatToolResult('get_feed_detail', results.get_feed_detail);

  // Phase 4
  report += `\n### Phase 4: 互动操作\n\n`;
  report += formatToolResult('like_feed', results.like_feed);
  report += formatToolResult('favorite_feed', results.favorite_feed);
  report += formatToolResult('post_comment_to_feed', results.post_comment);

  // Phase 5
  report += `\n### Phase 5: 高级功能\n\n`;
  report += formatToolResult('publish_with_video', results.publish_with_video);

  // 问题汇总
  const errors = collectErrors(results);
  if (errors.length > 0) {
    report += `\n## 问题汇总\n\n`;
    errors.forEach((err, idx) => {
      report += `${idx + 1}. **${err.tool}** (${err.errorType}): ${err.error}\n`;
    });
  }

  // 建议
  report += `\n## 建议\n\n`;
  if (stats.failed === 0 && stats.skipped <= 1) {
    report += `✅ 所有测试通过！系统运行正常。\n\n`;
  } else {
    report += generateRecommendations(results, errors);
  }

  report += `\n---\n\n*报告由 Claude Code Agent 自动生成*\n`;

  return report;
}

// 格式化单个工具结果
function formatToolResult(toolName, result) {
  if (!result) {
    return `#### ⚠️ ${toolName}\n- **状态**: 未执行\n\n`;
  }

  let output = `#### `;

  if (result.skipped) {
    output += `⏭️ ${toolName}\n`;
    output += `- **状态**: 跳过\n`;
    output += `- **原因**: ${result.reason || result.error || '未提供原因'}\n\n`;
    return output;
  }

  if (result.success) {
    output += `✅ ${toolName}\n`;
    output += `- **状态**: 通过\n`;
    output += `- **耗时**: ${result.duration}s\n`;

    // 显示部分数据
    if (result.data) {
      output += `- **返回数据**:\n\`\`\`json\n${JSON.stringify(result.data, null, 2).substring(0, 500)}...\n\`\`\`\n\n`;
    }
  } else {
    output += `❌ ${toolName}\n`;
    output += `- **状态**: 失败\n`;
    output += `- **耗时**: ${result.duration}s\n`;
    output += `- **错误类型**: ${result.errorType}\n`;
    output += `- **错误信息**: ${result.error}\n\n`;
  }

  return output;
}

// 收集错误
function collectErrors(results) {
  const errors = [];
  for (const [tool, result] of Object.entries(results)) {
    if (result && !result.success && !result.skipped) {
      errors.push({
        tool,
        error: result.error,
        errorType: result.errorType
      });
    }
  }
  return errors;
}

// 生成建议
function generateRecommendations(results, errors) {
  let recommendations = '';

  const errorTypes = errors.map(e => e.errorType);

  if (errorTypes.includes('AUTH_ERROR')) {
    recommendations += `- 🔑 **认证问题**: Cookie 可能已过期，请重新登录\n`;
  }

  if (errorTypes.includes('NETWORK_ERROR')) {
    recommendations += `- 🌐 **网络问题**: 增加超时时间或检查网络连接\n`;
  }

  if (errorTypes.includes('RATE_LIMIT')) {
    recommendations += `- ⏱️  **限流问题**: 增加测试间隔时间 (建议 5-10 秒)\n`;
  }

  if (errorTypes.includes('PARAM_ERROR')) {
    recommendations += `- 📝 **参数问题**: 检查测试数据配置是否正确\n`;
  }

  if (recommendations === '') {
    recommendations += `- 检查后端日志获取更多错误信息\n`;
    recommendations += `- 尝试手动测试失败的工具\n`;
  }

  return recommendations + '\n';
}

// 主函数
async function main() {
  try {
    await runCompleteTest();
    process.exit(0);
  } catch (error) {
    console.error('\n💥 测试执行出错:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 执行
if (require.main === module) {
  main();
}

module.exports = { runCompleteTest, callMCPTool };
