# 使用Node.js 18作为基础镜像
FROM node:18-slim

# 强制重建所有Docker层 - 解决缓存问题
ARG CACHEBUST=production-v4-claude-agent
RUN echo "Force rebuild CLAUDE AGENT at $(date)" > /tmp/rebuild.txt

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
RUN npm install --include=dev

WORKDIR /app/playwright-service/claude-agent-service
RUN npm install --include=dev

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

# 第七步：创建Zeabur专用启动脚本（部署Claude Agent Service + MCP Router）
RUN echo '#!/bin/bash\n\
set -e\n\
echo "🚀 Starting Xiaohongshu AI Auto-Management System for Zeabur..."\n\
echo "📊 Environment:"\n\
echo "  NODE_ENV: $NODE_ENV"\n\
echo "  PORT: $PORT"\n\
echo "  ROD_BROWSER_BIN: $ROD_BROWSER_BIN"\n\
echo "  COOKIES_PATH: $COOKIES_PATH"\n\
echo "  PWD: $(pwd)"\n\
echo "  USER: $(whoami)"\n\
\n\
# 检查构建产物 - MCP Router\n\
echo "📦 MCP Router Build Check:"\n\
if [ -f /app/playwright-service/mcp-router/dist/httpServer.js ]; then\n\
    echo "  ✅ MCP Router compiled successfully"\n\
else\n\
    echo "  ❌ MCP Router build missing!"\n\
    exit 1\n\
fi\n\
\n\
# 检查构建产物 - Claude Agent Service\n\
echo "📦 Claude Agent Service Build Check:"\n\
if [ -f /app/playwright-service/claude-agent-service/dist/server.js ]; then\n\
    echo "  ✅ Claude Agent Service compiled successfully"\n\
else\n\
    echo "  ❌ Claude Agent Service build missing!"\n\
    exit 1\n\
fi\n\
\n\
# 检查二进制文件\n\
if [ -f /app/playwright-service/mcp-router/xiaohongshu-mcp ]; then\n\
    echo "  ✅ xiaohongshu-mcp binary ready"\n\
else\n\
    echo "  ❌ xiaohongshu-mcp binary missing!"\n\
    exit 1\n\
fi\n\
\n\
# 检查Chromium\n\
echo "🌐 Browser Check:"\n\
if [ -f /usr/bin/chromium ]; then\n\
    echo "  ✅ Chromium available for QR login"\n\
else\n\
    echo "  ❌ Chromium missing! QR login will fail."\n\
    exit 1\n\
fi\n\
\n\
# 创建数据目录结构\n\
mkdir -p /app/data/cookies \\\n\
         /app/playwright-service/mcp-router/cookies \\\n\
         /app/playwright-service/claude-agent-service/cookies\n\
echo "📁 Data directories created"\n\
\n\
# 初始化cookies文件\n\
for path in "/app/data/cookies.json" \\\n\
           "/app/playwright-service/mcp-router/cookies.json" \\\n\
           "/app/playwright-service/claude-agent-service/cookies.json"; do\n\
    if [ ! -f "$path" ]; then\n\
        echo "[]" > "$path"\n\
        echo "📝 Initialized $path"\n\
    fi\n\
done\n\
\n\
echo "🌐 Starting Zeabur Production Services..."\n\
\n\
# 设置全局环境变量\n\
export ROD_BROWSER_BIN=/usr/bin/chromium\n\
export CHROMIUM_NO_SANDBOX=true\n\
export COOKIES_PATH=/app/data/cookies.json\n\
export MCP_ROUTER_URL=http://localhost:3001\n\
\n\
# 启动MCP二进制服务 (port 18070)\n\
echo "🔧 [1/3] Starting xiaohongshu-mcp binary..."\n\
cd /app/playwright-service/mcp-router\n\
./xiaohongshu-mcp -port :18070 &\n\
MCP_PID=$!\n\
echo "📍 xiaohongshu-mcp PID: $MCP_PID"\n\
\n\
# 等待MCP服务启动\n\
sleep 3\n\
if ! kill -0 $MCP_PID 2>/dev/null; then\n\
    echo "❌ xiaohongshu-mcp failed to start!"\n\
    exit 1\n\
fi\n\
echo "✅ xiaohongshu-mcp running on port 18070"\n\
\n\
# 启动MCP Router (port 3001)\n\
echo "🔧 [2/3] Starting MCP Router..."\n\
cd /app/playwright-service/mcp-router\n\
export MCP_BINARY_PATH=./xiaohongshu-mcp\n\
export HTTP_PORT=3001\n\
export COOKIE_DIR=./cookies\n\
export HTTP_ONLY=true\n\
node dist/httpServer.js &\n\
ROUTER_PID=$!\n\
echo "📍 MCP Router PID: $ROUTER_PID"\n\
\n\
# 等待Router服务启动\n\
sleep 3\n\
if ! kill -0 $ROUTER_PID 2>/dev/null; then\n\
    echo "❌ MCP Router failed to start!"\n\
    kill $MCP_PID 2>/dev/null || true\n\
    exit 1\n\
fi\n\
echo "✅ MCP Router running on port 3001"\n\
\n\
# 启动Claude Agent Service (主服务 port 3000)\n\
echo "🔧 [3/3] Starting Claude Agent Service..."\n\
cd /app/playwright-service/claude-agent-service\n\
export PORT=3000\n\
node dist/server.js &\n\
AGENT_PID=$!\n\
echo "📍 Claude Agent Service PID: $AGENT_PID"\n\
\n\
# 等待主服务启动\n\
sleep 5\n\
if ! kill -0 $AGENT_PID 2>/dev/null; then\n\
    echo "❌ Claude Agent Service failed to start!"\n\
    kill $MCP_PID $ROUTER_PID 2>/dev/null || true\n\
    exit 1\n\
fi\n\
\n\
# 最终状态检查\n\
echo "🔍 Final Status Check:"\n\
echo "  ✅ xiaohongshu-mcp: Running (port 18070)"\n\
echo "  ✅ MCP Router: Running (port 3001)"\n\
echo "  ✅ Claude Agent Service: Running (port 3000)"\n\
echo ""\n\
echo "🎉 All services started successfully!"\n\
echo "🌐 API Endpoints:"\n\
echo "  • QR Login: /api/xiaohongshu/login/qrcode"\n\
echo "  • Login Status: /api/xiaohongshu/login/status"\n\
echo "  • AI Auto Start: /agent/auto/start"\n\
echo "  • AI Auto Strategy: /agent/auto/strategy/:userId"\n\
echo "  • Health Check: /health"\n\
echo ""\n\
echo "📡 Ready for AI-powered xiaohongshu automation!"\n\
\n\
# 等待主服务进程\n\
wait $AGENT_PID' > /app/start-zeabur-claude-agent.sh && \
    chmod +x /app/start-zeabur-claude-agent.sh

# 暴露端口
EXPOSE 3000

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000
ENV COOKIES_PATH=/app/data/cookies.json
ENV ROD_BROWSER_BIN=/usr/bin/chromium
ENV CHROMIUM_NO_SANDBOX=true
ENV MCP_ROUTER_URL=http://localhost:3001

# 性能优化环境变量
ENV REQUEST_TIMEOUT=300000
ENV KEEP_ALIVE_TIMEOUT=310000
ENV HEADERS_TIMEOUT=320000
ENV NODE_OPTIONS="--max-old-space-size=2048"

# 创建持久化数据目录
RUN mkdir -p /app/data /app/logs
VOLUME ["/app/data"]

# 健康检查 - 检查主服务（Claude Agent Service）
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:3000/health || curl -f http://localhost:3000/api/xiaohongshu/login/status || exit 1

# 启动应用 - 使用新的启动脚本
CMD ["/app/start-zeabur-claude-agent.sh"]