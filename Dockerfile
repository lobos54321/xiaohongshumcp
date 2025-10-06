# 使用Node.js 18作为基础镜像
FROM node:18-slim

# 安装必要的系统依赖
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 设置工作目录
WORKDIR /app

# 复制package.json文件
COPY package*.json ./
COPY playwright-service/mcp-router/package*.json ./playwright-service/mcp-router/
COPY playwright-service/claude-agent-service/package*.json ./playwright-service/claude-agent-service/

# 安装依赖
RUN cd playwright-service/mcp-router && npm install
RUN cd playwright-service/claude-agent-service && npm install

# 复制源代码
COPY . .

# 下载预编译的Linux版本xiaohongshu-mcp二进制
RUN mkdir -p playwright-service/mcp-router && \
    cd /tmp && \
    wget https://github.com/xpzouying/xiaohongshu-mcp/releases/download/v2025.10.04.1522-d84bf2e/xiaohongshu-mcp-linux-amd64.tar.gz && \
    tar xzf xiaohongshu-mcp-linux-amd64.tar.gz && \
    mv xiaohongshu-mcp-linux-amd64 /app/playwright-service/mcp-router/xiaohongshu-mcp && \
    chmod +x /app/playwright-service/mcp-router/xiaohongshu-mcp && \
    rm -f xiaohongshu-mcp-linux-amd64.tar.gz xiaohongshu-login-linux-amd64

# 编译TypeScript
RUN cd playwright-service/mcp-router && npm run build
RUN cd playwright-service/claude-agent-service && npm run build

# 复制启动脚本
COPY start.sh ./
RUN chmod +x start.sh

# 复制前端文件
COPY frontend ./frontend

# 暴露端口
EXPOSE 4000

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=4000

# 启动应用
CMD ["bash", "start.sh"]
