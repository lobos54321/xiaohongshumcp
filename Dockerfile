# 此项目使用Node.js运行，不使用Docker构建
# 请参考 zbpack.json 或 .zeabur/config.json 配置

FROM node:18-alpine

WORKDIR /app

# 复制package文件
COPY package*.json ./
COPY playwright-service/mcp-router/package*.json ./playwright-service/mcp-router/
COPY playwright-service/claude-agent-service/package*.json ./playwright-service/claude-agent-service/

# 安装依赖并构建
RUN cd playwright-service/mcp-router && npm install && npm run build && \
    cd ../claude-agent-service && npm install && npm run build

# 复制所有文件
COPY . .

# 暴露端口
EXPOSE 4000

# 启动命令
CMD ["bash", "start.sh"]
