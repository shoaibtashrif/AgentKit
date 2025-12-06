# Northview Pain Management Center - Voice AI Assistant

A fully functional Voice AI assistant for Northview Pain Management Center with RAG (Retrieval-Augmented Generation) capabilities, optimized for low-latency voice interactions over Twilio.

## Features

- **Real-time Voice Conversation**: Twilio integration with WebSocket streaming
- **Speech-to-Text**: Deepgram for fast, accurate transcription
- **RAG System**: LangChain + HNSW vector store for knowledge base queries
- **Text-to-Speech**: ElevenLabs with streaming audio generation
- **LLM**: OpenAI GPT-4 with context-aware responses
- **Message Queue**: RabbitMQ for reliable inter-service communication
- **Low Latency**: Optimized for sub-second response times with chunked streaming
- **Session Isolation**: Proper session management prevents audio crossover

## System Architecture

```
Caller → Twilio → [WebSocket] → Deepgram (STT)
                                      ↓
                                 RabbitMQ → OpenAI + RAG → RabbitMQ
                                                               ↓
                                                         ElevenLabs (TTS)
                                                               ↓
                                                         Twilio → Caller
```

## Prerequisites

- Node.js v18 or higher
- RabbitMQ running locally (port 5672)
- ngrok (for Twilio webhook)
- API Keys:
  - Deepgram API key
  - OpenAI API key
  - ElevenLabs API key
  - Twilio Account SID and Auth Token

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd customVoiseAgent
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start RabbitMQ

Make sure RabbitMQ is running:

```bash
# Using Docker (recommended)
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management

# Or start system service
sudo systemctl start rabbitmq-server
```

### 4. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your API keys:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Deepgram
DEEPGRAM_API_KEY=your_deepgram_key

# OpenAI
OPENAI_API_KEY=your_openai_key

# ElevenLabs
ELEVENLABS_API_KEY=your_elevenlabs_key
ELEVENLABS_VOICE_ID=your_voice_id

# Twilio
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_number
```

### 5. Ingest Documents (RAG Setup)

The RAG system uses documents from the `data/documents/` directory. Sample documents about Northview Pain Management Center are already included.

To build the vector store:

```bash
npm run ingest
```

Expected output:
```
🔄 Starting document ingestion...
📚 Ingesting documents from data/documents directory...
[RAG] Loaded 5 documents
[RAG] Split into 21 chunks
[RAG] Creating embeddings and vector store...
✅ Document ingestion completed successfully!
📊 Vector store saved to: data/vectorstore
```

### 6. Start the Server

```bash
npm start
```

Expected output:
```
✅ Voice Agent is ready!
📡 WebSocket server: ws://localhost:3001
📞 Twilio webhook: http://localhost:8081/voice
📞 Twilio Media Stream: ws://localhost:8081
🎤 Ready for calls and browser connections
```

## Twilio Configuration

### 1. Start ngrok

In a new terminal:

```bash
ngrok http 8081
```

Copy the HTTPS forwarding URL (e.g., `https://abc123.ngrok.io`)

### 2. Update Twilio Webhook

Option A - Automatic:
```bash
npm run update-webhook
```

Option B - Manual:
1. Go to Twilio Console → Phone Numbers
2. Select your Twilio number
3. Under "Voice & Fax", set:
   - **A CALL COMES IN**: Webhook
   - URL: `https://your-ngrok-url.ngrok.io/voice`
   - HTTP: POST

## Testing

Call your Twilio phone number and try these queries:

### RAG-Powered Questions:
- "What services do you offer?"
- "What are your office hours?"
- "Do you accept my insurance?"
- "Who are the doctors at the clinic?"
- "How do I schedule an appointment?"

### General Conversational:
- "Hello, how are you?"
- "What's the weather like?"
- "Tell me a joke"

The system will:
1. Use RAG for questions about the clinic
2. Fall back to general LLM for other questions
3. Keep responses concise (1-3 sentences) for natural voice conversation

## Project Structure

```
customVoiseAgent/
├── src/
│   ├── config/
│   │   └── rabbitmq.js          # RabbitMQ configuration
│   ├── services/
│   │   ├── deepgram.js          # STT service
│   │   ├── openai.js            # LLM service with RAG
│   │   ├── elevenlabs.js        # TTS service
│   │   ├── twilio.js            # Twilio integration
│   │   └── rag.js               # RAG service (vector store)
│   ├── server/
│   │   └── websocket.js         # WebSocket server
│   ├── utils/
│   │   └── logger.js            # Logging utility
│   └── index.js                 # Main entry point
├── data/
│   ├── documents/               # Knowledge base documents
│   │   ├── about.txt
│   │   ├── services.txt
│   │   ├── appointments.txt
│   │   ├── insurance.txt
│   │   └── providers.txt
│   └── vectorstore/             # HNSW vector database (generated)
├── ingest-documents.js          # Document ingestion script
├── package.json
├── .env                         # Environment variables
└── README.md
```

## Adding Custom Documents

To add your own knowledge base:

1. Add `.txt` or `.pdf` files to `data/documents/`
2. Run document ingestion:
   ```bash
   npm run ingest
   ```
3. Restart the server:
   ```bash
   npm start
   ```

## Latency Optimization

The system is optimized for low latency:

- **Chunk Streaming**: Audio chunks are sent immediately as they're generated
- **Sentence-based Generation**: LLM streams responses sentence-by-sentence
- **Backpressure Management**: Prevents buffer overflows during rapid generation
- **Sequential Playback**: Queuing system ensures clean audio playback
- **Aggressive Interruption**: User can interrupt the agent with <500ms response time

## Troubleshooting

### RabbitMQ Connection Failed
```bash
# Check if RabbitMQ is running
sudo systemctl status rabbitmq-server

# Or check Docker container
docker ps | grep rabbitmq
```

### No Audio Playback
- Verify ElevenLabs API key and voice ID are correct
- Check logs for TTS errors
- Ensure RabbitMQ queues are processing

### RAG Not Working
- Verify vector store exists: `ls data/vectorstore/`
- Run ingestion if missing: `npm run ingest`
- Check OpenAI API key for embeddings

### Twilio Connection Issues
- Verify ngrok is running and URL is up-to-date in Twilio
- Check webhook logs in Twilio console
- Ensure server is running on port 8081

## Development

### Run in Development Mode (with auto-restart)

```bash
npm run dev
```

### View Logs

The system outputs detailed logs for debugging:
- `[RAG]` - RAG service operations
- `[OpenAI]` - LLM processing
- `[ElevenLabs]` - TTS generation
- `[Twilio]` - Call handling
- `[Deepgram]` - Transcription

## Performance Metrics

- **Time to First Audio**: < 1 second (with RAG)
- **Interruption Response**: < 500ms
- **Transcription Latency**: ~200-300ms (Deepgram)
- **TTS Generation**: ~500ms per sentence (ElevenLabs)

## Technologies Used

- **Runtime**: Node.js 18+
- **STT**: Deepgram WebSocket API
- **LLM**: OpenAI GPT-4o-mini
- **RAG**: LangChain + HNSW vector store
- **Embeddings**: OpenAI text-embedding-3-small
- **TTS**: ElevenLabs Turbo v2.5
- **Telephony**: Twilio Voice API
- **Message Queue**: RabbitMQ
- **WebSocket**: ws library

## License

ISC

## Support

For issues or questions, please open an issue in the repository.
