#!/bin/bash

set -e  # Exit on error

echo "🚀 Voice Agent Installation Script"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo -e "${RED}❌ Please do not run this script as root${NC}"
   exit 1
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check Node.js
echo "📦 Checking Node.js..."
if command_exists node; then
    NODE_VERSION=$(node -v)
    echo -e "${GREEN}✓ Node.js installed: $NODE_VERSION${NC}"
else
    echo -e "${RED}❌ Node.js not found${NC}"
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Check npm
echo "📦 Checking npm..."
if command_exists npm; then
    NPM_VERSION=$(npm -v)
    echo -e "${GREEN}✓ npm installed: $NPM_VERSION${NC}"
else
    echo -e "${RED}❌ npm not found${NC}"
    exit 1
fi

# Check RabbitMQ
echo "🐰 Checking RabbitMQ..."
if command_exists rabbitmq-server; then
    echo -e "${GREEN}✓ RabbitMQ installed${NC}"
else
    echo -e "${YELLOW}⚠ RabbitMQ not found. Installing...${NC}"
    
    # Add RabbitMQ repository
    sudo apt-get update
    sudo apt-get install -y curl gnupg apt-transport-https
    
    # Add RabbitMQ signing keys
    curl -1sLf "https://keys.openpgp.org/vks/v1/by-fingerprint/0A9AF2115F4687BD29803A206B73A36E6026DFCA" | sudo gpg --dearmor | sudo tee /usr/share/keyrings/com.rabbitmq.team.gpg > /dev/null
    curl -1sLf "https://github.com/rabbitmq/signing-keys/releases/download/3.0/rabbitmq-release-signing-key.asc" | sudo gpg --dearmor | sudo tee /usr/share/keyrings/rabbitmq.E495BB49CC4BBE5B.gpg > /dev/null
    
    # Add RabbitMQ repository
    sudo tee /etc/apt/sources.list.d/rabbitmq.list <<EOF2
deb [signed-by=/usr/share/keyrings/rabbitmq.E495BB49CC4BBE5B.gpg] https://ppa1.novemberain.com/rabbitmq/rabbitmq-erlang/deb/ubuntu jammy main
deb-src [signed-by=/usr/share/keyrings/rabbitmq.E495BB49CC4BBE5B.gpg] https://ppa1.novemberain.com/rabbitmq/rabbitmq-erlang/deb/ubuntu jammy main
deb [signed-by=/usr/share/keyrings/rabbitmq.E495BB49CC4BBE5B.gpg] https://ppa1.novemberain.com/rabbitmq/rabbitmq-server/deb/ubuntu jammy main
deb-src [signed-by=/usr/share/keyrings/rabbitmq.E495BB49CC4BBE5B.gpg] https://ppa1.novemberain.com/rabbitmq/rabbitmq-server/deb/ubuntu jammy main
EOF2
    
    # Install RabbitMQ
    sudo apt-get update -y
    sudo apt-get install -y rabbitmq-server
    
    # Enable and start RabbitMQ
    sudo systemctl enable rabbitmq-server
    sudo systemctl start rabbitmq-server
    
    echo -e "${GREEN}✓ RabbitMQ installed and started${NC}"
fi

# Check if RabbitMQ is running
echo "🔍 Checking RabbitMQ status..."
if sudo systemctl is-active --quiet rabbitmq-server; then
    echo -e "${GREEN}✓ RabbitMQ is running${NC}"
else
    echo -e "${YELLOW}⚠ Starting RabbitMQ...${NC}"
    sudo systemctl start rabbitmq-server
    sleep 3
    if sudo systemctl is-active --quiet rabbitmq-server; then
        echo -e "${GREEN}✓ RabbitMQ started successfully${NC}"
    else
        echo -e "${RED}❌ Failed to start RabbitMQ${NC}"
        exit 1
    fi
fi

# Install npm dependencies
echo "📦 Installing npm dependencies..."
npm install

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠ .env file not found${NC}"
    echo "Creating .env template..."
    cat > .env << 'EOF2'
# API Keys - Replace with your actual keys
DEEPGRAM_API_KEY=your_deepgram_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
ELEVENLABS_VOICE_ID=your_voice_id_here

# Twilio credentials
TWILIO_ACCOUNT_SID=your_twilio_account_sid_here
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here

# RabbitMQ connection
RABBITMQ_URL=amqp://localhost:5672
EOF2
    echo -e "${YELLOW}⚠ Please edit .env file with your API keys before running the app${NC}"
else
    echo -e "${GREEN}✓ .env file exists${NC}"
fi

echo ""
echo "=================================="
echo -e "${GREEN}✅ Installation Complete!${NC}"
echo "=================================="
echo ""
echo "Next steps:"
echo "1. Edit .env file with your API keys:"
echo "   nano .env"
echo ""
echo "2. Start the application:"
echo "   npm start"
echo ""
echo "3. The app will be available at:"
echo "   - WebSocket: ws://localhost:3001"
echo "   - Twilio Webhook: http://localhost:8081/voice"
echo ""
