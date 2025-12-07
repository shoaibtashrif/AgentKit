# Installation Guide

## Automatic Installation

```bash
./deployment/install.sh
```

That's it. If it works, you're done.

---

## Manual Steps (if auto install fails)

### 1. Install RabbitMQ

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y rabbitmq-server
sudo systemctl start rabbitmq-server
```

**macOS:**
```bash
brew install rabbitmq
brew services start rabbitmq
```

**Or use Docker:**
```bash
docker run -d --name rabbitmq -p 5672:5672 rabbitmq:3-management
```

**Verify:** Port 5672 should be listening
```bash
sudo lsof -i :5672
```

---

### 2. Install Ollama

```bash
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull qwen2.5:0.5b
```

**Verify:**
```bash
ollama list
```

---

### 3. Install Node.js (v18+)

**Ubuntu/Debian:**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**macOS:**
```bash
brew install node
```

**Verify:**
```bash
node --version  # Should be v18+
```

---

### 4. Install Dependencies

```bash
npm install
```

This installs:
- `@xenova/transformers` (CPU embeddings)
- `langchain`, `faiss-node` (RAG)
- `@deepgram/sdk`, `elevenlabs-node`, `twilio` (APIs)
- All other dependencies

---

### 5. Configure Environment

Create `.env` file:

```bash
# LLM
USE_LOCAL_MODEL=true
OLLAMA_MODEL=qwen2.5:0.5b
OLLAMA_BASE_URL=http://localhost:11434

# API Keys
DEEPGRAM_API_KEY=your_key
ELEVENLABS_API_KEY=your_key
ELEVENLABS_VOICE_ID=your_voice_id
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token

# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672
```

---

### 6. Ingest Documents (Optional)

```bash
# Add .txt files to data/documents/
node ingest-documents.js
```

---

### 7. Start

```bash
npm start
```

---

## Common Errors

### Port 5672 already in use
```bash
# Check what's using it
sudo lsof -i :5672

# Kill it or use what's there
sudo systemctl stop rabbitmq-server
# OR
docker stop <container-name>
```

### Ollama model not found
```bash
ollama pull qwen2.5:0.5b
```

### Port 3001/8081 in use
```bash
lsof -ti:3001,8081 | xargs kill -9
```

### RabbitMQ connection failed
```bash
# Restart RabbitMQ
sudo systemctl restart rabbitmq-server
# OR
docker restart rabbitmq
```

---

## Requirements Summary

- **Node.js**: v18+
- **RabbitMQ**: Running on port 5672 (system or Docker)
- **Ollama**: With qwen2.5:0.5b model
- **NPM packages**: Run `npm install`

That's all you need.
