# Zeabur 环境变量配置

## 必需的环境变量

在 Zeabur 项目设置中配置以下环境变量：

### 1. ANTHROPIC_API_KEY
- **说明**: Claude AI API 密钥，用于生成内容策略和文案
- **值**: `sk-ant-api03-...` (请使用您的实际 Anthropic API 密钥)

### 2. GEMINI_API_KEY
- **说明**: Google Gemini API 密钥，用于生成图片
- **值**: `AIzaSy...` (请使用您的实际 Gemini API 密钥)

### 3. MCP_ROUTER_URL (可选)
- **说明**: MCP Router 服务地址
- **默认值**: `http://localhost:3000`
- **生产环境**: `http://localhost:3000` (同一容器内)

### 4. PORT (可选)
- **说明**: 服务监听端口
- **默认值**: `4000`

### 5. NODE_ENV (可选)
- **说明**: Node.js 运行环境
- **推荐值**: `production`

## 配置步骤

1. 登录 Zeabur 控制台
2. 进入项目 `xiaohongshu-automation`
3. 点击 "Variables" 或 "环境变量" 选项卡
4. 添加以下变量：
   - 键: `ANTHROPIC_API_KEY`
     值: (粘贴您的 Anthropic API 密钥)

   - 键: `GEMINI_API_KEY`
     值: (粘贴您的 Gemini API 密钥)

5. 保存并重新部署

## 验证

部署完成后，检查日志中是否有：
- ✅ `[Claude Agent Service] Server listening on 0.0.0.0:4000`
- ✅ `[Claude Agent Service] MCP Router URL: http://localhost:3000`
- ❌ 不应该有 `Error: ANTHROPIC_API_KEY is required`

## 安全提示

⚠️ **重要**:
- 不要将 API 密钥提交到 Git 仓库
- `.env` 文件已在 `.gitignore` 中
- 仅在 Zeabur 环境变量中配置真实密钥
