# Voice Agent Application Dockerfile
FROM node:18-slim

# Install dependencies for node-gyp and native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install npm dependencies
RUN npm install --omit=dev

# Copy application code
COPY src ./src
COPY ingest-documents.js ./
COPY .env.example ./

# Create data directories
RUN mkdir -p data/documents data/vectorstore

# Expose ports
# 3001 - WebSocket server
# 8081 - Twilio webhook server
EXPOSE 3001 8081

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8081/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Start the application
CMD ["node", "src/index.js"]
