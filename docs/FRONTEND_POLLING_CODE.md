# 🎨 前端轮询代码 - 原生 JavaScript

## 📋 修改说明

需要修改 `frontend/auto-manager.html` 中的 `approvePost` 函数。

---

## 🔴 旧代码（同步，会超时）

```javascript
async function approvePost(postId) {
    if (!confirm('确认批准发布此内容？')) {
        return;
    }

    console.log('批准发布:', postId);
    addActivityLog('✅ 正在发布内容到小红书...');

    try {
        const response = await fetch(`${CLAUDE_API}/agent/auto/approve/${currentUser}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId: postId })
        });

        const data = await response.json();

        if (data.success) {
            addActivityLog('✅ 发布成功！');
            // 刷新今日计划
            loadTodayPlan();
        } else {
            addActivityLog('❌ 发布失败: ' + data.error);
            alert('发布失败: ' + data.error);
        }
    } catch (error) {
        console.error('发布错误:', error);
        addActivityLog('❌ 发布失败: ' + error.message);
        alert('发布失败，请重试');
    }
}
```

---

## 🟢 新代码（异步轮询，不会超时）

```javascript
/**
 * 批准发布 - 异步版本（轮询状态）
 * 解决 Zeabur 120 秒超时问题
 */
async function approvePost(postId) {
    if (!confirm('确认批准发布此内容？')) {
        return;
    }

    console.log('🚀 [批准发布] 开始发布:', postId);
    addActivityLog('🚀 正在创建发布作业...');

    try {
        // 1. 提交发布请求，立即返回 jobId
        const response = await fetch(`${CLAUDE_API}/agent/auto/approve/${currentUser}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId: postId })
        });

        const data = await response.json();

        if (!data.success) {
            addActivityLog('❌ 创建发布作业失败: ' + data.error);
            alert('发布失败: ' + data.error);
            return;
        }

        const jobId = data.jobId;
        console.log(`✅ [批准发布] 作业已创建: ${jobId}`);
        addActivityLog('✅ 发布作业已创建，正在后台执行...');

        // 2. 开始轮询作业状态
        await pollPublishStatus(jobId);

    } catch (error) {
        console.error('❌ [批准发布] 错误:', error);
        addActivityLog('❌ 发布失败: ' + error.message);
        alert('发布失败，请重试');
    }
}

/**
 * 轮询发布作业状态
 */
async function pollPublishStatus(jobId) {
    const pollInterval = 3000; // 3 秒轮询一次
    const maxDuration = 600000; // 最多等待 10 分钟
    const startTime = Date.now();

    console.log(`📊 [轮询] 开始轮询作业状态: ${jobId}`);

    while (Date.now() - startTime < maxDuration) {
        try {
            // 查询作业状态
            const response = await fetch(`${CLAUDE_API}/agent/auto/publish-status/${jobId}?userId=${currentUser}`);
            const data = await response.json();

            if (!data.success) {
                console.error('❌ [轮询] 查询失败:', data.error);
                addActivityLog('❌ 查询发布状态失败');
                break;
            }

            const { status, progress, taskTitle, error } = data;
            console.log(`📊 [轮询] 作业 ${jobId}: ${status} (${progress}%)`);

            // 更新 UI 显示进度
            updatePublishProgress(status, progress, taskTitle);

            // 检查作业状态
            if (status === 'completed') {
                console.log(`✅ [轮询] 发布成功！`);
                addActivityLog(`✅ 发布成功: ${taskTitle}`);
                alert('✅ 发布成功！');

                // 刷新今日计划
                loadTodayPlan();
                break;

            } else if (status === 'failed') {
                console.error(`❌ [轮询] 发布失败:`, error);
                addActivityLog(`❌ 发布失败: ${error || '未知错误'}`);
                alert(`发布失败: ${error || '未知错误'}`);
                break;

            } else {
                // pending 或 running，继续轮询
                console.log(`⏳ [轮询] 继续等待... (${progress}%)`);
            }

        } catch (error) {
            console.error('❌ [轮询] 查询错误:', error);
            addActivityLog('⚠️ 查询发布状态时出错');
        }

        // 等待下次轮询
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // 如果超过最大等待时间
    if (Date.now() - startTime >= maxDuration) {
        console.warn('⚠️ [轮询] 超时（10分钟），但发布可能仍在进行');
        addActivityLog('⚠️ 查询超时，请手动刷新查看结果');
        alert('查询超时，发布可能仍在进行中\n请稍后手动刷新查看结果');
    }
}

/**
 * 更新发布进度显示（可选，增强用户体验）
 */
function updatePublishProgress(status, progress, taskTitle) {
    let message = '';
    let emoji = '⏳';

    if (status === 'pending') {
        emoji = '🔄';
        message = '准备发布...';
    } else if (status === 'running') {
        emoji = '🚀';
        if (progress < 10) {
            message = '验证图片...';
        } else if (progress < 40) {
            message = '生成配图...';
        } else if (progress < 50) {
            message = '准备发布...';
        } else if (progress < 100) {
            message = `发布中，预计还需 ${Math.ceil((100 - progress) / 20)} 分钟...`;
        }
    } else if (status === 'completed') {
        emoji = '✅';
        message = '发布成功！';
    } else if (status === 'failed') {
        emoji = '❌';
        message = '发布失败';
    }

    // 更新活动日志（带进度）
    addActivityLog(`${emoji} ${message} (${progress}%)`);

    // 可选：更新专门的进度条UI（如果有）
    // updateProgressBar(progress);
}
```

---

## 📊 可选：添加进度条UI

如果想要更好的视觉效果，可以在 HTML 中添加进度条：

### HTML（在发布按钮附近）

```html
<!-- 发布进度条（初始隐藏） -->
<div id="publishProgressBar" class="hidden mt-4 bg-gray-100 rounded-lg p-4">
    <div class="flex items-center justify-between mb-2">
        <span id="publishProgressText" class="text-sm font-medium text-gray-700">准备发布...</span>
        <span id="publishProgressPercent" class="text-sm font-bold text-blue-600">0%</span>
    </div>
    <div class="w-full bg-gray-200 rounded-full h-2.5">
        <div id="publishProgressFill" class="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style="width: 0%"></div>
    </div>
    <p id="publishProgressHint" class="text-xs text-gray-500 mt-2">预计需要 3-5 分钟...</p>
</div>
```

### JavaScript（增强版 updatePublishProgress）

```javascript
function updatePublishProgress(status, progress, taskTitle) {
    const progressBar = document.getElementById('publishProgressBar');
    const progressText = document.getElementById('publishProgressText');
    const progressPercent = document.getElementById('publishProgressPercent');
    const progressFill = document.getElementById('publishProgressFill');
    const progressHint = document.getElementById('publishProgressHint');

    // 显示进度条
    if (progressBar) {
        progressBar.classList.remove('hidden');
    }

    // 更新进度文本
    let message = '';
    let emoji = '⏳';
    let hint = '';

    if (status === 'pending') {
        emoji = '🔄';
        message = '准备发布...';
        hint = '正在准备发布任务';
    } else if (status === 'running') {
        emoji = '🚀';
        if (progress < 10) {
            message = '验证图片...';
            hint = '检查图片数据';
        } else if (progress < 40) {
            message = '生成配图...';
            hint = '正在生成必要的图片';
        } else if (progress < 50) {
            message = '准备发布...';
            hint = '准备上传到小红书';
        } else if (progress < 100) {
            const remainingMinutes = Math.ceil((100 - progress) / 20);
            message = '发布中...';
            hint = `预计还需 ${remainingMinutes} 分钟`;
        }
    } else if (status === 'completed') {
        emoji = '✅';
        message = '发布成功！';
        hint = '内容已成功发布到小红书';
    } else if (status === 'failed') {
        emoji = '❌';
        message = '发布失败';
        hint = '请查看错误信息';
    }

    // 更新 DOM
    if (progressText) {
        progressText.textContent = `${emoji} ${message}`;
    }
    if (progressPercent) {
        progressPercent.textContent = `${progress}%`;
    }
    if (progressFill) {
        progressFill.style.width = `${progress}%`;
    }
    if (progressHint) {
        progressHint.textContent = hint;
    }

    // 活动日志
    addActivityLog(`${emoji} ${message} (${progress}%)`);

    // 完成后 3 秒隐藏进度条
    if (status === 'completed' || status === 'failed') {
        setTimeout(() => {
            if (progressBar) {
                progressBar.classList.add('hidden');
            }
        }, 3000);
    }
}
```

---

## 🎯 实施步骤

### 1. 备份原文件
```bash
cp /Users/boliu/xiaohongshumcp-new/frontend/auto-manager.html /Users/boliu/xiaohongshumcp-new/frontend/auto-manager.html.backup
```

### 2. 修改 approvePost 函数
打开 `frontend/auto-manager.html`，找到 `approvePost` 函数（约在 1629 行），替换为新代码。

### 3. 添加 pollPublishStatus 函数
在 `approvePost` 函数之后添加 `pollPublishStatus` 和 `updatePublishProgress` 函数。

### 4. （可选）添加进度条 UI
如果需要进度条，在合适的位置添加 HTML 和 CSS。

---

## 🧪 测试方案

### 本地测试
```javascript
// 在浏览器控制台测试
console.log('测试异步发布');
approvePost('0'); // 替换为实际的 taskId
```

### 预期行为
1. **点击批准发布** → 立即返回（< 1 秒）
2. **显示进度** → 0% → 10% → 40% → 50% → 100%
3. **轮询日志** → 每 3 秒打印一次状态
4. **5 分钟后** → 显示"发布成功"

### 不应该看到的
- ❌ 120 秒超时错误
- ❌ "context deadline exceeded"
- ❌ 长时间无响应

---

## 💡 核心优势

### 旧方案（同步）
```
用户体验:
1. 点击发布 → 黑屏等待 5 分钟 ❌
2. 120 秒后 → 超时错误 ❌
3. 不知道发布进度 ❌
```

### 新方案（异步轮询）
```
用户体验:
1. 点击发布 → 立即返回（< 1 秒）✅
2. 实时进度条 → 0% → 100% ✅
3. 5 分钟后 → 发布成功 ✅
4. 完全绕过 Zeabur 120 秒限制 ✅
```

---

## ❓ 常见问题

### Q1: 如果用户刷新页面，轮询会停止吗？
**A**: 会的。但作业会在后台继续执行。用户可以重新打开页面，然后手动刷新查看结果。

**改进方案**：可以将 jobId 保存到 localStorage，页面加载时自动恢复轮询。

### Q2: 轮询间隔多久合适？
**A**: 3 秒是最佳平衡：
- 太快（1 秒）→ 增加服务器压力
- 太慢（10 秒）→ 进度更新不及时
- 3 秒 ✅ → 既友好又不浪费资源

### Q3: 如果网络中断怎么办？
**A**: 轮询会失败，但可以重试。可以添加错误重试逻辑：

```javascript
// 在 pollPublishStatus 的 catch 块中
let retryCount = 0;
const maxRetries = 3;

catch (error) {
    retryCount++;
    if (retryCount < maxRetries) {
        console.log(`⚠️ [轮询] 重试 ${retryCount}/${maxRetries}`);
        continue; // 继续下次轮询
    } else {
        console.error('❌ [轮询] 重试次数耗尽');
        break;
    }
}
```

---

## 🚀 部署后测试清单

- [ ] 点击"批准发布" → 立即返回（< 1 秒）
- [ ] 进度条显示 0% → 10% → ... → 100%
- [ ] 每 3 秒看到控制台轮询日志
- [ ] 5 分钟后显示"发布成功"
- [ ] 刷新页面后任务状态为"已发布"
- [ ] 无 120 秒超时错误

---

**实施后即可解决 Zeabur 120 秒超时问题** ✅
