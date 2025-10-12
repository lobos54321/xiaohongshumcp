# 使用Node.js 18作为基础镜像
FROM node:18-slim

# 强制重建所有Docker层 - 支持Playwright自动登录
ARG CACHEBUST=production-v6-playwright-auto-login
RUN echo "Force rebuild with Playwright support at $(date)" > /tmp/rebuild.txt

# 安装必要的系统依赖（包括Playwright浏览器依赖）
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    ca-certificates \
    python3 \
    procps \
    # Playwright Chromium依赖
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libatspi2.0-0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libxcb1 \
    libxkbcommon0 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    fonts-liberation \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

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

# 安装Playwright Chromium浏览器
RUN npx playwright install chromium

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

# 第七步：创建Zeabur专用启动脚本（自动Cookie检测版本）
RUN echo '#!/bin/bash\n\
set -e\n\
echo "🚀 Starting Xiaohongshu AI Auto-Management System with Auto Cookie Detection..."\n\
echo "📊 Environment:"\n\
echo "  NODE_ENV: $NODE_ENV"\n\
echo "  PORT: $PORT"\n\
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
# 创建数据目录结构\n\
mkdir -p /app/data/cookies \\\\\n\
         /app/playwright-service/mcp-router/cookies \\\\\n\
         /app/playwright-service/claude-agent-service/cookies\n\
echo "📁 Data directories created"\n\
\n\
# 初始化cookies文件\n\
for path in "/app/data/cookies.json" \\\\\n\
           "/app/playwright-service/mcp-router/cookies.json" \\\\\n\
           "/app/playwright-service/claude-agent-service/cookies.json"; do\n\
    if [ ! -f "$path" ]; then\n\
        echo "[]" > "$path"\n\
        echo "📝 Initialized $path"\n\
    fi\n\
done\n\
\n\
echo "🌐 Starting Auto Cookie Detection Services..."\n\
\n\
# 设置全局环境变量\n\
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
echo "📋 MCP Router Environment:"\n\
echo "  HTTP_PORT: $HTTP_PORT"\n\
echo "  MCP_BINARY_PATH: $MCP_BINARY_PATH"\n\
echo "  COOKIE_DIR: $COOKIE_DIR"\n\
echo "  HTTP_ONLY: $HTTP_ONLY"\n\
node dist/httpServer.js &\n\
ROUTER_PID=$!\n\
echo "📍 MCP Router PID: $ROUTER_PID"\n\
\n\
# 等待Router服务启动 - 增加等待时间\n\
echo "⏳ Waiting for MCP Router to start..."\n\
sleep 8\n\
\n\
# 检查进程状态\n\
if ! kill -0 $ROUTER_PID 2>/dev/null; then\n\
    echo "❌ MCP Router process died!"\n\
    kill $MCP_PID 2>/dev/null || true\n\
    exit 1\n\
fi\n\
\n\
# 测试HTTP端口是否可用\n\
for i in {1..10}; do\n\
    if curl -s http://localhost:3001/health > /dev/null 2>&1; then\n\
        echo "✅ MCP Router running on port 3001 and responding"\n\
        break\n\
    fi\n\
    echo "⏳ Waiting for MCP Router HTTP server... ($i/10)"\n\
    sleep 2\n\
    if [ $i -eq 10 ]; then\n\
        echo "❌ MCP Router HTTP server failed to respond after 20 seconds!"\n\
        kill $MCP_PID $ROUTER_PID 2>/dev/null || true\n\
        exit 1\n\
    fi\n\
done\n\
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
echo "  • Auto Login: /agent/xiaohongshu/auto-login"\n\
echo "  • Login Status: /api/xiaohongshu/login/status"\n\
echo "  • AI Auto Start: /agent/auto/start"\n\
echo "  • AI Auto Strategy: /agent/auto/strategy/:userId"\n\
echo "  • Health Check: /health"\n\
echo ""\n\
echo "📡 Ready for AI-powered xiaohongshu automation with Auto Cookie Detection!"\n\
\n\
# 等待主服务进程\n\
wait $AGENT_PID' > /app/start-zeabur-auto-cookie.sh && \
    chmod +x /app/start-zeabur-auto-cookie.sh

# 暴露端口
EXPOSE 3000

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000
ENV COOKIES_PATH=/app/data/cookies.json
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

# 启动应用 - 使用新的自动Cookie检测启动脚本
CMD ["/app/start-zeabur-auto-cookie.sh"]