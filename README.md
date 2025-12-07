# Voice Agent with Local RAG

An AI-powered voice agent for pain management clinics with Retrieval-Augmented Generation (RAG) using local embeddings. Handles phone calls, transcribes speech, answers questions using your knowledge base, and responds with natural-sounding voice.

## Features

- **Real-time Voice Conversations** via Twilio phone calls
- **Local RAG (Retrieval-Augmented Generation)** - No OpenAI required for embeddings
- **Pure Node.js** - No Python dependencies
- **Fast Local LLM** - Uses Ollama (qwen2.5:0.5b) for low-latency responses
- **Speech-to-Text** - Deepgram for accurate transcription
- **Text-to-Speech** - ElevenLabs for natural voice output
- **Knowledge Base** - Answers questions from your documents
- **Message Queue** - RabbitMQ for reliable async processing

## Quick Start (Automated Installation)

### Prerequisites

- A fresh or existing Linux/macOS machine
- Internet connection
- sudo access (for system packages)

### One-Command Install

```bash
cd AgentKit
./deployment/install.sh
```

This script will automatically install:
- Node.js (v18+)
- RabbitMQ
- Ollama + qwen2.5:0.5b model
- NPM dependencies
- Generate .env template

### After Installation

1. **Edit `.env` file** with your API keys:
   ```bash
   nano .env
   ```

2. **Add your documents** to `data/documents/`:
   ```bash
   # Add .txt files with your knowledge base
   cp your-docs/*.txt data/documents/
   ```

3. **Ingest documents** (if not done during install):
   ```bash
   node ingest-documents.js
   ```

4. **Start the server**:
   ```bash
   npm start
   ```

Server will be ready at:
- **WebSocket**: `ws://localhost:3001`
- **Twilio Webhook**: `http://localhost:8081/voice`

---

## Manual Installation

If you prefer to install dependencies manually, follow these steps:

### 1. Install Node.js (v18 or higher)

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
npm --version
```

### 2. Install RabbitMQ

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y rabbitmq-server
sudo systemctl enable rabbitmq-server
sudo systemctl start rabbitmq-server
```

**macOS:**
```bash
brew install rabbitmq
brew services start rabbitmq
```

**Verify:**
```bash
sudo rabbitmqctl status
```

### 3. Install Ollama

```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

**Pull the model:**
```bash
ollama pull qwen2.5:0.5b
```

**Verify:**
```bash
ollama list  # Should show qwen2.5:0.5b
```

### 4. Install NPM Dependencies

```bash
npm install
```

### 5. Configure Environment

Create `.env` file:
```bash
cp .env.example .env  # or create manually
```

Add your API keys to `.env`:
```env
# LLM Configuration
USE_LOCAL_MODEL=true
OLLAMA_MODEL=qwen2.5:0.5b
OLLAMA_BASE_URL=http://localhost:11434

# Required API Keys
DEEPGRAM_API_KEY=your_deepgram_api_key
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_VOICE_ID=your_voice_id
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token

# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672
```

### 6. Add Your Knowledge Base

Add `.txt` documents to `data/documents/`:
```bash
mkdir -p data/documents
# Add your .txt files here
```

### 7. Ingest Documents

```bash
node ingest-documents.js
```

This creates embeddings and stores them in `data/vectorstore/`.

### 8. Start the Server

```bash
npm start
```

---

## API Keys Setup

### Deepgram (Speech-to-Text)
1. Sign up: https://deepgram.com/
2. Get API key from dashboard
3. Add to `.env` as `DEEPGRAM_API_KEY`

### ElevenLabs (Text-to-Speech)
1. Sign up: https://elevenlabs.io/
2. Get API key
3. Get Voice ID from Voice Library
4. Add both to `.env`

### Twilio (Phone Calls)
1. Sign up: https://twilio.com/
2. Get Account SID and Auth Token
3. Add to `.env`
4. Configure webhook URL in Twilio console

---

## Project Structure

```
AgentKit/
├── src/
│   ├── services/
│   │   ├── local-embeddings.js  # Pure Node.js embeddings (Transformers.js)
│   │   ├── rag.js               # RAG service with FAISS
│   │   ├── ollama.js            # Local LLM service
│   │   ├── openai.js            # OpenAI service (optional)
│   │   ├── deepgram.js          # Speech-to-text
│   │   ├── elevenlabs.js        # Text-to-speech
│   │   └── twilio.js            # Phone call handling
│   ├── server/
│   │   └── websocket.js         # WebSocket server
│   ├── config/
│   │   └── rabbitmq.js          # Message queue config
│   └── index.js                 # Main entry point
├── data/
│   ├── documents/               # Your knowledge base (.txt files)
│   └── vectorstore/             # Generated embeddings (FAISS index)
├── deployment/
│   ├── install.sh               # Automated installation script
│   └── DEPLOYMENT_GUIDE.md      # Detailed deployment guide
├── ingest-documents.js          # Document ingestion script
├── package.json
└── .env                         # Configuration (create from template)
```

---

## Usage

### Testing Locally

1. **Start the server:**
   ```bash
   npm start
   ```

2. **Make a test call** using Twilio phone number

3. **Ask questions** like:
   - "What services do you offer?"
   - "Who are the physicians?"
   - "What insurance do you accept?"

### Re-ingesting Documents

If you update documents in `data/documents/`:

```bash
node ingest-documents.js
```

The server will automatically detect changes on next startup.

### Switching LLM Models

**To use OpenAI instead of Ollama:**
```env
USE_LOCAL_MODEL=false
OPENAI_API_KEY=your_key_here
```

**To change Ollama model:**
```env
OLLAMA_MODEL=llama2:7b  # or any other model
```

---

## Performance

- **Embedding Speed**: ~100-200ms (local, Node.js)
- **RAG Retrieval**: ~50-100ms (FAISS)
- **LLM Response**: ~500-1000ms (Ollama qwen2.5:0.5b)
- **Total Latency**: ~1-2 seconds (ideal for voice)

### Optimization Tips

1. **Use smaller Ollama models** for faster responses
2. **Reduce chunk size** in `rag.js` for shorter contexts
3. **Adjust k parameter** (number of retrieved chunks) for speed/accuracy tradeoff
4. **Use quantized models** for faster inference

---

## Troubleshooting

### RabbitMQ Connection Errors
```bash
sudo systemctl status rabbitmq-server
sudo systemctl restart rabbitmq-server
```

### Ollama Not Found
```bash
ollama serve  # Start Ollama manually
ollama list   # Check installed models
```

### Port Already in Use
```bash
lsof -ti:3001,8081 | xargs kill -9  # Kill processes on ports
```

### Model Loading Slow
First run downloads models (~25MB for embeddings, ~300MB for qwen2.5:0.5b). Subsequent runs are fast.

---

## Development

### Running Tests
```bash
npm test
```

### Viewing Logs
Logs are printed to console. For production, use PM2:
```bash
npm install -g pm2
pm2 start src/index.js --name voice-agent
pm2 logs voice-agent
```

---

## Documentation

- [Deployment Guide](deployment/DEPLOYMENT_GUIDE.md) - Detailed deployment instructions

---

## Tech Stack

- **Runtime**: Node.js v18+
- **LLM**: Ollama (qwen2.5:0.5b) / OpenAI (optional)
- **Embeddings**: Transformers.js (@xenova/transformers)
- **Vector Store**: FAISS (via LangChain)
- **STT**: Deepgram
- **TTS**: ElevenLabs
- **Telephony**: Twilio
- **Message Queue**: RabbitMQ
- **WebSocket**: ws library

---

Made with ❤️ for fast, local-first voice AI
