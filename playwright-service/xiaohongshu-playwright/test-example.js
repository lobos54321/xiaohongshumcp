/**
 * 小红书 Playwright 服务测试示例
 * 演示如何调用 API
 */

const API_BASE = 'http://localhost:3001';
const USER_ID = 'test-user-' + Date.now();

async function makeRequest(endpoint, data = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  return await response.json();
}

async function testLoginFlow() {
  console.log('=== 测试登录流程 ===\n');

  // 1. 获取二维码
  console.log('1. 获取登录二维码...');
  const qrResult = await makeRequest('/login/qrcode', { userId: USER_ID });

  if (qrResult.success) {
    console.log('✅ 二维码获取成功');
    console.log('   二维码URL:', qrResult.data.qrCodeUrl.substring(0, 50) + '...');
    console.log('\n   请在浏览器中打开以下链接查看二维码：');
    console.log(`   ${qrResult.data.qrCodeUrl}\n`);
  } else {
    console.error('❌ 获取二维码失败:', qrResult.error);
    return;
  }

  // 2. 等待扫码登录（最多2分钟）
  console.log('2. 等待扫码登录（120秒超时）...');
  console.log('   请使用小红书 App 扫描二维码\n');

  const loginResult = await makeRequest('/login/wait', {
    userId: USER_ID,
    timeout: 120000,
  });

  if (loginResult.success && loginResult.data.isLoggedIn) {
    console.log('✅ 登录成功！');
    console.log('   用户名:', loginResult.data.username || '未获取');
  } else {
    console.log('❌ 登录失败或超时');
    return;
  }

  // 3. 检查登录状态
  console.log('\n3. 验证登录状态...');
  const statusResult = await makeRequest('/login/check', { userId: USER_ID });

  if (statusResult.success && statusResult.data.isLoggedIn) {
    console.log('✅ 登录状态确认');
  }

  console.log('\n=== 登录流程测试完成 ===\n');
}

async function testPublishFlow() {
  console.log('=== 测试发布流程 ===\n');

  // 注意：需要先登录，并准备好图片文件
  console.log('⚠️  发布测试需要：');
  console.log('   1. 用户已登录');
  console.log('   2. 准备好图片文件路径');
  console.log('\n示例代码：\n');

  const exampleCode = `
const publishResult = await makeRequest('/publish/images', {
  userId: '${USER_ID}',
  title: '今日份的咖啡☕️',
  content: '在这家咖啡店待了一下午，氛围真的很好~\\n推荐给大家！',
  images: [
    '/path/to/image1.jpg',
    '/path/to/image2.jpg'
  ],
  hashtags: ['咖啡店探店', '北京美食', '打卡'],
  location: '北京三里屯'
});

if (publishResult.success && publishResult.data.success) {
  console.log('✅ 发布成功！');
  console.log('   帖子链接:', publishResult.data.postUrl);
} else {
  console.log('❌ 发布失败:', publishResult.data.error);
}
`;

  console.log(exampleCode);
  console.log('\n=== 发布流程示例结束 ===\n');
}

async function testHealthCheck() {
  console.log('=== 健康检查 ===\n');

  const response = await fetch(`${API_BASE}/health`);
  const result = await response.json();

  console.log('服务状态:', result.status);
  console.log('版本:', result.version);
  console.log('活跃用户:', result.stats.activeContexts);
  console.log('\n');
}

// 运行测试
async function main() {
  console.log('\n🚀 小红书 Playwright 服务测试\n');
  console.log('请确保服务已启动: npm run dev\n');

  try {
    await testHealthCheck();
    await testLoginFlow();
    // await testPublishFlow(); // 取消注释以查看发布示例
  } catch (error) {
    console.error('\n❌ 测试出错:', error.message);
    console.error('\n请检查：');
    console.error('1. 服务是否已启动（npm run dev）');
    console.error('2. 端口 3001 是否可用');
  }
}

main();
