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

# 下载Linux版本的xiaohongshu-mcp二进制
# 注：这里需要替换为实际的下载链接
RUN mkdir -p playwright-service/mcp-router && \
    echo "#!/bin/bash\necho 'xiaohongshu-mcp Linux binary placeholder'\nexit 0" > playwright-service/mcp-router/xiaohongshu-mcp && \
    chmod +x playwright-service/mcp-router/xiaohongshu-mcp

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
