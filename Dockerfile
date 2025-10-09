# 使用Node.js 18作为基础镜像
FROM node:18-slim

# 安装必要的系统依赖，包括Chromium用于QR登录
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    ca-certificates \
    python3 \
    procps \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libwayland-client0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    libu2f-udev \
    libvulkan1 \
    && rm -rf /var/lib/apt/lists/*

# 设置Chromium环境变量（关键：解决QR登录问题）
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV ROD_BROWSER_BIN=/usr/bin/chromium
ENV CHROMIUM_NO_SANDBOX=true

# 设置工作目录
WORKDIR /app

# 第一步：创建目录结构并复制package.json文件
RUN mkdir -p playwright-service/mcp-router playwright-service/claude-agent-service

# 复制package.json文件
COPY package*.json ./
COPY playwright-service/mcp-router/package*.json ./playwright-service/mcp-router/
COPY playwright-service/claude-agent-service/package*.json ./playwright-service/claude-agent-service/

# 第二步：安装所有依赖（包括devDependencies用于构建）
WORKDIR /app/playwright-service/mcp-router
RUN npm install

WORKDIR /app/playwright-service/claude-agent-service
RUN npm install

# 回到根目录
WORKDIR /app

# 第三步：复制所有源代码
COPY . .

# 第四步：构建TypeScript项目
WORKDIR /app/playwright-service/mcp-router
RUN npm run build

WORKDIR /app/playwright-service/claude-agent-service
RUN npm run build

# 第五步：清理devDependencies减小镜像大小
WORKDIR /app/playwright-service/mcp-router
RUN npm prune --production

WORKDIR /app/playwright-service/claude-agent-service
RUN npm prune --production

# 回到根目录
WORKDIR /app

# 第六步：下载xiaohongshu-mcp二进制文件
RUN set -e && \
    echo "Downloading xiaohongshu-mcp binary..." && \
    wget -v -O /tmp/xiaohongshu-mcp.tar.gz https://github.com/xpzouying/xiaohongshu-mcp/releases/download/v2025.10.04.1522-d84bf2e/xiaohongshu-mcp-linux-amd64.tar.gz && \
    echo "Download completed, extracting..." && \
    cd /tmp && tar xzf xiaohongshu-mcp.tar.gz && \
    echo "Moving binary to destination..." && \
    mv xiaohongshu-mcp-linux-amd64 /app/playwright-service/mcp-router/xiaohongshu-mcp && \
    chmod +x /app/playwright-service/mcp-router/xiaohongshu-mcp && \
    echo "Binary installed successfully:" && \
    ls -lh /app/playwright-service/mcp-router/xiaohongshu-mcp && \
    rm /tmp/xiaohongshu-mcp.tar.gz

# 第七步：创建Zeabur专用启动脚本
RUN echo '#!/bin/bash\n\
set -e\n\
echo "🚀 Starting Xiaohongshu Automation for Zeabur with QR Login Support..."\n\
echo "📊 Environment:"\n\
echo "  NODE_ENV: $NODE_ENV"\n\
echo "  PORT: $PORT"\n\
echo "  HTTP_PORT: $HTTP_PORT"\n\
echo "  ROD_BROWSER_BIN: $ROD_BROWSER_BIN"\n\
echo "  COOKIES_PATH: $COOKIES_PATH"\n\
echo "  PWD: $(pwd)"\n\
echo "  USER: $(whoami)"\n\
\n\
# 进入MCP Router目录\n\
cd /app/playwright-service/mcp-router\n\
echo "📂 Working directory: $(pwd)"\n\
\n\
# 检查构建产物\n\
echo "📦 Build artifacts check:"\n\
if [ -f dist/httpServer.js ]; then\n\
    echo "  ✅ httpServer.js exists: $(ls -lh dist/httpServer.js | awk \"{print \\$5}\"")"\n\
else\n\
    echo "  ❌ httpServer.js missing!"\n\
    ls -la dist/ || echo "  ❌ dist directory missing!"\n\
    exit 1\n\
fi\n\
\n\
# 检查二进制文件\n\
if [ -f xiaohongshu-mcp ]; then\n\
    echo "  ✅ Binary exists: $(ls -lh xiaohongshu-mcp | awk \"{print \\$5}\"")"\n\
    echo "  🔍 Binary is executable: $(test -x xiaohongshu-mcp && echo YES || echo NO)"\n\
else\n\
    echo "  ❌ Binary missing!"\n\
    exit 1\n\
fi\n\
\n\
# 检查Chromium\n\
echo "🌐 Chromium check for QR login:"\n\
if [ -f /usr/bin/chromium ]; then\n\
    echo "  ✅ Chromium available: $(/usr/bin/chromium --version)"\n\
else\n\
    echo "  ❌ Chromium missing! QR login will not work."\n\
    exit 1\n\
fi\n\
\n\
# 创建数据目录结构\n\
mkdir -p /app/data/cookies ./cookies\n\
echo "📁 Created data directories for cookie persistence"\n\
\n\
# 初始化cookies文件\n\
if [ ! -f /app/data/cookies.json ]; then\n\
    echo "[]" > /app/data/cookies.json\n\
    echo "📝 Initialized /app/data/cookies.json"\n\
fi\n\
\n\
if [ ! -f ./cookies.json ]; then\n\
    echo "[]" > ./cookies.json\n\
    echo "📝 Initialized local cookies.json"\n\
fi\n\
\n\
echo "🌐 Zeabur Production Mode - Starting services..."\n\
\n\
# 设置环境变量\n\
export MCP_BINARY_PATH=./xiaohongshu-mcp\n\
export HTTP_PORT=3000\n\
export COOKIE_DIR=./cookies\n\
export COOKIES_PATH=/app/data/cookies.json\n\
export ROD_BROWSER_BIN=/usr/bin/chromium\n\
export CHROMIUM_NO_SANDBOX=true\n\
\n\
# 启动MCP二进制服务\n\
echo "🔧 Starting MCP binary service on port 18070..."\n\
./xiaohongshu-mcp -port :18070 &\n\
MCP_PID=$!\n\
echo "📍 MCP Binary PID: $MCP_PID"\n\
\n\
# 等待MCP服务启动\n\
echo "⏳ Waiting for MCP service to start..."\n\
sleep 3\n\
\n\
# 检查MCP服务\n\
if kill -0 $MCP_PID 2>/dev/null; then\n\
    echo "✅ MCP service is running"\n\
else\n\
    echo "❌ MCP service failed to start!"\n\
    exit 1\n\
fi\n\
\n\
# 启动HTTP路由服务\n\
echo "🔧 Starting HTTP Router service on port 3000..."\n\
echo "▶️  Command: node dist/httpServer.js"\n\
node dist/httpServer.js &\n\
NODE_PID=$!\n\
echo "📍 Node.js Router PID: $NODE_PID"\n\
\n\
# 等待路由服务启动\n\
echo "⏳ Waiting for Router service to start..."\n\
sleep 5\n\
\n\
# 检查所有服务状态\n\
echo "🔍 Service Status Check:"\n\
if kill -0 $MCP_PID 2>/dev/null; then\n\
    echo "  ✅ MCP Binary Service: Running"\n\
else\n\
    echo "  ❌ MCP Binary Service: Failed"\n\
    exit 1\n\
fi\n\
\n\
if kill -0 $NODE_PID 2>/dev/null; then\n\
    echo "  ✅ HTTP Router Service: Running"\n\
    echo "🎉 All services started successfully!"\n\
    echo "🌐 QR Login API available at: /api/xiaohongshu/login/qrcode"\n\
    echo "📊 Login Status API available at: /api/xiaohongshu/login/status"\n\
    wait $NODE_PID\n\
else\n\
    echo "  ❌ HTTP Router Service: Failed"\n\
    kill $MCP_PID 2>/dev/null || true\n\
    exit 1\n\
fi' > /app/start-zeabur-qr.sh && \
    chmod +x /app/start-zeabur-qr.sh

# 暴露端口
EXPOSE 3000

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000
ENV HTTP_PORT=3000
ENV COOKIES_PATH=/app/data/cookies.json
ENV ROD_BROWSER_BIN=/usr/bin/chromium
ENV CHROMIUM_NO_SANDBOX=true

# 创建持久化数据目录
RUN mkdir -p /app/data /app/logs
VOLUME ["/app/data"]

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:3000/health || curl -f http://localhost:3000/api/xiaohongshu/login/status || exit 1

# 启动应用
CMD ["/app/start-zeabur-qr.sh"]