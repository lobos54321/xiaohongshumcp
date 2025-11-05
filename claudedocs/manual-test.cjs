#!/usr/bin/env node

/**
 * 手动交互式 MCP 工具测试
 *
 * 使用方法：node claudedocs/manual-test.cjs
 * 然后按照提示输入命令
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');

// 配置
const CONFIG_PATH = path.join(__dirname, 'agent-test-config.json');
let config;

try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
} catch (error) {
  console.error('❌ 无法读取配置文件:', CONFIG_PATH);
  process.exit(1);
}

// 创建命令行界面
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 存储上次测试获取的 feed_id
let lastFeedId = null;

// 调用 API
async function callAPI(url, method, body) {
  const fetchOptions = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(config.auth_token && { 'Authorization': `Bearer ${config.auth_token}` })
    }
  };

  if (body) {
    fetchOptions.body = JSON.stringify(body);
  }

  console.log(`\n📤 请求: ${method} ${url}`);
  if (body) {
    console.log(`📦 参数:`, JSON.stringify(body, null, 2));
  }

  const startTime = Date.now();

  try {
    const response = await fetch(url, fetchOptions);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${response.statusText}${errorText ? '\n' + errorText : ''}`);
    }

    const result = await response.json();
    console.log(`✅ 成功 (耗时: ${duration}s)`);
    console.log(`📥 响应:`, JSON.stringify(result, null, 2));

    return result;
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`❌ 失败 (耗时: ${duration}s)`);
    console.error(`📛 错误:`, error.message);
    return null;
  }
}

// 测试命令
const commands = {
  // 1. 登录状态
  'login': {
    desc: '检查登录状态',
    async run() {
      const url = `${config.backend_url}/agent/xiaohongshu/login/status?userId=${encodeURIComponent(config.user_id)}`;
      await callAPI(url, 'GET', null);
    }
  },

  // 2. 用户资料
  'profile': {
    desc: '获取用户资料',
    async run() {
      const url = `${config.backend_url}/agent/xiaohongshu/user-profile`;
      await callAPI(url, 'POST', { userId: config.user_id });
    }
  },

  // 3. 首页动态
  'feeds': {
    desc: '获取首页动态',
    async run() {
      const url = `${config.backend_url}/agent/xiaohongshu/list-feeds`;
      const result = await callAPI(url, 'POST', { userId: config.user_id });

      // 提取第一个 feed_id
      if (result?.success && result.data?.content) {
        try {
          const data = typeof result.data.content === 'string'
            ? JSON.parse(result.data.content)
            : result.data.content;

          if (data.feeds && data.feeds.length > 0) {
            lastFeedId = data.feeds[0].id;
            console.log(`\n💡 提示: 已保存 feed_id = ${lastFeedId}，可用于后续测试`);
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
  },

  // 4. 搜索
  'search': {
    desc: '搜索内容 (需要关键词)',
    async run(keyword) {
      if (!keyword) {
        console.error('❌ 请提供搜索关键词，例如: search 美食');
        return;
      }

      const url = `${config.backend_url}/agent/xiaohongshu/search`;
      const result = await callAPI(url, 'POST', {
        userId: config.user_id,
        keyword,
        sort: 'general'
      });

      // 提取第一个 feed_id
      if (result?.success && result.data?.content) {
        try {
          const data = typeof result.data.content === 'string'
            ? JSON.parse(result.data.content)
            : result.data.content;

          if (data.feeds && data.feeds.length > 0) {
            lastFeedId = data.feeds[0].id;
            console.log(`\n💡 提示: 已保存 feed_id = ${lastFeedId}，可用于后续测试`);
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
  },

  // 5. 内容详情
  'detail': {
    desc: '获取内容详情 (需要 feed_id，或使用上次保存的)',
    async run(feedId) {
      const targetFeedId = feedId || lastFeedId;

      if (!targetFeedId) {
        console.error('❌ 请提供 feed_id，例如: detail 12345');
        console.error('   或先运行 feeds 或 search 命令获取 feed_id');
        return;
      }

      const url = `${config.backend_url}/agent/xiaohongshu/feed-detail`;
      await callAPI(url, 'POST', {
        userId: config.user_id,
        feedId: targetFeedId
      });
    }
  },

  // 6. 点赞
  'like': {
    desc: '点赞内容 (需要 feed_id，或使用上次保存的)',
    async run(feedId) {
      const targetFeedId = feedId || lastFeedId;

      if (!targetFeedId) {
        console.error('❌ 请提供 feed_id，例如: like 12345');
        console.error('   或先运行 feeds 或 search 命令获取 feed_id');
        return;
      }

      const url = `${config.backend_url}/agent/xiaohongshu/like`;
      await callAPI(url, 'POST', {
        userId: config.user_id,
        feedId: targetFeedId
      });
    }
  },

  // 7. 收藏
  'favorite': {
    desc: '收藏内容 (需要 feed_id，或使用上次保存的)',
    async run(feedId) {
      const targetFeedId = feedId || lastFeedId;

      if (!targetFeedId) {
        console.error('❌ 请提供 feed_id，例如: favorite 12345');
        console.error('   或先运行 feeds 或 search 命令获取 feed_id');
        return;
      }

      const url = `${config.backend_url}/agent/xiaohongshu/favorite`;
      await callAPI(url, 'POST', {
        userId: config.user_id,
        feedId: targetFeedId
      });
    }
  },

  // 8. 评论
  'comment': {
    desc: '发表评论 (需要 feed_id 和评论内容)',
    async run(arg1, ...rest) {
      let targetFeedId, content;

      // 如果只有一个参数，认为是评论内容，使用保存的 feed_id
      if (!rest || rest.length === 0) {
        targetFeedId = lastFeedId;
        content = arg1;
      } else {
        // 如果有多个参数，第一个是 feed_id，其余是评论内容
        targetFeedId = arg1;
        content = rest.join(' ');
      }

      if (!targetFeedId) {
        console.error('❌ 请提供 feed_id 和评论内容');
        console.error('   例如: comment 很棒的分享！');
        console.error('   或: comment 12345 很棒的分享！');
        return;
      }

      if (!content) {
        console.error('❌ 请提供评论内容');
        console.error('   例如: comment 很棒的分享！');
        return;
      }

      const url = `${config.backend_url}/agent/xiaohongshu/comment`;
      await callAPI(url, 'POST', {
        userId: config.user_id,
        feedId: targetFeedId,
        content
      });
    }
  },

  // 帮助
  'help': {
    desc: '显示帮助信息',
    async run() {
      console.log('\n📖 可用命令:\n');
      for (const [cmd, info] of Object.entries(commands)) {
        console.log(`  ${cmd.padEnd(12)} - ${info.desc}`);
      }
      console.log('\n  exit        - 退出程序');
      console.log('\n💡 提示:');
      console.log('  - 运行 feeds 或 search 会自动保存第一个 feed_id');
      console.log('  - 后续命令可以直接使用保存的 feed_id');
      console.log('  - 每个操作限制2秒间隔，避免触发限流');
      console.log('');
    }
  },

  // 退出
  'exit': {
    desc: '退出程序',
    async run() {
      console.log('\n👋 再见！');
      rl.close();
      process.exit(0);
    }
  }
};

// 处理命令
async function handleCommand(input) {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  if (!cmd) {
    return;
  }

  const command = commands[cmd];

  if (!command) {
    console.error(`❌ 未知命令: ${cmd}`);
    console.log('输入 help 查看可用命令');
    return;
  }

  try {
    await command.run(...args);
  } catch (error) {
    console.error('❌ 命令执行出错:', error.message);
  }
}

// 主循环
function prompt() {
  const feedInfo = lastFeedId ? ` (feed_id: ${lastFeedId})` : '';
  rl.question(`\n🔧 请输入命令${feedInfo}> `, async (input) => {
    await handleCommand(input);
    prompt();
  });
}

// 启动
console.log('🚀 MCP 工具手动测试 - 交互模式');
console.log('='.repeat(60));
console.log(`📝 配置信息:`);
console.log(`  - Backend: ${config.backend_url}`);
console.log(`  - User ID: ${config.user_id}`);
console.log('='.repeat(60));
console.log('\n输入 help 查看可用命令\n');

prompt();
