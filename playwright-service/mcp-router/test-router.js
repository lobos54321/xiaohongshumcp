/**
 * 测试 MCP Router 的进程管理功能
 */

const { XiaohongshuMCPProcessManager } = require('./dist/processManager.js');

async function test() {
  console.log('=== 测试 MCP Router ===\n');

  const manager = new XiaohongshuMCPProcessManager(
    './xiaohongshu-mcp',
    './cookies'
  );

  try {
    // 测试1: 为用户A创建进程
    console.log('测试1: 为用户A创建进程...');
    const portA = await manager.getOrCreateProcess('user-a');
    console.log(`✓ 用户A的进程端口: ${portA}\n`);

    // 测试2: 再次获取用户A的进程（应该复用）
    console.log('测试2: 再次获取用户A的进程（应该复用）...');
    const portA2 = await manager.getOrCreateProcess('user-a');
    console.log(`✓ 用户A的进程端口: ${portA2} (${portA === portA2 ? '复用成功' : '错误：创建了新进程'})\n`);

    // 测试3: 为用户B创建进程
    console.log('测试3: 为用户B创建进程...');
    const portB = await manager.getOrCreateProcess('user-b');
    console.log(`✓ 用户B的进程端口: ${portB}\n`);

    // 测试4: 调用工具 - 检查登录状态
    console.log('测试4: 调用用户A的登录状态API...');
    const result = await manager.callTool('user-a', '/api/v1/login/status', 'GET');
    console.log('✓ API调用结果:', JSON.stringify(result, null, 2), '\n');

    // 测试5: 查看统计信息
    console.log('测试5: 查看统计信息...');
    const stats = manager.getStats();
    console.log('✓ 统计信息:', JSON.stringify(stats, null, 2), '\n');

    console.log('=== 所有测试通过 ===');
    console.log('\n按 Ctrl+C 退出...');

  } catch (error) {
    console.error('✗ 测试失败:', error.message);
    console.error(error.stack);
    manager.cleanup();
    process.exit(1);
  }

  // 等待用户手动退出
  process.on('SIGINT', () => {
    console.log('\n正在清理...');
    manager.cleanup();
    process.exit(0);
  });
}

test();
