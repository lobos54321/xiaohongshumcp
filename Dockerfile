# 使用Node.js 18作为基础镜像
FROM node:18-slim

# 安装必要的系统依赖
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# 复制package.json文件
COPY package*.json ./
COPY playwright-service/mcp-router/package*.json ./playwright-service/mcp-router/
COPY playwright-service/claude-agent-service/package*.json ./playwright-service/claude-agent-service/

# 安装依赖（包括开发依赖，构建时需要）
RUN npm install
RUN cd playwright-service/mcp-router && npm install
RUN cd playwright-service/claude-agent-service && npm install

# 下载预编译的Linux版本xiaohongshu-mcp二进制（在复制源代码之前）
RUN mkdir -p /tmp/binary && \
    cd /tmp/binary && \
    wget https://github.com/xpzouying/xiaohongshu-mcp/releases/download/v2025.10.04.1522-d84bf2e/xiaohongshu-mcp-linux-amd64.tar.gz && \
    tar xzf xiaohongshu-mcp-linux-amd64.tar.gz && \
    mkdir -p /app/playwright-service/mcp-router && \
    mv xiaohongshu-mcp-linux-amd64 /app/playwright-service/mcp-router/xiaohongshu-mcp && \
    chmod +x /app/playwright-service/mcp-router/xiaohongshu-mcp && \
    ls -lh /app/playwright-service/mcp-router/xiaohongshu-mcp && \
    rm -rf /tmp/binary

# 复制源代码（包括预构建的dist目录）
COPY . .

# 安装运行时依赖
RUN cd playwright-service/mcp-router && npm install --only=production
RUN cd playwright-service/claude-agent-service && npm install --only=production

# 暴露端口 - 使用8080端口
EXPOSE 8080

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=8080
ENV HTTP_PORT=8080

# 启动应用
CMD ["bash", "start.sh"]
