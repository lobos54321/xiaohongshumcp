# 使用Node.js 20作为基础镜像
FROM node:20-alpine

# 安装必要的系统依赖（包括Chrome浏览器依赖）
RUN apk add --no-cache \
    wget \
    curl \
    bash \
    ca-certificates \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ttf-freefont \
    glib \
    glib-dev \
    gobject-introspection-dev

# 设置工作目录
WORKDIR /app

# 复制所有源代码
COPY . .

# 下载xiaohongshu-mcp二进制
RUN mkdir -p /tmp/binary && \
    cd /tmp/binary && \
    wget https://github.com/xpzouying/xiaohongshu-mcp/releases/download/v2025.10.04.1522-d84bf2e/xiaohongshu-mcp-linux-amd64.tar.gz && \
    tar xzf xiaohongshu-mcp-linux-amd64.tar.gz && \
    mv xiaohongshu-mcp-linux-amd64 /app/playwright-service/mcp-router/xiaohongshu-mcp && \
    chmod +x /app/playwright-service/mcp-router/xiaohongshu-mcp && \
    rm -rf /tmp/binary

# 安装根目录依赖并构建
RUN npm install

# 创建一个统一的 node_modules 结构，完全跳过TypeScript编译
RUN cd playwright-service/mcp-router && \
    npm ci --only=production --ignore-scripts && \
    cd ../../ && \
    cp -r playwright-service/mcp-router/node_modules/* ./node_modules/ 2>/dev/null || true

RUN cd playwright-service/claude-agent-service && \
    npm ci --only=production --ignore-scripts && \
    cd ../../ && \
    cp -r playwright-service/claude-agent-service/node_modules/* ./node_modules/ 2>/dev/null || true

# 设置 NODE_PATH 来确保模块解析
ENV NODE_PATH=/app/node_modules:/app/playwright-service/mcp-router/node_modules:/app/playwright-service/claude-agent-service/node_modules

# 暴露端口
EXPOSE 8080

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=8080

# 启动应用
CMD ["node", "zeabur-start.js"]
