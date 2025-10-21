# Use Node.js 18 as base image
FROM node:18-slim
LABEL "language"="nodejs"

# Force rebuild of all Docker layers - fix dist files not rebuilding
ARG CACHEBUST=v14-force-dist-rebuild-20251021-0050
RUN echo "CRITICAL: Force dist rebuild to fix JSON parsing - Build $(date)" > /tmp/rebuild.txt

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
    echo "🗜️ [Dockerfile] Extracting to /tmp/binaries..." && \
    mkdir -p /tmp/binaries && \
    tar -xzf /tmp/xiaohongshu-mcp.tar.gz -C /tmp/binaries && \
    echo "📂 [Dockerfile] Extracted contents:" && \
    ls -lhR /tmp/binaries && \
    echo "📋 [Dockerfile] Copying MCP binary (direct path)..." && \
    if [ -f /tmp/binaries/xiaohongshu-mcp-linux-amd64 ]; then \
        cp -v /tmp/binaries/xiaohongshu-mcp-linux-amd64 /app/playwright-service/mcp-router/xiaohongshu-mcp; \
    elif [ -f /tmp/binaries/bin/xiaohongshu-mcp-linux-amd64 ]; then \
        cp -v /tmp/binaries/bin/xiaohongshu-mcp-linux-amd64 /app/playwright-service/mcp-router/xiaohongshu-mcp; \
    else \
        echo "❌ MCP binary not found in expected locations!"; \
        find /tmp/binaries -type f -ls; \
        exit 1; \
    fi && \
    echo "📋 [Dockerfile] Copying Login binary (direct path)..." && \
    if [ -f /tmp/binaries/xiaohongshu-login-linux-amd64 ]; then \
        cp -v /tmp/binaries/xiaohongshu-login-linux-amd64 /app/playwright-service/claude-agent-service/xiaohongshu-login; \
    elif [ -f /tmp/binaries/bin/xiaohongshu-login-linux-amd64 ]; then \
        cp -v /tmp/binaries/bin/xiaohongshu-login-linux-amd64 /app/playwright-service/claude-agent-service/xiaohongshu-login; \
    else \
        echo "⚠️ Login binary not found, skipping..."; \
    fi && \
    echo "🔑 [Dockerfile] Setting permissions..." && \
    chmod +x /app/playwright-service/mcp-router/xiaohongshu-mcp && \
    test -f /app/playwright-service/claude-agent-service/xiaohongshu-login && chmod +x /app/playwright-service/claude-agent-service/xiaohongshu-login || true && \
    echo "✅ [Dockerfile] Final MCP binary:" && \
    ls -lh /app/playwright-service/mcp-router/xiaohongshu-mcp && \
    echo "✅ [Dockerfile] Final Login binary (if exists):" && \
    ls -lh /app/playwright-service/claude-agent-service/xiaohongshu-login 2>/dev/null || echo "Login binary not present" && \
    echo "🧹 [Dockerfile] Cleaning up..." && \
    rm -rf /tmp/xiaohongshu-mcp.tar.gz /tmp/binaries

# Step 7: CRITICAL - Verify MCP binary exists and is correct size
RUN echo "🔍 [Dockerfile] FINAL VERIFICATION - Checking MCP binary..." && \
    if [ ! -f /app/playwright-service/mcp-router/xiaohongshu-mcp ]; then \
        echo "❌ FATAL: MCP binary does not exist!"; \
        ls -lah /app/playwright-service/mcp-router/; \
        exit 1; \
    fi && \
    BINARY_SIZE=$(stat -c%s /app/playwright-service/mcp-router/xiaohongshu-mcp) && \
    echo "📏 [Dockerfile] MCP binary size: $BINARY_SIZE bytes" && \
    if [ "$BINARY_SIZE" -lt 10000000 ]; then \
        echo "❌ FATAL: MCP binary too small ($BINARY_SIZE bytes)! Expected >10MB"; \
        echo "📋 File content preview:"; \
        head -10 /app/playwright-service/mcp-router/xiaohongshu-mcp; \
        exit 1; \
    fi && \
    echo "✅ [Dockerfile] MCP binary verification PASSED ($BINARY_SIZE bytes)"

# Step 8: Set permissions for all necessary files (only set existing files)
RUN chmod +x start.sh zeabur-start.js && \
    find playwright-service -name "xiaohongshu*" -type f -exec chmod +x {} \; && \
    find playwright-service -name "*login*" -type f -exec chmod +x {} \;

# Step 9: Create necessary directories
RUN mkdir -p /app/data /app/playwright-service/mcp-router/cookies

# Expose port
EXPOSE 8080

# Use Node.js startup script, which calls start.sh and handles all service coordination
CMD ["node", "zeabur-start.js"]