#!/bin/bash

echo "🚀 Starting Voice Agent..."
echo ""

# Check if RabbitMQ is running
if ! docker ps | grep -q voice-agent-rabbitmq; then
    echo "📦 Starting RabbitMQ..."
    docker start voice-agent-rabbitmq 2>/dev/null || \
    docker run -d --name voice-agent-rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management
    echo "⏳ Waiting for RabbitMQ to be ready..."
    sleep 5
else
    echo "✓ RabbitMQ is already running"
fi

echo ""
echo "🎤 Starting Voice Agent Server..."
npm start
