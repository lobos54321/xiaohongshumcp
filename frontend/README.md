# 前端页面说明

## 🎯 主要页面

### ✅ auto-manager.html（推荐使用）
**访问**: `https://your-domain.zeabur.app/auto-manager.html`

**功能**：完整的全自动运营系统
- 登录状态检查
- 产品信息配置
- 自动运营启动
- 实时监控面板
- AI 策略展示

**使用场景**：日常使用的主页面

---

## 🧪 测试页面

### test-api.html
**用途**：测试 Claude API 连通性
**使用**：检查是否有 403 错误或区域限制问题

### test-real-data.html
**用途**：开发测试用

---

## ⚠️ 过时页面（可能删除）

### index.html
旧版智能自动化系统，功能可能不完整。

### login.html
独立登录页面，已集成到 auto-manager.html 中。

### v2.html
版本不明确，可能是开发测试版本。

---

## 📌 推荐使用流程

1. **主入口**: `auto-manager.html`
2. **遇到问题**: 先用 `test-api.html` 诊断
3. **日常运营**: 只使用 `auto-manager.html`

---

## 🎯 访问URL

```
# 主系统
https://xiaohongshu-ai-k8m2.zeabur.app/auto-manager.html

# API 测试
https://xiaohongshu-ai-k8m2.zeabur.app/test-api.html

# 健康检查
https://xiaohongshu-ai-k8m2.zeabur.app/health
```
