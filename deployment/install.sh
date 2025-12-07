#!/bin/bash

#############################################
# Voice Agent Installation Script
# Supports: Ubuntu/Debian, macOS
# Automatically installs all dependencies
#############################################

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════╗"
echo "║   Voice Agent Installation Script        ║"
echo "║   Installing all dependencies...          ║"
echo "╚═══════════════════════════════════════════╝"
echo -e "${NC}"

# Detect OS
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if [ -f /etc/debian_version ]; then
            OS="debian"
        elif [ -f /etc/redhat-release ]; then
            OS="redhat"
        else
            OS="linux"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
    else
        OS="unknown"
    fi
    echo -e "${GREEN}✓${NC} Detected OS: ${YELLOW}$OS${NC}"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Install Node.js
install_nodejs() {
    echo -e "\n${BLUE}[1/4]${NC} Checking Node.js..."

    if command_exists node; then
        NODE_VERSION=$(node --version)
        echo -e "${GREEN}✓${NC} Node.js already installed: ${YELLOW}$NODE_VERSION${NC}"

        # Check if version is >= 18
        MAJOR_VERSION=$(echo $NODE_VERSION | cut -d. -f1 | sed 's/v//')
        if [ "$MAJOR_VERSION" -lt 18 ]; then
            echo -e "${YELLOW}⚠${NC}  Node.js version is too old. Need v18 or higher."
            echo "Please upgrade Node.js manually: https://nodejs.org/"
            exit 1
        fi
    else
        echo -e "${YELLOW}⚠${NC}  Node.js not found. Installing..."

        if [ "$OS" = "macos" ]; then
            if ! command_exists brew; then
                echo -e "${RED}✗${NC} Homebrew not found. Please install from: https://brew.sh/"
                exit 1
            fi
            brew install node
        elif [ "$OS" = "debian" ]; then
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
        elif [ "$OS" = "redhat" ]; then
            curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
            sudo yum install -y nodejs
        else
            echo -e "${RED}✗${NC} Unsupported OS. Please install Node.js manually."
            exit 1
        fi

        echo -e "${GREEN}✓${NC} Node.js installed successfully"
    fi
}

# Install RabbitMQ
install_rabbitmq() {
    echo -e "\n${BLUE}[2/4]${NC} Checking RabbitMQ..."

    if command_exists rabbitmq-server; then
        echo -e "${GREEN}✓${NC} RabbitMQ already installed"
    else
        echo -e "${YELLOW}⚠${NC}  RabbitMQ not found. Installing..."

        if [ "$OS" = "macos" ]; then
            brew install rabbitmq
        elif [ "$OS" = "debian" ]; then
            sudo apt-get update
            sudo apt-get install -y rabbitmq-server
        elif [ "$OS" = "redhat" ]; then
            sudo yum install -y rabbitmq-server
        else
            echo -e "${RED}✗${NC} Unsupported OS. Please install RabbitMQ manually."
            exit 1
        fi

        echo -e "${GREEN}✓${NC} RabbitMQ installed successfully"
    fi

    # Start RabbitMQ
    echo "Starting RabbitMQ service..."
    if [ "$OS" = "macos" ]; then
        brew services start rabbitmq || true
    else
        sudo systemctl enable rabbitmq-server || true
        sudo systemctl start rabbitmq-server || true
    fi

    echo -e "${GREEN}✓${NC} RabbitMQ service started"
}

# Install Ollama
install_ollama() {
    echo -e "\n${BLUE}[3/4]${NC} Checking Ollama..."

    if command_exists ollama; then
        echo -e "${GREEN}✓${NC} Ollama already installed"
    else
        echo -e "${YELLOW}⚠${NC}  Ollama not found. Installing..."
        curl -fsSL https://ollama.ai/install.sh | sh
        echo -e "${GREEN}✓${NC} Ollama installed successfully"
    fi

    # Pull the model
    echo "Pulling Ollama model: qwen2.5:0.5b..."
    ollama pull qwen2.5:0.5b
    echo -e "${GREEN}✓${NC} Model downloaded"
}

# Install NPM dependencies
install_npm_deps() {
    echo -e "\n${BLUE}[4/4]${NC} Installing NPM packages..."

    npm install

    echo -e "${GREEN}✓${NC} NPM packages installed"
}

# Setup .env file
setup_env() {
    echo -e "\n${BLUE}[Config]${NC} Setting up environment variables..."

    if [ ! -f .env ]; then
        echo -e "${YELLOW}⚠${NC}  .env file not found. Creating template..."
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

# Optional: OpenAI (only if USE_LOCAL_MODEL=false)
# OPENAI_API_KEY=your_openai_api_key_here

# RabbitMQ Configuration
RABBITMQ_URL=amqp://localhost:5672
EOF
        echo -e "${GREEN}✓${NC} .env file created"
        echo -e "${YELLOW}⚠${NC}  IMPORTANT: Edit .env file and add your API keys!"
    else
        echo -e "${GREEN}✓${NC} .env file already exists"
    fi
}

# Ingest documents
ingest_documents() {
    echo -e "\n${BLUE}[Setup]${NC} Ingesting knowledge base documents..."

    if [ -d "data/documents" ] && [ "$(ls -A data/documents 2>/dev/null)" ]; then
        node ingest-documents.js
        echo -e "${GREEN}✓${NC} Documents ingested"
    else
        echo -e "${YELLOW}⚠${NC}  No documents found in data/documents/"
        echo "Skipping ingestion. Add documents later and run: node ingest-documents.js"
    fi
}

# Main installation flow
main() {
    detect_os
    install_nodejs
    install_rabbitmq
    install_ollama
    install_npm_deps
    setup_env
    ingest_documents

    echo -e "\n${GREEN}"
    echo "╔═══════════════════════════════════════════╗"
    echo "║   ✓ Installation Complete!               ║"
    echo "╚═══════════════════════════════════════════╝"
    echo -e "${NC}"

    echo -e "\n${BLUE}Next Steps:${NC}"
    echo "1. Edit .env file and add your API keys"
    echo "2. Start the server: ${YELLOW}npm start${NC}"
    echo "3. Server will run on:"
    echo "   - WebSocket: ws://localhost:3001"
    echo "   - Twilio: http://localhost:8081/voice"
    echo ""
    echo "For more details, see: deployment/DEPLOYMENT_GUIDE.md"
}

# Run installation
main
