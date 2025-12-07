#!/bin/bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Voice Agent Installation${NC}\n"

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
elif [ -f /etc/debian_version ]; then
    OS="debian"
else
    OS="other"
fi

# 1. Node.js
echo -e "${YELLOW}[1/4] Node.js${NC}"
if command -v node >/dev/null 2>&1; then
    echo "✓ Already installed: $(node --version)"
else
    if [ "$OS" = "macos" ]; then
        brew install node
    elif [ "$OS" = "debian" ]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    else
        echo -e "${RED}✗ Install Node.js manually${NC}"
        exit 1
    fi
    echo "✓ Installed"
fi

# 2. RabbitMQ
echo -e "\n${YELLOW}[2/4] RabbitMQ${NC}"

# Check if port 5672 is accessible
if timeout 2 bash -c ">/dev/tcp/localhost/5672" 2>/dev/null; then
    echo "✓ Already running on port 5672"

    # Show if Docker
    if command -v docker >/dev/null && docker ps --format '{{.Ports}}' 2>/dev/null | grep -q "5672"; then
        CONTAINER=$(docker ps --format '{{.Names}}\t{{.Ports}}' | grep "5672" | awk '{print $1}' | head -1)
        echo "  (Docker container: $CONTAINER)"
    fi
else
    # Install if not running
    if [ "$OS" = "macos" ]; then
        brew install rabbitmq
        brew services start rabbitmq
    elif [ "$OS" = "debian" ]; then
        # Check for existing installation
        if command -v rabbitmq-server >/dev/null 2>&1; then
            echo "Starting existing installation..."
            sudo systemctl start rabbitmq-server
        else
            # Clean install
            sudo apt-get update
            sudo apt-get install -y rabbitmq-server
            sudo systemctl enable rabbitmq-server
            sudo systemctl start rabbitmq-server
        fi
    else
        echo -e "${RED}✗ Install RabbitMQ manually or use Docker:${NC}"
        echo "docker run -d --name rabbitmq -p 5672:5672 rabbitmq:3"
        exit 1
    fi

    # Wait and verify
    sleep 3
    if timeout 2 bash -c ">/dev/tcp/localhost/5672" 2>/dev/null; then
        echo "✓ Started successfully"
    else
        echo -e "${RED}✗ Failed to start. See deployment/guide.md${NC}"
        exit 1
    fi
fi

# 3. Ollama
echo -e "\n${YELLOW}[3/4] Ollama${NC}"
if command -v ollama >/dev/null 2>&1; then
    echo "✓ Already installed"
else
    curl -fsSL https://ollama.ai/install.sh | sh
    echo "✓ Installed"
fi

# Pull model
if ollama list 2>/dev/null | grep -q "qwen2.5:0.5b"; then
    echo "✓ Model qwen2.5:0.5b ready"
else
    echo "Pulling qwen2.5:0.5b..."
    ollama pull qwen2.5:0.5b
    echo "✓ Model downloaded"
fi

# 4. NPM packages
echo -e "\n${YELLOW}[4/4] NPM packages${NC}"
npm install
echo "✓ Installed"

# Setup .env
echo -e "\n${YELLOW}Configuration${NC}"
if [ ! -f .env ]; then
    cat > .env << 'EOF'
# LLM Configuration
USE_LOCAL_MODEL=true
OLLAMA_MODEL=qwen2.5:0.5b
OLLAMA_BASE_URL=http://localhost:11434

# API Keys (fill these in)
DEEPGRAM_API_KEY=your_deepgram_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
ELEVENLABS_VOICE_ID=your_voice_id_here
TWILIO_ACCOUNT_SID=your_twilio_account_sid_here
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here

# RabbitMQ Configuration
RABBITMQ_URL=amqp://localhost:5672
EOF
    echo "✓ Created .env template"
    echo -e "${YELLOW}⚠  Edit .env and add your API keys${NC}"
else
    echo "✓ .env already exists"
fi

# Ingest documents
if [ -d "data/documents" ] && [ "$(ls -A data/documents 2>/dev/null)" ]; then
    echo -e "\n${YELLOW}Ingesting documents...${NC}"
    node ingest-documents.js
    echo "✓ Documents ingested"
fi

# Done
echo -e "\n${GREEN}✓ Installation Complete!${NC}\n"
echo "Next steps:"
echo "1. Edit .env with your API keys"
echo "2. Run: npm start"
echo ""
echo "If errors occur, see: deployment/guide.md"
