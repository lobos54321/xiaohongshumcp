# 如何获取你的小红书 User ID

你的 Supabase UUID 是: `9dee4891-89a6-44ee-8fe8-69097846e97d`

## 方法 1: 从浏览器控制台获取 (推荐)

1. **访问小红书自动化页面**
   ```
   https://xiaohongshu-automation-ai.zeabur.app
   ```

2. **打开浏览器开发者工具**
   - Chrome/Edge: 按 `F12` 或 `Ctrl+Shift+I` (Mac: `Cmd+Option+I`)
   - Firefox: 按 `F12` 或 `Ctrl+Shift+K`

3. **切换到 Console (控制台) 标签**

4. **输入以下代码并按回车**
   ```javascript
   JSON.parse(localStorage.getItem('xhs_user_mappings'))
   ```

5. **复制显示的 User ID**
   - 格式类似: `{"9dee4891-89a6-44ee-8fe8-69097846e97d": "xhs_user_xxxxx"}`
   - 复制冒号后面引号内的值: `xhs_user_xxxxx`

## 方法 2: 从 Network 请求中获取

1. **访问小红书自动化页面并刷新**
   ```
   https://xiaohongshu-automation-ai.zeabur.app
   ```

2. **打开开发者工具的 Network (网络) 标签**
   - 按 `F12` → 切换到 `Network`

3. **在搜索框中输入**: `login/status`

4. **找到请求后点击查看**
   - 查看 **Request** (请求) 部分
   - 找到 `user_id` 字段
   - 复制该值

## 方法 3: 从控制台日志查看

如果你已经在小红书自动化页面，查看控制台日志中的这一行:

```
✅ [XHS] getOrCreateMapping 返回: xhs_user_xxxxx
```

复制 `xhs_user_xxxxx` 这个值。

## 方法 4: 直接查询 Supabase 数据库

如果你有 Supabase 访问权限:

1. **登录 Supabase Dashboard**
   ```
   https://lfjslsygnitdgdnfboiy.supabase.co
   ```

2. **打开 SQL Editor**

3. **运行以下查询**
   ```sql
   SELECT xhs_user_id
   FROM xiaohongshu_user_mappings
   WHERE supabase_uuid = '9dee4891-89a6-44ee-8fe8-69097846e97d';
   ```

4. **复制返回的 `xhs_user_id` 值**

---

## 获取到 User ID 后

将 User ID 填入配置文件:

```bash
cd /Users/boliu/xiaohongshumcp-current
nano claudedocs/agent-test-config.json
```

修改这一行:
```json
{
  "user_id": "xhs_user_xxxxx"  // 👈 粘贴你的 User ID
}
```

保存后运行测试:
```bash
node claudedocs/run-mcp-test.js
```

---

## 快速检查

运行此命令检查配置是否正确:

```bash
cd /Users/boliu/xiaohongshumcp-current
node -e "const config = require('./claudedocs/agent-test-config.json'); console.log('User ID:', config.user_id); if (config.user_id === 'YOUR_USER_ID_HERE') { console.log('❌ 请先配置 User ID'); process.exit(1); } else { console.log('✅ 配置正确'); }"
```
