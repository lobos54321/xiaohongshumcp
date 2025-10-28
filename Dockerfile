# ============================================================
# Stage 1: Build xiaohongshu-mcp Go Binary (15-minute timeout fix)
# ============================================================
FROM golang:1.24 AS mcp-builder

WORKDIR /mcp-build
ENV GOPROXY=https://goproxy.cn,direct
ENV GOSUMDB=sum.golang.google.cn

# Copy modified xiaohongshu-mcp source
COPY xiaohongshu-mcp-build/go.mod xiaohongshu-mcp-build/go.sum ./
RUN go mod download

COPY xiaohongshu-mcp-build ./
RUN echo "🔨 [MCP Builder] Compiling xiaohongshu-mcp with 15-minute timeout fix..." && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /mcp-build/xiaohongshu-mcp-linux-amd64 . && \
    echo "✅ [MCP Builder] Compilation successful!" && \
    ls -lh /mcp-build/xiaohongshu-mcp-linux-amd64

# ============================================================
# Stage 2: Main Application (Node.js + Playwright + MCP Binary)
# ============================================================
FROM node:18-slim

# Image metadata
LABEL "language"="nodejs"
LABEL "version"="v18-mcp-timeout-fix-15min"

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

# 🔥 CRITICAL FIX: Create symlink for go-rod (xiaohongshu-mcp binary)
# go-rod默认查找 /usr/bin/chromium，但Playwright安装在缓存目录
# 动态查找Playwright的Chromium并创建软链接
RUN CHROMIUM_PATH=$(find /root/.cache/ms-playwright -name chrome -type f | grep "chrome-linux/chrome" | head -1) && \
    echo "📍 Found Chromium at: $CHROMIUM_PATH" && \
    ln -sf "$CHROMIUM_PATH" /usr/bin/chromium && \
    echo "✅ Created symlink: /usr/bin/chromium -> $CHROMIUM_PATH" && \
    ls -lh /usr/bin/chromium

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

# Step 6: Copy compiled MCP binary from builder stage
COPY --from=mcp-builder /mcp-build/xiaohongshu-mcp-linux-amd64 /app/playwright-service/mcp-router/xiaohongshu-mcp

# Set permissions for MCP binary
RUN echo "🔑 [Dockerfile] Setting MCP binary permissions..." && \
    chmod +x /app/playwright-service/mcp-router/xiaohongshu-mcp && \
    echo "✅ [Dockerfile] MCP binary with 15-minute timeout fix installed!" && \
    ls -lh /app/playwright-service/mcp-router/xiaohongshu-mcp

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
# CRITICAL: /app/data is required for MCP binary cookie path symlinks
RUN mkdir -p /app/data /app/playwright-service/mcp-router/cookies

# 🔥 CRITICAL: Declare /app/data as persistent volume
# This ensures data (auto-content plans, cookies) persists across container restarts
VOLUME ["/app/data"]

# Expose port
EXPOSE 8080

# Use Node.js startup script, which calls start.sh and handles all service coordination
CMD ["node", "zeabur-start.js"]