process.env.COOKIE_ENCRYPTION_KEY = '4WU7H8Vb36M2NJ90BaR5fSGPKxAmgCo1_ENCRYPT';

import { CookieManager } from './dist/cookieManager.js';

const cookieManager = new CookieManager();
const userId = 'user_9dee489189a644ee8fe869097846e97d_prome';

const cookies = await cookieManager.getCookies(userId);

if (!cookies || cookies.length === 0) {
    console.log('❌ No cookies found');
} else {
    console.log(`✅ Found ${cookies.length} cookies`);
    console.log('\n🔍 Cookie domains:');
    cookies.forEach(c => {
        console.log(`  - ${c.name}: domain=${c.domain}, secure=${c.secure}, httpOnly=${c.httpOnly}, sameSite=${c.sameSite}`);
    });

    const hasCreatorDomain = cookies.some(c => c.domain.includes('creator'));
    console.log(`\n${hasCreatorDomain ? '✅' : '❌'} Has creator.xiaohongshu.com domain: ${hasCreatorDomain}`);

    const webSession = cookies.find(c => c.name === 'web_session');
    const a1 = cookies.find(c => c.name === 'a1');
    console.log(`\n✅ Has web_session: ${!!webSession}`);
    console.log(`✅ Has a1: ${!!a1}`);
}
