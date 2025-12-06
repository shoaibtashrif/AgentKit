# Voice Agent - Installation Guide

## Requirements
- Node.js 18.x or higher
- Docker (for RabbitMQ)

## Installation Steps

### 1. Install RabbitMQ with Docker
```bash
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Create a `.env` file in the root directory with your API keys:

```env
DEEPGRAM_API_KEY=your_deepgram_key_here
OPENAI_API_KEY=your_openai_key_here
ELEVENLABS_API_KEY=your_elevenlabs_key_here
ELEVENLABS_VOICE_ID=your_voice_id_here
TWILIO_ACCOUNT_SID=your_twilio_sid_here
TWILIO_AUTH_TOKEN=your_twilio_token_here
```

**Note:** You don't need to set `RABBITMQ_URL` - the app automatically connects to `localhost:5672`

### 4. Start the Application
```bash
npm start
```

## Access Points
- WebSocket Server: `ws://localhost:3001`
- Twilio Webhook: `http://localhost:8081/voice`
- RabbitMQ Management UI: `http://localhost:15672` (user: guest, pass: guest)

## Common Commands

**Stop application:** Press `Ctrl+C`

**Stop RabbitMQ:**
```bash
docker stop rabbitmq
```

**Start RabbitMQ:**
```bash
docker start rabbitmq
```

**Remove RabbitMQ container:**
```bash
docker rm -f rabbitmq
```

**Check if ports are in use:**
```bash
lsof -ti:3001 -ti:8081
```

That's it! Your voice agent is ready to use.
