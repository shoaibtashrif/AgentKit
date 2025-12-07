# Docker Setup Guide for Voice Agent

This guide helps you deploy the entire voice agent system using Docker Compose with a single command.

## What's Included

The Docker setup includes:
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

### 1. Clone and Navigate to Project

```bash
cd /path/to/AgentKit
```

### 2. Create Environment File

Create a `.env` file in the root directory with your API keys:

```bash
# Copy the template
cp .env.example .env

# Edit with your actual API keys
nano .env
```

Required environment variables:

```env
# Deepgram API (Speech-to-Text)
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# OpenAI API (Optional - only if not using Ollama)
OPENAI_API_KEY=your_openai_api_key_here

# ElevenLabs API (Text-to-Speech)
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
ELEVENLABS_VOICE_ID=your_elevenlabs_voice_id_here

# Twilio (Phone Integration)
TWILIO_ACCOUNT_SID=your_twilio_account_sid_here
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here
TWILIO_PHONE_NUMBER=your_twilio_phone_number_here

# RabbitMQ (automatically configured in Docker)
RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
```

### 3. Add Your Documents

Place your knowledge base documents in the `data/documents/` directory:

```bash
mkdir -p data/documents
cp your-knowledge-base/*.txt data/documents/
```

### 4. Start All Services

Run the following command to start everything:

```bash
docker compose -f docker-compose.prod.yml up -d
```

This will:
- Pull all required Docker images
- Start RabbitMQ, Ollama, and the Voice Agent
- Download the qwen2.5:0.5b model (first run only, ~300MB)
- Build and start the application

### 5. Monitor Initial Setup

Watch the logs to see progress:

```bash
# View all logs
docker compose -f docker-compose.prod.yml logs -f

# View specific service logs
docker compose -f docker-compose.prod.yml logs -f voice-agent
docker compose -f docker-compose.prod.yml logs -f ollama
```

**First startup takes 5-10 minutes** as it downloads the Ollama model and builds embeddings.

### 6. Verify Services

Check that all services are running:

```bash
docker compose -f docker-compose.prod.yml ps
```

You should see:
- ✅ `voice-agent-rabbitmq` - healthy
- ✅ `voice-agent-ollama` - healthy
- ✅ `voice-agent-app` - healthy
- ✅ `voice-agent-ollama-init` - exited (completed)

### 7. Test the Application

The application is now available at:
- **WebSocket Server**: `ws://localhost:3001`
- **Twilio Webhook**: `http://localhost:8081/voice`
- **RabbitMQ Management UI**: `http://localhost:15672` (guest/guest)

## Usage

### Ingesting Documents

If you add new documents to `data/documents/`, rebuild the embeddings:

```bash
# Enter the container
docker exec -it voice-agent-app /bin/sh

# Run ingestion
node ingest-documents.js

# Exit container
exit
```

Or run it from host:

```bash
docker exec voice-agent-app node ingest-documents.js
```

### Viewing Logs

```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f voice-agent
docker compose -f docker-compose.prod.yml logs -f ollama
docker compose -f docker-compose.prod.yml logs -f rabbitmq
```

### Restarting Services

```bash
# Restart all services
docker compose -f docker-compose.prod.yml restart

# Restart specific service
docker compose -f docker-compose.prod.yml restart voice-agent
```

### Stopping Services

```bash
# Stop all services (keeps data)
docker compose -f docker-compose.prod.yml down

# Stop and remove volumes (deletes all data)
docker compose -f docker-compose.prod.yml down -v
```

## Service Details

### RabbitMQ
- **Port**: 5672 (AMQP), 15672 (Management UI)
- **Credentials**: guest/guest
- **Management UI**: http://localhost:15672

### Ollama
- **Port**: 11434
- **Model**: qwen2.5:0.5b (CPU-optimized, ~300MB)
- **Model Storage**: Persisted in `ollama_data` volume

### Voice Agent App
- **Ports**: 3001 (WebSocket), 8081 (HTTP)
- **Embeddings**: CPU-based Sentence Transformers
- **Vector Store**: FAISS (persisted in `vector_data` volume)

## Resource Configuration

Default resource limits (can be adjusted in docker-compose.prod.yml):

- **Ollama**: 4 CPU cores, 4GB RAM
- **Voice Agent**: 2 CPU cores, 2GB RAM
- **RabbitMQ**: Default (usually ~512MB)

