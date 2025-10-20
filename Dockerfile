# Use Node.js 18 as base image
FROM node:18-slim
LABEL "language"="nodejs"

# Force rebuild of all Docker layers - support Playwright auto login
ARG CACHEBUST=v12-fix-playwright-deps-20251016-0300
RUN echo "CRITICAL: Installing Playwright dependencies with libcups2" > /tmp/rebuild.txt

# Install necessary system dependencies (including ALL Playwright browser dependencies + xvfb)
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    ca-certificates \
    python3 \
    procps \
    xvfb \
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
    libcups2 \
    libdrm2 \
    libgtk-3-0 \
    libxss1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Step 1: Create directory structure and copy package.json files
RUN mkdir -p playwright-service/mcp-router playwright-service/claude-agent-service

# Copy package.json files
COPY package*.json ./
COPY playwright-service/mcp-router/package*.json ./playwright-service/mcp-router/
COPY playwright-service/claude-agent-service/package*.json ./playwright-service/claude-agent-service/

# Step 2: Install all dependencies (including devDependencies for building)
WORKDIR /app/playwright-service/mcp-router
RUN npm install --include=dev

WORKDIR /app/playwright-service/claude-agent-service
RUN npm install --include=dev

# Install Playwright Chromium browser and system dependencies
RUN npx playwright install-deps && npx playwright install chromium

# Return to root directory
WORKDIR /app

# Step 3: Copy all source code
COPY . .

# Step 4: Build TypeScript projects
WORKDIR /app/playwright-service/mcp-router
RUN npm run build

WORKDIR /app/playwright-service/claude-agent-service
RUN npm run build

# Step 5: Clean devDependencies to reduce image size
WORKDIR /app/playwright-service/mcp-router
RUN npm prune --production

WORKDIR /app/playwright-service/claude-agent-service
RUN npm prune --production

# Return to root directory
WORKDIR /app

# Step 6: Download and extract xiaohongshu-mcp binary files
RUN set -e && \
    echo "🔽 [Dockerfile] Downloading xiaohongshu-mcp binary..." && \
    wget -v -O /tmp/xiaohongshu-mcp.tar.gz https://github.com/xpzouying/xiaohongshu-mcp/releases/download/v2025.10.04.1522-d84bf2e/xiaohongshu-mcp-linux-amd64.tar.gz && \
    echo "📦 [Dockerfile] Downloaded file size:" && \
    ls -lh /tmp/xiaohongshu-mcp.tar.gz && \
    echo "🗜️ [Dockerfile] Extracting binary..." && \
    tar -xzf /tmp/xiaohongshu-mcp.tar.gz -C /tmp && \
    echo "📂 [Dockerfile] Extracted files:" && \
    find /tmp -name "*xiaohongshu*" -type f -ls && \
    echo "📋 [Dockerfile] Copying MCP binary..." && \
    find /tmp -name "xiaohongshu-mcp-linux-amd64" -type f -exec cp -v {} /app/playwright-service/mcp-router/xiaohongshu-mcp \; && \
    echo "📋 [Dockerfile] Copying Login binary..." && \
    find /tmp -name "xiaohongshu-login-linux-amd64" -type f -exec cp -v {} /app/playwright-service/claude-agent-service/xiaohongshu-login \; && \
    echo "🔑 [Dockerfile] Setting permissions..." && \
    chmod +x /app/playwright-service/mcp-router/xiaohongshu-mcp && \
    chmod +x /app/playwright-service/claude-agent-service/xiaohongshu-login && \
    echo "✅ [Dockerfile] Final MCP binary:" && \
    ls -lh /app/playwright-service/mcp-router/xiaohongshu-mcp && \
    echo "✅ [Dockerfile] Final Login binary:" && \
    ls -lh /app/playwright-service/claude-agent-service/xiaohongshu-login && \
    echo "🧹 [Dockerfile] Cleaning up..." && \
    rm -rf /tmp/xiaohongshu-mcp.tar.gz /tmp/xiaohongshu-mcp*

# Step 7: Set permissions for all necessary files (only set existing files)
RUN chmod +x start.sh zeabur-start.js && \
    find playwright-service -name "xiaohongshu*" -type f -exec chmod +x {} \; && \
    find playwright-service -name "*login*" -type f -exec chmod +x {} \;

# Step 8: Create necessary directories
RUN mkdir -p /app/data /app/playwright-service/mcp-router/cookies

# Expose port
EXPOSE 8080

# Use Node.js startup script, which calls start.sh and handles all service coordination
CMD ["node", "zeabur-start.js"]