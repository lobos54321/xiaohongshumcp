# ============================================================
# Simplified Dockerfile - No MCP Binary Build
# FORCE REBUILD 2025-12-06-v3
# ============================================================
FROM node:18-slim

# Force cache bust - change this to trigger full rebuild
ARG CACHEBUST=20251206v3
RUN echo "Cache bust: $CACHEBUST - No MCP dependencies"

# Image metadata
LABEL "language"="nodejs"
LABEL "version"="v18-no-mcp-v3"

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

# Create directory structure
RUN mkdir -p playwright-service/claude-agent-service

# Copy package.json files
COPY package*.json ./
COPY playwright-service/claude-agent-service/package*.json ./playwright-service/claude-agent-service/

# Install dependencies
WORKDIR /app/playwright-service/claude-agent-service
RUN npm install --include=dev

# Install Playwright Chromium browser
RUN npx playwright install-deps && npx playwright install chromium

# Return to root directory
WORKDIR /app

# Copy all source code
COPY . .

# Build TypeScript project
WORKDIR /app/playwright-service/claude-agent-service
RUN npm run build

# Clean devDependencies to reduce image size
RUN npm prune --production

# Return to root directory
WORKDIR /app

# Set permissions
RUN chmod +x start.sh zeabur-start.js 2>/dev/null || true

# Create necessary directories
RUN mkdir -p /app/data /app/playwright-service/claude-agent-service/cookies

# Declare persistent volume
VOLUME ["/app/data"]

# Expose port
EXPOSE 8080

# Start with Node.js startup script
CMD ["node", "zeabur-start.js"]