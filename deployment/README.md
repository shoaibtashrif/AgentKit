# Deployment Scripts

This folder contains robust installation and cleanup scripts for the Voice Agent system.

## Quick Start

### Automated Installation (Recommended)

```bash
./deployment/install.sh
```

This script automatically:
- Detects your OS (Ubuntu/Debian/macOS/Amazon Linux/RHEL)
- Installs Node.js v18+
- Handles RabbitMQ in all scenarios (fresh install, Docker, system service, conflicts)
- Installs Ollama and pulls the qwen2.5:0.5b model
- Installs NPM dependencies
- Creates .env template
- Ingests documents if present

## Installation Scenarios Handled

### 1. Fresh System
The script will install all dependencies from scratch.

### 2. RabbitMQ Already Running in Docker
The script detects RabbitMQ running in Docker containers and uses it automatically.

**Example output:**
```
✓ RabbitMQ is already running and accessible on port 5672
ℹ  Running in Docker container: rabbitmq-container
```

### 3. System RabbitMQ Installed but Not Running
The script will start the existing service.

### 4. RabbitMQ in Failed State
The script detects failed installations and offers options:
1. Use existing RabbitMQ (Docker/other)
2. Stop conflicting services and restart
3. Exit and resolve manually

### 5. Port Conflicts
When port 5672 is in use, the script:
- Shows what's using the port
- Offers interactive resolution
- Prevents conflicts

## Troubleshooting

### If Installation Fails

#### 1. Use the Cleanup Script

```bash
./deployment/cleanup-rabbitmq.sh
```

This interactive script helps you:
- Identify what's using port 5672
- Stop Docker RabbitMQ containers
- Fix failed system installations
- Remove conflicting installations
- Perform full cleanup

#### 2. Common Issues

**Port 5672 already in use:**
```bash
# Check what's using the port
sudo lsof -i :5672

# Option A: Use cleanup script
./deployment/cleanup-rabbitmq.sh

# Option B: Manual cleanup
sudo systemctl stop rabbitmq-server
# or
docker stop <rabbitmq-container>
```

**Failed system RabbitMQ installation:**
```bash
# Use cleanup script
./deployment/cleanup-rabbitmq.sh
# Choose option 3: Fix failed installation

# Or manually:
sudo dpkg --configure -a
sudo apt-get install -f -y
sudo systemctl restart rabbitmq-server
```

**Multiple RabbitMQ installations:**
```bash
# Use cleanup script for full cleanup
./deployment/cleanup-rabbitmq.sh
# Choose option 6: Full cleanup

# Then reinstall
./deployment/install.sh
```

## Manual Installation

If you prefer manual control, see [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for step-by-step instructions.

## Script Features

### install.sh Features

✅ **OS Detection**: Automatically detects Ubuntu/Debian/macOS/RHEL/Amazon Linux
✅ **Conflict Resolution**: Handles Docker, system service, and port conflicts
✅ **Interactive Prompts**: Asks for user input when conflicts are detected
✅ **Verification**: Checks each service after installation
✅ **Summary Report**: Shows what's installed and how it's configured
✅ **Idempotent**: Safe to run multiple times

### cleanup-rabbitmq.sh Features

✅ **Comprehensive Detection**: Finds RabbitMQ in Docker, system service, and processes
✅ **Port Checking**: Shows what's using port 5672
✅ **Multiple Options**: From gentle stop to full cleanup
✅ **Safe**: Interactive confirmation before changes
✅ **Verification**: Checks port is free after cleanup

## Architecture

The Voice Agent requires these dependencies:

```
┌─────────────────────────────────────┐
│         Voice Agent                 │
│                                     │
│  ┌─────────────┐  ┌──────────────┐ │
│  │  Node.js    │  │   Ollama     │ │
│  │  (v18+)     │  │  (qwen2.5)   │ │
│  └─────────────┘  └──────────────┘ │
│                                     │
│  ┌─────────────┐  ┌──────────────┐ │
│  │  RabbitMQ   │  │NPM packages  │ │
│  │ (port 5672) │  │ (~40 deps)   │ │
│  └─────────────┘  └──────────────┘ │
└─────────────────────────────────────┘
         │
         └─── External APIs:
               • Deepgram (STT)
               • ElevenLabs (TTS)
               • Twilio (Phone)
```

## Environment Variables

After installation, configure `.env`:

```env
# LLM Configuration
USE_LOCAL_MODEL=true
OLLAMA_MODEL=qwen2.5:0.5b
OLLAMA_BASE_URL=http://localhost:11434

# Required API Keys
DEEPGRAM_API_KEY=your_key_here
ELEVENLABS_API_KEY=your_key_here
ELEVENLABS_VOICE_ID=your_voice_id_here
TWILIO_ACCOUNT_SID=your_sid_here
TWILIO_AUTH_TOKEN=your_token_here

# Infrastructure
RABBITMQ_URL=amqp://localhost:5672
```

## Verification

After installation, verify everything is working:

```bash
# Check Node.js
node --version  # Should be v18+

# Check RabbitMQ
sudo lsof -i :5672  # Should show RabbitMQ listening

# Check Ollama
ollama list  # Should show qwen2.5:0.5b

# Check services
ps aux | grep -E "node|rabbitmq|ollama"
```

## Getting Help

1. Check logs:
   ```bash
   # RabbitMQ logs
   sudo journalctl -u rabbitmq-server -n 50

   # Application logs
   npm start  # Logs to console
   ```

2. Run cleanup script:
   ```bash
   ./deployment/cleanup-rabbitmq.sh
   ```

3. See detailed guide:
   - [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)

## Docker vs System RabbitMQ

The script works with both! Here's when each is used:

**Docker RabbitMQ** (detected automatically):
- Already running in container
- Port 5672 accessible
- No system installation needed

**System RabbitMQ** (installed when needed):
- Fresh installation
- No Docker RabbitMQ detected
- Installed via apt/yum/brew

You can choose either - the script adapts to what you have.

## Support

For issues:
1. Run `./deployment/cleanup-rabbitmq.sh` to resolve conflicts
2. Check `DEPLOYMENT_GUIDE.md` for detailed troubleshooting
3. Review logs with `sudo journalctl -u rabbitmq-server -f`
4. Open a GitHub issue with error details
