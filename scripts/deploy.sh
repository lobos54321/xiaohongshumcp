#!/bin/bash

# 部署脚本
set -e

echo "🚀 Starting xiaohongshu-proxy deployment..."

# 检查 Docker 和 Docker Compose
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# 检查环境变量文件
if [ ! -f deployments/docker/.env ]; then
    echo "⚠️  .env file not found. Copying from .env.example..."
    cp deployments/docker/.env.example deployments/docker/.env
    echo "📝 Please edit deployments/docker/.env with your actual configuration values."
    echo "   Required: CLAUDE_API_KEY, JWT_SECRET, DB_PASSWORD"
    exit 1
fi

# 创建必要的目录
echo "📁 Creating necessary directories..."
mkdir -p data/logs data/xiaohongshu data/images

# 构建和启动服务
echo "🔨 Building and starting services..."
cd deployments/docker
docker-compose down --remove-orphans
docker-compose build --no-cache
docker-compose up -d

# 等待服务启动
echo "⏳ Waiting for services to start..."
sleep 30

# 健康检查
echo "🔍 Checking service health..."
if curl -f http://localhost:8080/health > /dev/null 2>&1; then
    echo "✅ Service is healthy and running!"
    echo ""
    echo "🎉 Deployment completed successfully!"
    echo ""
    echo "📋 Service Information:"
    echo "   - API Endpoint: http://localhost:8080"
    echo "   - Health Check: http://localhost:8080/health"
    echo "   - Database: PostgreSQL on port 5432"
    echo "   - Redis: Redis on port 6379"
    echo ""
    echo "📖 Next Steps:"
    echo "   1. Test the API: curl http://localhost:8080/health"
    echo "   2. Register a user: curl -X POST http://localhost:8080/api/v1/auth/register -H 'Content-Type: application/json' -d '{\"username\":\"test\",\"email\":\"test@example.com\",\"password\":\"test123\"}'"
    echo "   3. Check logs: docker-compose logs -f xiaohongshu-proxy"
else
    echo "❌ Service health check failed!"
    echo "🔍 Checking logs..."
    docker-compose logs xiaohongshu-proxy
    exit 1
fi