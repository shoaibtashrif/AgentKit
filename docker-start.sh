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
if [ -z "$(ls -A data/documents 2>/dev/null)" ]; then
    echo ""
    echo -e "${YELLOW}⚠ No documents found in data/documents/${NC}"
    echo "Add your knowledge base files to data/documents/ before starting."
    echo ""
    read -p "Press Enter to continue anyway or Ctrl+C to cancel..."
else
    DOC_COUNT=$(ls -1 data/documents/* 2>/dev/null | wc -l)
    echo -e "${GREEN}✓ Found $DOC_COUNT file(s) in data/documents/${NC}"
fi

echo ""
echo "=========================================="
echo "  Starting All Services"
echo "=========================================="
echo ""
echo "This will start:"
echo "  ✓ RabbitMQ (Message Queue)"
echo "  ✓ Ollama (Local LLM with qwen2.5:0.5b)"
echo "  ✓ Voice Agent Application"
echo ""
echo "First run downloads ~300MB Ollama model..."
echo ""

# Start services
echo "Starting all containers..."
docker compose up -d --build

echo ""
echo "=========================================="
echo "  Waiting for Services to Start"
echo "=========================================="
echo ""

# Wait for RabbitMQ
echo "⏳ Waiting for RabbitMQ (up to 60 seconds)..."
COUNTER=0
MAX_WAIT=60
while [ $COUNTER -lt $MAX_WAIT ]; do
    if docker compose ps rabbitmq 2>/dev/null | grep -q "healthy"; then
        echo -e "${GREEN}✓ RabbitMQ is running${NC}"
        break
    fi
    sleep 2
    COUNTER=$((COUNTER + 2))
    if [ $((COUNTER % 10)) -eq 0 ]; then
        echo -n "."
    fi
done

if [ $COUNTER -ge $MAX_WAIT ]; then
    echo ""
    echo -e "${RED}❌ RabbitMQ failed to start${NC}"
    docker compose logs rabbitmq
    exit 1
fi

# Wait for Ollama
echo ""
echo "⏳ Waiting for Ollama (up to 3 minutes)..."
COUNTER=0
MAX_WAIT=180
while [ $COUNTER -lt $MAX_WAIT ]; do
    if docker compose ps ollama 2>/dev/null | grep -q "healthy"; then
        echo -e "${GREEN}✓ Ollama is running${NC}"
        break
    fi
    sleep 2
    COUNTER=$((COUNTER + 2))
    if [ $((COUNTER % 10)) -eq 0 ]; then
        echo -n "."
    fi
done

if [ $COUNTER -ge $MAX_WAIT ]; then
    echo ""
    echo -e "${YELLOW}⚠ Ollama taking longer than expected${NC}"
fi

# Wait for model download
echo ""
echo "⏳ Downloading qwen2.5:0.5b model (first run only, ~300MB)..."
COUNTER=0
MAX_WAIT=300
while [ $COUNTER -lt $MAX_WAIT ]; do
    if docker compose ps ollama-init 2>/dev/null | grep -q "Exited"; then
        echo -e "${GREEN}✓ Model downloaded${NC}"
        break
    fi
    sleep 5
    COUNTER=$((COUNTER + 5))
    if [ $((COUNTER % 30)) -eq 0 ]; then
        echo "  Still downloading... (${COUNTER}s elapsed)"
    fi
done

if [ $COUNTER -ge $MAX_WAIT ]; then
    echo ""
    echo -e "${YELLOW}⚠ Model download taking longer than expected${NC}"
fi

# Wait for Voice Agent
echo ""
echo "⏳ Waiting for Voice Agent (up to 2 minutes)..."
COUNTER=0
MAX_WAIT=120
while [ $COUNTER -lt $MAX_WAIT ]; do
    if docker compose logs voice-agent 2>/dev/null | grep -q "Voice Agent is ready"; then
        echo -e "${GREEN}✓ Voice Agent is ready!${NC}"
        break
    fi
    sleep 3
    COUNTER=$((COUNTER + 3))
    if [ $((COUNTER % 15)) -eq 0 ]; then
        echo -n "."
    fi
done

if [ $COUNTER -ge $MAX_WAIT ]; then
    echo ""
    echo -e "${YELLOW}⚠ Voice Agent is starting (check logs)${NC}"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}✅ All Services Started!${NC}"
echo "=========================================="
echo ""
echo "Services running:"
echo "  📞 Voice Agent:"
echo "      - WebSocket:    ws://localhost:3001"
echo "      - Twilio Hook:  http://localhost:8081/voice"
echo "      - Media Stream: ws://localhost:8081"
echo ""
echo "  🐰 RabbitMQ:"
echo "      - AMQP:         localhost:5672"
echo "      - Management:   http://localhost:15672 (guest/guest)"
echo ""
echo "  🤖 Ollama:"
echo "      - API:          http://localhost:11434"
echo "      - Model:        qwen2.5:0.5b"
echo ""
echo "Useful commands:"
echo "  📋 View logs:        docker compose logs -f"
echo "  🛑 Stop all:         docker compose down"
echo "  🔄 Restart:          docker compose restart"
echo "  📊 Check status:     docker compose ps"
echo "  📝 Ingest docs:      docker exec voice-agent-app node ingest-documents.js"
echo ""
echo -e "${BLUE}View logs? (Ctrl+C to exit)${NC}"
read -p "Press Enter to view logs or Ctrl+C to skip..."
docker compose logs -f
