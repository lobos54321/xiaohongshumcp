#!/usr/bin/env node

/**
 * 获取小红书 User ID 的辅助脚本
 * 从 Supabase 查询用户映射
 */

const SUPABASE_UUID = '9dee4891-89a6-44ee-8fe8-69097846e97d';
const BACKEND_URL = 'https://xiaohongshu-automation-ai.zeabur.app';

async function getUserId() {
  console.log('\n🔍 正在查询小红书 User ID...\n');
  console.log('Supabase UUID:', SUPABASE_UUID);
  console.log('Backend URL:', BACKEND_URL);
  
  try {
    // 方法1: 通过 backend API 的用户映射服务
    const url = `${BACKEND_URL}/api/xiaohongshu/user-mapping`;
    
    console.log('\n📤 发送请求到:', url);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        supabase_uuid: SUPABASE_UUID
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('\n📥 响应:', JSON.stringify(result, null, 2));

    if (result.success && result.data?.xhs_user_id) {
      const xhsUserId = result.data.xhs_user_id;
      console.log('\n✅ 成功获取 User ID!');
      console.log('\n' + '='.repeat(60));
      console.log('🎯 你的小红书 User ID:');
      console.log('='.repeat(60));
      console.log(xhsUserId);
      console.log('='.repeat(60));
      
      console.log('\n📝 请复制上面的 User ID，然后执行:');
      console.log('\n  nano claudedocs/agent-test-config.json\n');
      console.log('将 "YOUR_USER_ID_HERE" 替换为上面的 User ID');
      
      return xhsUserId;
    } else {
      console.error('\n❌ 未能获取 User ID');
      console.error('响应数据:', result);
    }

  } catch (error) {
    console.error('\n❌ 请求失败:', error.message);
    console.error('\n💡 备用方法:');
    console.error('1. 访问 https://xiaohongshu-automation-ai.zeabur.app');
    console.error('2. 打开浏览器开发者工具 (F12)');
    console.error('3. Console 中运行: JSON.parse(localStorage.getItem("xhs_user_mappings"))');
    console.error('4. 复制显示的 User ID');
  }
}

getUserId();
