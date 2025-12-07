#!/bin/bash

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "=========================================="
echo "  Voice Agent Docker Setup"
echo "=========================================="
echo -e "${NC}"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    echo "Please install Docker from: https://docs.docker.com/engine/install/"
    exit 1
fi

# Check if Docker Compose is installed
if ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed${NC}"
    echo "Please install Docker Compose v2.0+"
    exit 1
fi

echo -e "${GREEN}✓ Docker installed${NC}"
echo -e "${GREEN}✓ Docker Compose installed${NC}"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠ .env file not found${NC}"
    echo "Creating .env from template..."

    if [ -f .env.docker ]; then
        cp .env.docker .env
        echo -e "${GREEN}✓ Created .env file${NC}"
        echo ""
        echo -e "${YELLOW}⚠ IMPORTANT: Please edit .env and add your API keys!${NC}"
        echo ""
        echo "Required API keys:"
        echo "  - DEEPGRAM_API_KEY (https://deepgram.com/)"
        echo "  - ELEVENLABS_API_KEY (https://elevenlabs.io/)"
        echo "  - ELEVENLABS_VOICE_ID"
        echo "  - TWILIO_ACCOUNT_SID (https://www.twilio.com/console)"
        echo "  - TWILIO_AUTH_TOKEN"
        echo "  - TWILIO_PHONE_NUMBER"
        echo ""
        read -p "Press Enter after you've edited .env with your API keys..."
    else
        echo -e "${RED}❌ .env.docker template not found${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ .env file exists${NC}"
fi

# Create data directories if they don't exist
echo ""
echo "Creating data directories..."
mkdir -p data/documents
mkdir -p data/vectorstore
echo -e "${GREEN}✓ Data directories created${NC}"

# Check if documents exist
if [ -z "$(ls -A data/documents)" ]; then
    echo ""
    echo -e "${YELLOW}⚠ No documents found in data/documents/${NC}"
    echo "Add your knowledge base .txt files to data/documents/ before starting."
    echo ""
    read -p "Press Enter to continue anyway or Ctrl+C to cancel..."
else
    DOC_COUNT=$(ls -1 data/documents/*.txt 2>/dev/null | wc -l)
    echo -e "${GREEN}✓ Found $DOC_COUNT document(s) in data/documents/${NC}"
fi

echo ""
echo "=========================================="
echo "  Starting Docker Services"
echo "=========================================="
echo ""
echo "This will:"
echo "  - Pull Docker images (first time only)"
echo "  - Start RabbitMQ"
echo "  - Start Ollama and download qwen2.5:0.5b (~300MB, first time only)"
echo "  - Build and start Voice Agent application"
echo ""
echo "First run may take 5-10 minutes..."
echo ""

# Start services
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "=========================================="
echo "  Waiting for Services to Start"
echo "=========================================="
echo ""

# Wait for services to be healthy
echo "Waiting for RabbitMQ..."
timeout 60 bash -c 'until docker compose -f docker-compose.prod.yml ps rabbitmq | grep -q "healthy"; do sleep 2; done' || {
    echo -e "${RED}❌ RabbitMQ failed to start${NC}"
    docker compose -f docker-compose.prod.yml logs rabbitmq
    exit 1
}
echo -e "${GREEN}✓ RabbitMQ is running${NC}"

echo "Waiting for Ollama..."
timeout 180 bash -c 'until docker compose -f docker-compose.prod.yml ps ollama | grep -q "healthy"; do sleep 2; done' || {
    echo -e "${RED}❌ Ollama failed to start${NC}"
    docker compose -f docker-compose.prod.yml logs ollama
    exit 1
}
echo -e "${GREEN}✓ Ollama is running${NC}"

echo "Waiting for model download..."
timeout 300 bash -c 'until docker compose -f docker-compose.prod.yml ps ollama-init | grep -q "Exited"; do sleep 5; done' || {
    echo -e "${YELLOW}⚠ Model download taking longer than expected${NC}"
}
echo -e "${GREEN}✓ Model downloaded${NC}"

echo "Waiting for Voice Agent..."
timeout 120 bash -c 'until docker compose -f docker-compose.prod.yml ps voice-agent | grep -q "healthy"; do sleep 3; done' || {
    echo -e "${YELLOW}⚠ Voice Agent is starting (may take a few more minutes)${NC}"
}
echo -e "${GREEN}✓ Voice Agent is running${NC}"

echo ""
echo "=========================================="
echo -e "${GREEN}✅ All Services Started Successfully!${NC}"
echo "=========================================="
echo ""
echo "Services:"
echo "  - WebSocket Server:    ws://localhost:3001"
echo "  - Twilio Webhook:      http://localhost:8081/voice"
echo "  - RabbitMQ Management: http://localhost:15672 (guest/guest)"
echo ""
echo "Useful commands:"
echo "  - View logs:      docker compose -f docker-compose.prod.yml logs -f"
echo "  - Stop services:  docker compose -f docker-compose.prod.yml down"
echo "  - Restart:        docker compose -f docker-compose.prod.yml restart"
echo ""
echo "To ingest documents:"
echo "  docker exec voice-agent-app node ingest-documents.js"
echo ""
echo -e "${BLUE}View logs now? (press Ctrl+C to exit logs)${NC}"
read -p "Press Enter to view logs or Ctrl+C to exit..."
docker compose -f docker-compose.prod.yml logs -f
