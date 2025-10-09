// 更简单的Cookie导出方案
// 直接在浏览器控制台粘贴运行

// 方法1: 简单格式导出
function exportSimpleCookies() {
    const cookies = document.cookie.split(';').map(cookie => {
        const [name, value] = cookie.trim().split('=');
        return {
            name: name,
            value: value || '',
            domain: '.xiaohongshu.com',
            path: '/',
            expires: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30天后过期
            httpOnly: false,
            secure: true
        };
    }).filter(cookie => cookie.name);

    console.log('=== 复制这个JSON数组 ===');
    console.log(JSON.stringify(cookies, null, 2));
    console.log('=== 结束 ===');

    return cookies;
}

// 运行导出
exportSimpleCookies();

// 如果上面的方法不工作，试试这个更详细的方法
function exportDetailedCookies() {
    // 获取所有重要的小红书cookies
    const importantCookies = [
        'web_session', 'webId', 'a1', 'websectiga', 'sec_poison_id',
        'xhsTrackerId', 'smidV2', 'gid', 'extra_data'
    ];

    const cookies = [];

    importantCookies.forEach(cookieName => {
        const value = getCookie(cookieName);
        if (value) {
            cookies.push({
                name: cookieName,
                value: value,
                domain: '.xiaohongshu.com',
                path: '/',
                expires: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
                httpOnly: false,
                secure: true
            });
        }
    });

    console.log('=== 重要Cookies JSON数组 ===');
    console.log(JSON.stringify(cookies, null, 2));
    console.log('=== 结束 ===');

    return cookies;
}

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return '';
}

console.log('可用命令:');
console.log('1. exportSimpleCookies() - 导出所有cookies');
console.log('2. exportDetailedCookies() - 只导出重要cookies');