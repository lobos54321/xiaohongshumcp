# 使用Node.js 18作为基础镜像
FROM node:18-slim
LABEL "language"="nodejs"

# 强制重建所有Docker层 - 支持Playwright自动登录
ARG CACHEBUST=v11-fix-chmod-20251012-0225
RUN echo "CRITICAL: Installing Playwright dependencies" > /tmp/rebuild.txt

# 安装必要的系统依赖（包括Playwright浏览器依赖）
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    ca-certificates \
    python3 \
    procps \
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

# 第六步：下载并正确解压xiaohongshu-mcp二进制文件
RUN set -e && \
    echo "Downloading xiaohongshu-mcp binary..." && \
    wget -v -O /tmp/xiaohongshu-mcp.tar.gz https://github.com/xpzouying/xiaohongshu-mcp/releases/download/v2025.10.04.1522-d84bf2e/xiaohongshu-mcp-linux-amd64.tar.gz && \
    tar -xzf /tmp/xiaohongshu-mcp.tar.gz -C /tmp && \
    find /tmp -name "*xiaohongshu*" -type f -exec cp {} /app/ \; && \
    chmod +x /app/xiaohongshu-mcp-linux-amd64 && \
    chmod +x /app/xiaohongshu-login-linux-amd64 && \
    rm -rf /tmp/xiaohongshu-mcp.tar.gz /tmp/xiaohongshu-mcp*

# 第七步：设置所有必要文件的权限（只设置存在的文件）
RUN chmod +x start.sh zeabur-start.js && \
    find playwright-service -name "xiaohongshu*" -type f -exec chmod +x {} \; && \
    find playwright-service -name "*login*" -type f -exec chmod +x {} \;

# 第八步：创建必要的目录
RUN mkdir -p /app/data /app/playwright-service/mcp-router/cookies

# 暴露端口
EXPOSE 3000

# 使用Node.js启动脚本，它会调用start.sh并处理所有服务协调
CMD ["node", "zeabur-start.js"]
