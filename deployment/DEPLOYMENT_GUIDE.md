# Voice Agent - Complete Deployment Guide

This guide covers everything you need to deploy the Voice Agent on a fresh or existing machine.

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Quick Installation](#quick-installation)
3. [Manual Step-by-Step Installation](#manual-step-by-step-installation)
4. [Configuration](#configuration)
5. [Testing](#testing)
6. [Production Deployment](#production-deployment)
7. [Troubleshooting](#troubleshooting)

---

## System Requirements

### Minimum Requirements
- **CPU**: 2 cores (4 cores recommended for Ollama)
- **RAM**: 4GB minimum (8GB recommended)
- **Disk**: 10GB free space
- **OS**: Ubuntu 20.04+, Debian 11+, macOS 12+, Amazon Linux 2023

### Network Requirements
- Outbound internet access (for API calls and model downloads)
- Inbound access on ports 3001, 8081 (if exposing publicly)
- Access to Twilio, Deepgram, ElevenLabs APIs

---

## Quick Installation

### Option 1: Automated Script (Recommended)

```bash
# Clone the repository
git clone <your-repo-url>
cd AgentKit

# Run installation script
./deployment/install.sh
```

The script will:
- ✅ Detect your OS (Ubuntu/Debian/macOS/Amazon Linux)
- ✅ Install Node.js v20
- ✅ Install and start RabbitMQ
- ✅ Install Ollama and pull qwen2.5:0.5b model
- ✅ Install NPM dependencies
- ✅ Create .env template
- ✅ Ingest sample documents (if present)

**After installation:**
1. Edit `.env` with your API keys
2. Run `npm start`

---

## Manual Step-by-Step Installation

If you prefer manual control or the script fails, follow these steps:

### Step 1: Install Node.js

**Ubuntu/Debian:**
```bash
# Add NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

**Amazon Linux 2023:**
```bash
# Install Node.js from Amazon repository
sudo yum install -y nodejs

# Verify
node --version
npm --version
```

**macOS (Homebrew):**
```bash
brew install node

# Verify
node --version
npm --version
```

### Step 2: Install RabbitMQ

RabbitMQ is used for message queue management between services.

**Ubuntu/Debian:**
```bash
# Update package list
sudo apt-get update

# Install RabbitMQ
sudo apt-get install -y rabbitmq-server

# Enable and start service
sudo systemctl enable rabbitmq-server
sudo systemctl start rabbitmq-server

# Verify it's running
sudo systemctl status rabbitmq-server
```

**Amazon Linux 2023:**
```bash
# Install EPEL repository
sudo yum install -y epel-release

# Install RabbitMQ
sudo yum install -y rabbitmq-server

# Enable and start
sudo systemctl enable rabbitmq-server
sudo systemctl start rabbitmq-server

# Verify
sudo systemctl status rabbitmq-server
```

**macOS (Homebrew):**
```bash
brew install rabbitmq

# Start service
brew services start rabbitmq

# Verify
brew services list | grep rabbitmq
```

**Test RabbitMQ:**
```bash
# Should show RabbitMQ status
sudo rabbitmqctl status

# Check if listening on port 5672
sudo lsof -i :5672
```

### Step 3: Install Ollama

Ollama provides local LLM inference.

**Linux (all distributions) & macOS:**
```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Verify installation
ollama --version
```

**Pull the model:**
```bash
# Download qwen2.5:0.5b model (~300MB)
ollama pull qwen2.5:0.5b

# Verify model is downloaded
ollama list
# Should show: qwen2.5:0.5b
```

**Start Ollama service:**
```bash
# Ollama runs as a service automatically after install
# To check status:
ps aux | grep ollama

# To start manually if needed:
ollama serve
```

### Step 4: Clone and Setup Project

```bash
# Clone repository
git clone <your-repo-url>
cd AgentKit

# Install NPM dependencies
npm install
```

### Step 5: Configure Environment Variables

Create `.env` file in the project root:

```bash
nano .env
```

Add the following configuration:

```env
# ============================================
# LLM Configuration
# ============================================
USE_LOCAL_MODEL=true
OLLAMA_MODEL=qwen2.5:0.5b
OLLAMA_BASE_URL=http://localhost:11434

# Optional: Use OpenAI instead (set USE_LOCAL_MODEL=false)
# OPENAI_API_KEY=sk-...

# ============================================
# Speech Services
# ============================================
# Deepgram (Speech-to-Text)
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# ElevenLabs (Text-to-Speech)
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
ELEVENLABS_VOICE_ID=your_voice_id_here

# ============================================
# Telephony
# ============================================
# Twilio (Phone Calls)
TWILIO_ACCOUNT_SID=your_twilio_account_sid_here
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here

# ============================================
# Infrastructure
# ============================================
# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672
```

### Step 6: Add Knowledge Base Documents

```bash
# Create documents directory if it doesn't exist
mkdir -p data/documents

# Add your .txt files
cp /path/to/your/docs/*.txt data/documents/

# Verify files are added
ls -la data/documents/
```

### Step 7: Ingest Documents

This step creates embeddings from your documents:

```bash
# Run ingestion script
node ingest-documents.js
```

Expected output:
```
🔄 Starting document ingestion with local embeddings...
[Embeddings] Loading model: Xenova/all-MiniLM-L6-v2...
[Embeddings] Model loaded successfully
[RAG] Loaded 5 documents
[RAG] Split into 38 chunks
✓ RAG FAISS vector store created and saved successfully
✅ Document ingestion completed successfully!
```

### Step 8: Start the Server

```bash
npm start
```

Expected output:
```
🤖 Using local Ollama model: qwen2.5:0.5b
✓ RabbitMQ connected and queues initialized
✓ Local embedding service started
✓ RAG service initialized
✓ Ollama service listening
✓ WebSocket server listening on port 3001
✓ Twilio webhook server listening on port 8081
✅ Voice Agent is ready!
```

---

## Configuration

### API Keys

#### Deepgram (Speech-to-Text)
1. Sign up at https://deepgram.com/
2. Go to Dashboard → API Keys
3. Create new API key
4. Copy and paste into `.env`

#### ElevenLabs (Text-to-Speech)
1. Sign up at https://elevenlabs.io/
2. Go to Profile → API Key
3. Copy API key
4. Go to Voice Library → Select a voice
5. Copy Voice ID (found in voice settings)
6. Add both to `.env`

#### Twilio (Phone Calls)
1. Sign up at https://twilio.com/
2. Get Account SID from Console Dashboard
3. Get Auth Token from Console Dashboard
4. Add both to `.env`
5. Configure webhook (see Twilio Setup below)

### Twilio Webhook Setup

1. Go to Twilio Console → Phone Numbers
2. Select your Twilio phone number
3. Under "Voice & Fax":
   - **A CALL COMES IN**: Webhook
   - **URL**: `https://your-domain.com/voice` (or ngrok URL for testing)
   - **HTTP**: POST
4. Save configuration

**For local testing with ngrok:**
```bash
# Install ngrok
npm install -g ngrok

# Expose port 8081
ngrok http 8081

# Use the https URL provided (e.g., https://abc123.ngrok.io/voice)
```

### Model Configuration

#### Switching to Different Ollama Model

```env
# Faster but less accurate
OLLAMA_MODEL=qwen2.5:0.5b

# Better quality but slower
OLLAMA_MODEL=llama2:7b

# Best quality (requires more RAM)
OLLAMA_MODEL=llama2:13b
```

Pull the new model:
```bash
ollama pull llama2:7b
```

#### Using OpenAI Instead of Ollama

```env
USE_LOCAL_MODEL=false
OPENAI_API_KEY=sk-your-openai-key
```

---

## Testing

### 1. Health Check

```bash
# Check if all services are running
ps aux | grep -E "node|rabbitmq|ollama"

# Check ports
lsof -i :3001  # WebSocket server
lsof -i :8081  # Twilio webhook
lsof -i :5672  # RabbitMQ
lsof -i :11434 # Ollama
```

### 2. Test RAG System

```bash
# Quick test script
node -e "
const RAGService = require('./src/services/rag.js').default;
(async () => {
  const rag = new RAGService();
  await rag.initialize();
  const result = await rag.query('What services do you offer?');
  console.log('RAG Result:', result);
  process.exit(0);
})();
"
```

### 3. Make a Test Call

1. Call your Twilio phone number
2. Ask a question like: "Who are the physicians?"
3. Check server logs for:
   - Deepgram transcription
   - RAG query results
   - Ollama LLM response
   - ElevenLabs TTS generation

---

## Production Deployment

### Using PM2 (Process Manager)

```bash
# Install PM2 globally
npm install -g pm2

# Start application
pm2 start src/index.js --name voice-agent

# View logs
pm2 logs voice-agent

# Monitor
pm2 monit

# Auto-restart on system reboot
pm2 startup
pm2 save

# Stop application
pm2 stop voice-agent

# Restart application
pm2 restart voice-agent
```

### Using Systemd (Linux)

Create service file:
```bash
sudo nano /etc/systemd/system/voice-agent.service
```

Add configuration:
```ini
[Unit]
Description=Voice Agent Service
After=network.target rabbitmq-server.service

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/AgentKit
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable voice-agent
sudo systemctl start voice-agent
sudo systemctl status voice-agent
```

### Security Considerations

1. **API Keys**: Never commit `.env` to git
2. **Firewall**: Only expose necessary ports
3. **SSL/TLS**: Use HTTPS for webhooks
4. **Rate Limiting**: Implement rate limits for API calls
5. **Monitoring**: Set up logging and alerts

---

## Troubleshooting

### Issue: RabbitMQ Connection Failed

**Error**: `Error: connect ECONNREFUSED 127.0.0.1:5672`

**Solution**:
```bash
# Check if RabbitMQ is running
sudo systemctl status rabbitmq-server

# Restart if needed
sudo systemctl restart rabbitmq-server

# Check logs
sudo journalctl -u rabbitmq-server -f
```

### Issue: Ollama Model Not Found

**Error**: `model 'qwen2.5:0.5b' not found`

**Solution**:
```bash
# Pull the model
ollama pull qwen2.5:0.5b

# Verify
ollama list

# Check Ollama is running
ps aux | grep ollama
```

### Issue: Port Already in Use

**Error**: `Error: listen EADDRINUSE: address already in use :::3001`

**Solution**:
```bash
# Find and kill process
lsof -ti:3001 | xargs kill -9
lsof -ti:8081 | xargs kill -9

# Then restart
npm start
```

### Issue: Embeddings Model Download Slow

**Symptom**: First run takes a long time

**Explanation**: Transformers.js downloads model (~25MB) on first run. This is cached for subsequent runs.

**Speed up**:
```bash
# Pre-download models
node -e "
const { pipeline } = require('@xenova/transformers');
(async () => {
  await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  console.log('Model cached!');
  process.exit(0);
})();
"
```

### Issue: No Documents in RAG

**Error**: `No documents found to ingest`

**Solution**:
```bash
# Check documents directory
ls -la data/documents/

# Add documents
cp your-docs/*.txt data/documents/

# Re-ingest
node ingest-documents.js
```

### Issue: High Memory Usage

**Symptom**: Server uses >2GB RAM

**Causes**:
- Large Ollama model (llama2:13b uses ~8GB)
- Many concurrent calls

**Solutions**:
1. Use smaller model:
   ```env
   OLLAMA_MODEL=qwen2.5:0.5b  # ~300MB
   ```

2. Limit concurrent connections in code

3. Add swap space:
   ```bash
   sudo fallocate -l 4G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   ```

---

## Performance Tuning

### Optimize Response Time

1. **Use smaller Ollama models**:
   - qwen2.5:0.5b: ~500ms response time
   - llama2:7b: ~2s response time

2. **Reduce RAG chunks**:
   ```javascript
   // In src/services/ollama.js
   const ragResult = await this.ragService.query(userMessage, 2, 0.5);
   // Reduce first parameter from 3 to 2
   ```

3. **Optimize chunk size**:
   ```javascript
   // In src/services/rag.js
   chunkSize: 250  // Reduce from 300
   ```

### Scale Horizontally

For high traffic:
1. Run multiple instances behind load balancer
2. Share RabbitMQ between instances
3. Use Redis for session storage
4. Scale Ollama separately

---

## Backup and Recovery

### Backup Vector Store

```bash
# Backup embeddings
tar -czf vectorstore-backup-$(date +%Y%m%d).tar.gz data/vectorstore/

# Restore
tar -xzf vectorstore-backup-20250107.tar.gz
```

### Backup Configuration

```bash
# Backup .env (keep secure!)
cp .env .env.backup
```

---

## Monitoring

### Check Service Health

```bash
# Create health check script
cat > check-health.sh << 'EOF'
#!/bin/bash
echo "=== Voice Agent Health Check ==="
echo "Node.js: $(node --version)"
echo "RabbitMQ: $(sudo systemctl is-active rabbitmq-server)"
echo "Ollama: $(ps aux | grep ollama | grep -v grep | wc -l) processes"
echo "Port 3001: $(lsof -i :3001 | grep LISTEN | wc -l) listeners"
echo "Port 8081: $(lsof -i :8081 | grep LISTEN | wc -l) listeners"
EOF

chmod +x check-health.sh
./check-health.sh
```

---

## Support

For additional help:
- Check logs: `pm2 logs voice-agent` or `journalctl -u voice-agent -f`
- Review README.md
- Open GitHub issue with error logs

---

**Deployment complete!** Your Voice Agent should now be running in production.