To adjust resources, edit the `deploy.resources` section in `docker-compose.prod.yml`.

## Troubleshooting

### Container Fails to Start

```bash
# Check logs
docker compose -f docker-compose.prod.yml logs voice-agent

# Check health status
docker compose -f docker-compose.prod.yml ps
```

### Ollama Model Not Loading

```bash
# Check Ollama logs
docker compose -f docker-compose.prod.yml logs ollama

# Manually pull model
docker exec voice-agent-ollama ollama pull qwen2.5:0.5b

# Verify model is available
docker exec voice-agent-ollama ollama list
```

### RabbitMQ Connection Issues

```bash
# Check RabbitMQ status
docker compose -f docker-compose.prod.yml exec rabbitmq rabbitmq-diagnostics status

# Restart RabbitMQ
docker compose -f docker-compose.prod.yml restart rabbitmq
```

### Application Not Responding

```bash
# Check health endpoint
curl http://localhost:8081/health

# Check if ports are accessible
netstat -tlnp | grep -E '3001|8081'

# Restart application
docker compose -f docker-compose.prod.yml restart voice-agent
```

### Out of Memory

If you see OOM errors:

1. Increase Docker Desktop memory allocation (Settings > Resources)
2. Reduce resource limits in `docker-compose.prod.yml`
3. Use a smaller Ollama model (e.g., `qwen2.5:0.5b` is already the smallest)

### Slow Performance

To improve performance:

1. Ensure Docker has enough CPU cores allocated
2. Use SSD storage for Docker volumes
3. Reduce the number of retrieved documents in RAG (edit `src/services/ollama.js`)

## Production Deployment

For production deployment:

1. **Use environment-specific .env files**:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d
   ```

2. **Enable logging to files**:
   Add logging configuration to `docker-compose.prod.yml`

3. **Set up reverse proxy** (e.g., Nginx) for HTTPS

4. **Configure backups** for volumes:
   ```bash
   docker run --rm -v voice-agent_vector_data:/data -v $(pwd):/backup alpine tar czf /backup/vector-data-backup.tar.gz /data
   ```

5. **Monitor with healthchecks**:
   All services have healthcheck endpoints configured

6. **Use secrets management** instead of .env files

## Updating

To update the application:

```bash
# Pull latest code
git pull

# Rebuild and restart
docker compose -f docker-compose.prod.yml up -d --build

# Or rebuild specific service
docker compose -f docker-compose.prod.yml up -d --build voice-agent
```

## Uninstalling

To completely remove everything:

```bash
# Stop and remove containers, networks, and volumes
docker compose -f docker-compose.prod.yml down -v

# Remove images (optional)
docker rmi voice-agent-voice-agent ollama/ollama rabbitmq:3.12-management-alpine
```

## Advanced Configuration

### Using Different Ollama Model

Edit `docker-compose.prod.yml`:

```yaml
services:
  ollama-init:
    command: >
      -c "ollama pull llama2:7b"  # Change model here

  voice-agent:
    environment:
      - OLLAMA_MODEL=llama2:7b  # Change model here
```

### Exposing Services Externally

To access services from other machines, change ports in `docker-compose.prod.yml`:

```yaml
ports:
  - "0.0.0.0:3001:3001"  # WebSocket
  - "0.0.0.0:8081:8081"  # HTTP
```

**Warning**: Only do this behind a firewall or VPN!

### Using External RabbitMQ

If you have an existing RabbitMQ instance:

1. Remove the `rabbitmq` service from `docker-compose.prod.yml`
2. Update the `RABBITMQ_URL` in `.env` to point to your instance
3. Remove `rabbitmq` from `depends_on` in `voice-agent` service

## Support

For issues and questions:
- Check the logs: `docker compose -f docker-compose.prod.yml logs`
- Review the main README.md for application-specific documentation
- Verify all API keys are correct in `.env`

## Summary

**Single command to deploy everything:**

```bash
# 1. Create .env with your API keys
# 2. Add documents to data/documents/
# 3. Run:
docker compose -f docker-compose.prod.yml up -d

# 4. Monitor:
docker compose -f docker-compose.prod.yml logs -f
```

That's it! Your voice agent is now running with Ollama, RabbitMQ, and CPU-based embeddings.
