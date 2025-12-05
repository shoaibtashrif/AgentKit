import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import rabbitmq from '../config/rabbitmq.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class VoiceWebSocketServer {
  constructor(port = 3000) {
    this.port = port;
    this.wss = null;
    this.httpServer = null;
    this.sessions = new Map();
    this.onAudioData = null;
    this.onSessionStart = null;
    this.onSessionEnd = null;
  }

  async start() {
    this.httpServer = createServer((req, res) => {
      if (req.url === '/client/index.html' || req.url === '/') {
        try {
          const filePath = join(__dirname, '../../client/index.html');
          const content = readFileSync(filePath, 'utf8');
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(content);
        } catch (error) {
          res.writeHead(404);
          res.end('File not found');
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    this.httpServer.listen(this.port);
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on('connection', (ws) => {
      const sessionId = randomUUID();
      console.log(`✓ New WebSocket connection: ${sessionId}`);

      this.sessions.set(sessionId, ws);

      ws.on('message', async (data) => {
        try {
          if (data instanceof Buffer) {
            if (this.onAudioData) {
              this.onAudioData(sessionId, data);
            }
          } else {
            const message = JSON.parse(data.toString());
            this.handleMessage(sessionId, message);
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        console.log(`WebSocket connection closed: ${sessionId}`);
        this.sessions.delete(sessionId);
        if (this.onSessionEnd) {
          this.onSessionEnd(sessionId);
        }
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error for session ${sessionId}:`, error);
      });

      ws.send(JSON.stringify({
        type: 'session_started',
        sessionId
      }));

      if (this.onSessionStart) {
        this.onSessionStart(sessionId, ws);
      }
    });

    await this.startAudioListener();

    console.log(`✓ WebSocket server listening on port ${this.port}`);
  }

  async startAudioListener() {
    await rabbitmq.consume(rabbitmq.queues.AUDIO_OUTPUT_WS, async (message) => {
      const { sessionId, audio } = message;
      this.sendAudio(sessionId, audio);
    });

    await rabbitmq.consume(rabbitmq.queues.CLEAR_AUDIO, async (message) => {
      const { sessionId } = message;
      this.clearAudio(sessionId);
    });
  }

  async handleMessage(sessionId, message) {
    console.log(`Message from ${sessionId}:`, message);

    switch (message.type) {
      case 'start_recording':
        console.log(`Recording started for session: ${sessionId}`);
        break;
      case 'stop_recording':
        console.log(`Recording stopped for session: ${sessionId}`);
        break;
      case 'text_message':
        console.log(`Text message from ${sessionId}: ${message.text}`);
        await rabbitmq.publish(rabbitmq.queues.LLM_REQUEST, {
          sessionId,
          transcript: message.text,
          timestamp: Date.now()
        });
        break;
      default:
        console.log(`Unknown message type: ${message.type}`);
    }
  }

  sendAudio(sessionId, audioData) {
    const ws = this.sessions.get(sessionId);
    if (ws && ws.readyState === ws.OPEN) {
      const buffer = Buffer.from(audioData);
      ws.send(JSON.stringify({
        type: 'audio',
        audio: buffer.toString('base64')
      }));
    }
  }

  sendTranscript(sessionId, transcript) {
    const ws = this.sessions.get(sessionId);
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'transcript',
        text: transcript
      }));
    }
  }

  sendResponse(sessionId, text) {
    const ws = this.sessions.get(sessionId);
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'response',
        text
      }));
    }
  }

  clearAudio(sessionId) {
    const ws = this.sessions.get(sessionId);
    if (ws && ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'clear_audio'
      }));
    }
  }

  close() {
    if (this.wss) {
      this.wss.close();
    }
  }
}

export default VoiceWebSocketServer;
