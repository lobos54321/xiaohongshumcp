#!/bin/bash
# 自动创建并推送 Playwright 服务到 GitHub
# 在你的本地Mac/Linux电脑运行此脚本

set -e  # 遇到错误立即退出

echo "🚀 开始设置 xiaohongshuplaywright 仓库..."

# 1. 克隆新仓库
echo ""
echo "📦 步骤 1/3: 克隆新仓库..."
rm -rf xiaohongshuplaywright 2>/dev/null || true
git clone https://github.com/lobos54321/xiaohongshuplaywright.git
cd xiaohongshuplaywright

# 2. 创建目录结构
echo "📁 步骤 2/3: 创建文件..."
mkdir -p src

# 创建 package.json
cat > package.json << 'EOF'
{
  "name": "xiaohongshu-playwright",
  "version": "1.0.0",
  "description": "小红书自动化服务 - 基于 Playwright",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest"
  },
  "dependencies": {
    "playwright": "^1.48.0",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/node": "^20.10.0",
    "typescript": "^5.3.0",
    "tsx": "^4.7.0",
    "vitest": "^1.0.0"
  }
}
EOF

# 创建 tsconfig.json
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF

# 创建 .gitignore
cat > .gitignore << 'EOF'
node_modules/
dist/
data/
*.log
.env
.DS_Store
.vscode/
playwright-report/
test-results/
EOF

# 创建 .env.example
cat > .env.example << 'EOF'
# 服务端口
PORT=3001

# 是否使用无头模式（true=无头，false=显示浏览器窗口）
HEADLESS=true

# Cookie 存储目录
COOKIES_DIR=./data/cookies

# 用户数据目录
USER_DATA_DIR=./data/user-data
EOF

# 创建 README.md
cat > README.md << 'EOFREADME'
# 小红书 Playwright 自动化服务

基于 Playwright 的小红书自动化服务，提供稳定可靠的登录、发布等功能。

## ✨ 特性

- ✅ **稳定可靠** - 基于微软 Playwright，成熟稳定
- ✅ **多用户隔离** - 每个用户独立的浏览器上下文和 Cookie
- ✅ **全 TypeScript** - 类型安全，易于调试
- ✅ **REST API** - 标准 HTTP 接口，易于集成
- ✅ **无头模式** - 支持服务器环境运行
- ✅ **反检测** - 内置反爬虫检测脚本

## 🚀 快速开始

### 1. 安装依赖

\`\`\`bash
npm install
\`\`\`

### 2. 安装 Playwright 浏览器

\`\`\`bash
npx playwright install chromium
\`\`\`

### 3. 启动服务

\`\`\`bash
# 开发模式（带热更新）
npm run dev

# 生产模式
npm run build
npm start
\`\`\`

服务将在 \`http://localhost:3001\` 启动。

## 📡 API 文档

详见 [API 文档](./docs/API.md)

## 🔗 相关仓库

- 后端服务: [xiaohongshumcp](https://github.com/lobos54321/xiaohongshumcp)
- 前端平台: [prome-platform](https://github.com/lobos54321/prome-platform)

## 📄 许可证

MIT
EOFREADME

echo "✅ 基本文件创建完成"
echo ""
echo "⚠️  由于源代码文件较大，请访问以下链接下载完整源代码："
echo "   https://github.com/lobos54321/xiaohongshumcp/tree/claude/xiaohongshu-mcp-review-011CV31nG34ZPUMbe4iYKRD5/playwright-service/xiaohongshu-playwright"
echo ""
echo "或者等待我提供完整的文件内容..."

# 3. 提交并推送
echo "📤 步骤 3/3: 提交并推送..."
git add -A
git commit -m "feat: Initial commit - Playwright service setup

Basic project structure created.
Source code files to be added."

git push origin main

echo ""
echo "✅ 仓库创建成功！"
echo "📍 访问: https://github.com/lobos54321/xiaohongshuplaywright"
echo ""
echo "⏭️  下一步: 我会帮你添加完整的源代码文件"
