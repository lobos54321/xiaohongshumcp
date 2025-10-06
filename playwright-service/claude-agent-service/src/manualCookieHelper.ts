/**
 * 手动Cookie提取助手
 * 当用户在系统浏览器中完成登录后，帮助提取Cookie
 */

export const COOKIE_EXTRACTION_GUIDE = `
在浏览器中完成小红书登录后，请按照以下步骤提取Cookie：

1. 在小红书页面按 F12 打开开发者工具
2. 切换到 "Application" 或 "应用" 标签页
3. 在左侧展开 "Storage" → "Cookies" → "https://www.xiaohongshu.com"
4. 复制所有Cookie的 Name 和 Value
5. 或者在 Console 标签页运行以下代码：

document.cookie.split(';').map(c => {
  const [name, value] = c.trim().split('=');
  return { name, value, domain: '.xiaohongshu.com', path: '/' };
})

然后将结果发送到确认登录API端点。
`;

export class ManualCookieHelper {
  /**
   * 解析浏览器Cookie字符串
   */
  static parseCookieString(cookieString: string) {
    return cookieString.split(';').map(cookie => {
      const [name, value] = cookie.trim().split('=');
      return {
        name: name?.trim() || '',
        value: value?.trim() || '',
        domain: '.xiaohongshu.com',
        path: '/'
      };
    }).filter(cookie => cookie.name && cookie.value);
  }

  /**
   * 验证Cookie是否有效
   */
  static validateCookies(cookies: any[]) {
    const requiredCookies = ['a1', 'web_session'];
    const presentCookies = cookies.map(c => c.name);

    return requiredCookies.some(required =>
      presentCookies.includes(required)
    );
  }
}