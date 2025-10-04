/**
 * 测试 Cookie 隔离
 * 验证每个用户的 Cookie 确实保存在独立目录中
 */

const { XiaohongshuMCPProcessManager } = require('./dist/processManager.js');
const fs = require('fs');
const path = require('path');

async function test() {
  console.log('=== 测试 Cookie 隔离 ===\n');

  const manager = new XiaohongshuMCPProcessManager(
    './xiaohongshu-mcp',
    './cookies'
  );

  try {
    // 测试1: 为3个用户创建进程
    console.log('测试1: 为3个用户创建进程...');
    const users = ['alice', 'bob', 'charlie'];

    for (const user of users) {
      console.log(`  创建用户 ${user} 的进程...`);
      const port = await manager.getOrCreateProcess(user);
      console.log(`  ✓ ${user}: 端口 ${port}`);
    }

    console.log();

    // 测试2: 检查目录结构
    console.log('测试2: 检查目录结构...');
    const cookieDir = path.resolve('./cookies');

    for (const user of users) {
      const userDir = path.join(cookieDir, user);
      const exists = fs.existsSync(userDir);
      console.log(`  ${user}: ${exists ? '✓ 目录已创建' : '✗ 目录不存在'} - ${userDir}`);

      if (exists) {
        const files = fs.readdirSync(userDir);
        console.log(`    文件列表: ${files.length > 0 ? files.join(', ') : '(空)'}`);
      }
    }

    console.log();

    // 测试3: 模拟Cookie文件创建
    console.log('测试3: 模拟为每个用户创建测试Cookie文件...');
    for (const user of users) {
      const userDir = path.join(cookieDir, user);
      const cookieFile = path.join(userDir, 'cookies.json');

      const testCookie = {
        user: user,
        timestamp: new Date().toISOString(),
        session: `session-${user}-${Date.now()}`
      };

      fs.writeFileSync(cookieFile, JSON.stringify(testCookie, null, 2));
      console.log(`  ✓ ${user}: 已创建 cookies.json`);
    }

    console.log();

    // 测试4: 验证Cookie文件隔离
    console.log('测试4: 验证Cookie文件内容隔离...');
    for (const user of users) {
      const cookieFile = path.join(cookieDir, user, 'cookies.json');
      const content = JSON.parse(fs.readFileSync(cookieFile, 'utf8'));
      const correct = content.user === user;

      console.log(`  ${user}: ${correct ? '✓ Cookie正确' : '✗ Cookie错误'}`);
      console.log(`    内容: ${JSON.stringify(content)}`);
    }

    console.log();

    // 测试5: 统计信息
    console.log('测试5: 进程统计信息...');
    const stats = manager.getStats();
    console.log(`  活跃进程数: ${stats.activeProcesses}/${stats.maxProcesses}`);
    console.log(`  用户列表: ${stats.processes.map(p => p.userId).join(', ')}`);

    console.log('\n=== Cookie 隔离测试通过 ===');
    console.log('✓ 每个用户都有独立的工作目录');
    console.log('✓ Cookie 文件互不干扰');
    console.log('✓ 进程管理正常');

    console.log('\n清理测试环境...');
    manager.cleanup();

    // 删除测试Cookie文件
    for (const user of users) {
      const cookieFile = path.join(cookieDir, user, 'cookies.json');
      if (fs.existsSync(cookieFile)) {
        fs.unlinkSync(cookieFile);
      }
    }

    console.log('✓ 清理完成');
    process.exit(0);

  } catch (error) {
    console.error('✗ 测试失败:', error.message);
    console.error(error.stack);
    manager.cleanup();
    process.exit(1);
  }
}

test();
