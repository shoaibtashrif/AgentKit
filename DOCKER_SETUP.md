# Docker Setup Guide - Voice Agent

Complete Docker setup that includes **everything** you need. No external dependencies required!

## What's Included

All services run in Docker containers:
- **RabbitMQ** - Message queue for async processing
- **Ollama** - Local LLM service with qwen2.5:0.5b model (CPU-optimized)
- **Voice Agent App** - The main Node.js application
- **Sentence Transformers** - CPU-based embeddings (no GPU required)

## Prerequisites

- Docker Engine 20.10+ ([Install Docker](https://docs.docker.com/engine/install/))
- Docker Compose v2.0+ (included with Docker Desktop)
- At least 8GB RAM available
- At least 10GB free disk space

## Quick Start

### 1. Navigate to Project

```bash
cd /path/to/AgentKit
```

### 2. Ensure .env File Exists

Your `.env` file should contain:

```env
# Required API Keys
DEEPGRAM_API_KEY=your_deepgram_api_key
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_VOICE_ID=your_voice_id
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_phone
```

### 3. Add Your Documents

Place your knowledge base documents in `data/documents/`:

```bash
mkdir -p data/documents
cp your-knowledge-base/* data/documents/
```

### 4. Start Everything

**Option A - Using the script (recommended):**

```bash
./docker-start.sh
```

**Option B - Manual start:**

```bash
docker compose up -d
```

That's it! Everything will start automatically.

## What Happens on First Run

1. **Downloads Images** (~2 minutes)
   - RabbitMQ image (~50MB)
   - Ollama image (~500MB)
   - Builds Voice Agent image

2. **Downloads Model** (~5 minutes)
   - Ollama downloads qwen2.5:0.5b (~300MB)
   - Only happens on first run

3. **Starts Services** (~1 minute)
   - RabbitMQ starts
   - Ollama starts
   - Voice Agent initializes and auto-ingests documents

**Total first-run time: ~8-10 minutes**
**Subsequent starts: ~30 seconds**

## Service Access

Once running:

- **Voice Agent**
  - WebSocket: `ws://localhost:3001`
  - Twilio Webhook: `http://localhost:8081/voice`
  - Twilio Media Stream: `ws://localhost:8081`

- **RabbitMQ**
  - AMQP: `localhost:5672`
  - Management UI: `http://localhost:15672` (guest/guest)

- **Ollama**
  - API: `http://localhost:11434`
  - Model: qwen2.5:0.5b

## Common Commands

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f voice-agent
docker compose logs -f ollama
docker compose logs -f rabbitmq
```

### Check Status

```bash
docker compose ps
```

### Stop All Services

```bash
docker compose down
```

### Restart Services

```bash
# Restart all
docker compose restart

# Restart specific service
docker compose restart voice-agent
```

### Ingest New Documents

If you add documents to `data/documents/`:

```bash
docker exec voice-agent-app node ingest-documents.js
```

Or just restart (auto-ingests if documents are newer):

```bash
docker compose restart voice-agent
```

## Troubleshooting

### Services Won't Start

Check if ports are already in use:

```bash
lsof -i :5672   # RabbitMQ
lsof -i :11434  # Ollama
lsof -i :8081   # Voice Agent
lsof -i :3001   # WebSocket
```

If ports are in use, stop conflicting services:

```bash
# Kill processes on ports
lsof -ti:5672,11434,8081,3001 | xargs kill -9
```

### Out of Memory

If you see OOM errors:

1. Increase Docker memory (Settings > Resources)
2. Or reduce limits in `docker-compose.yml`:

```yaml
ollama:
  deploy:
    resources:
      limits:
        memory: 2G  # Reduce from 4G

voice-agent:
  deploy:
    resources:
      limits:
        memory: 1G  # Reduce from 2G
```

### Model Download Fails

If Ollama model download fails:

```bash
# Check Ollama logs
docker compose logs ollama-init

# Manually pull model
docker exec voice-agent-ollama ollama pull qwen2.5:0.5b

# Verify model
docker exec voice-agent-ollama ollama list
```

### Application Not Responding

```bash
# Check if all services are healthy
docker compose ps

# Check application logs
docker compose logs voice-agent

# Restart if needed
docker compose restart voice-agent
```

### Clean Reset

To completely reset everything:

```bash
# Stop and remove containers, networks, volumes
docker compose down -v

# Remove images (optional)
docker rmi agentkit-voice-agent ollama/ollama rabbitmq:3.12-management-alpine

# Start fresh
docker compose up -d
```

## Resource Usage

Default allocations:
- **Ollama**: 4 CPU cores, 4GB RAM
- **Voice Agent**: 2 CPU cores, 2GB RAM
- **RabbitMQ**: ~512MB RAM (default)

Minimum requirements:
- **Total RAM**: 6-8GB
- **CPU**: 4+ cores recommended
- **Disk**: 10GB free space

## Production Deployment

### 1. Use Environment-Specific Config

```bash
# Create production .env
cp .env .env.production
# Edit .env.production with production keys

# Start with production env
docker compose --env-file .env.production up -d
```

### 2. Enable HTTPS

Use a reverse proxy (Nginx, Traefik) in front of the services.

### 3. Set Up Monitoring

Add healthcheck endpoints to your monitoring:
- Voice Agent: `http://localhost:8081/health`
- RabbitMQ: `http://localhost:15672/api/healthchecks/node`

### 4. Configure Backups

```bash
# Backup volumes
docker run --rm \
  -v agentkit_vector_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/vector-data-backup.tar.gz /data

docker run --rm \
  -v agentkit_rabbitmq_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/rabbitmq-backup.tar.gz /data
```

### 5. Use Docker Secrets

Instead of .env files in production:

```yaml
services:
  voice-agent:
    secrets:
      - deepgram_key
      - elevenlabs_key

secrets:
  deepgram_key:
    external: true
  elevenlabs_key:
    external: true
```

## Updating

To update the application:

```bash
# Pull latest code
git pull

# Rebuild and restart
docker compose up -d --build

# Or rebuild specific service
docker compose up -d --build voice-agent
```

## Architecture

```
┌─────────────────────────────────────────┐
│  Docker Compose Network                 │
│                                          │
│  ┌──────────┐    ┌──────────┐           │
│  │ RabbitMQ │◄───┤  Voice   │           │
│  │          │    │  Agent   │           │
│  │  :5672   │───►│  :8081   │           │
│  └──────────┘    │  :3001   │           │
│                  └────┬─────┘           │
│                       │                 │
│                       ▼                 │
│                  ┌──────────┐           │
│                  │  Ollama  │           │
│                  │  :11434  │           │
│                  └──────────┘           │
│                                          │
└─────────────────────────────────────────┘
         │                    │
         │                    │
    External APIs        Local Files
    ─────────────        ──────────
    Deepgram STT         data/documents
    ElevenLabs TTS       data/vectorstore
    Twilio Phone
```

## Files

- `docker-compose.yml` - Complete multi-service setup
- `Dockerfile.app` - Voice Agent container definition
- `.dockerignore` - Build optimization
- `docker-start.sh` - Interactive setup script
- `DOCKER_SETUP.md` - This file

## Support

For issues:
1. Check logs: `docker compose logs -f`
2. Verify all services are healthy: `docker compose ps`
3. Ensure .env has all required keys
4. Check system resources (RAM, disk space)

## Summary

**Single command deployment:**

```bash
./docker-start.sh
```

Or:

```bash
docker compose up -d
```

That's it! Everything runs in Docker with no external dependencies.
