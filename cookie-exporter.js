// Cookie导出脚本 - 在浏览器控制台中运行
// 使用方法：
// 1. 在小红书页面按F12打开控制台
// 2. 粘贴并运行这个脚本
// 3. 复制输出的JSON数组

(async function exportCookies() {
    try {
        // 获取当前页面的所有cookies
        const cookies = await navigator.cookieStore.getAll();

        // 转换为MCP需要的格式
        const mcpCookies = cookies.map(cookie => ({
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain || '.xiaohongshu.com',
            path: cookie.path || '/',
            secure: cookie.secure || false,
            httpOnly: cookie.httpOnly || false,
            expires: cookie.expires ? Math.floor(cookie.expires / 1000) : 0
        }));

        console.log('=== 复制下面的JSON数组 ===');
        console.log(JSON.stringify(mcpCookies, null, 2));
        console.log('=== JSON数组结束 ===');

        // 也输出到剪贴板（如果支持）
        if (navigator.clipboard) {
            await navigator.clipboard.writeText(JSON.stringify(mcpCookies, null, 2));
            console.log('✅ Cookies已复制到剪贴板');
        }

        return mcpCookies;
    } catch (error) {
        console.error('Cookie导出失败:', error);

        // 备用方案：使用document.cookie
        console.log('使用备用方案...');
        const cookieString = document.cookie;
        const cookiePairs = cookieString.split(';');

        const fallbackCookies = cookiePairs.map(pair => {
            const [name, value] = pair.trim().split('=');
            return {
                name: name,
                value: value || '',
                domain: '.xiaohongshu.com',
                path: '/',
                secure: false,
                httpOnly: false,
                expires: 0
            };
        }).filter(cookie => cookie.name);

        console.log('=== 备用方案 - 复制下面的JSON数组 ===');
        console.log(JSON.stringify(fallbackCookies, null, 2));
        console.log('=== JSON数组结束 ===');

        return fallbackCookies;
    }
})();