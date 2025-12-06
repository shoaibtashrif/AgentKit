import WebSocket from 'ws';
import rabbitmq from '../config/rabbitmq.js';
import logger from '../utils/logger.js';

class ElevenLabsService {
  constructor(apiKey, voiceId) {
    this.apiKey = apiKey;
    this.voiceId = voiceId;
    this.sessionQueues = new Map(); // Queue per session to prevent overlap
    this.processing = new Map(); // Track which sessions are processing
    this.activeWebSockets = new Map(); // Track active WebSocket per session
  }

  async startListening() {
    await rabbitmq.consume(rabbitmq.queues.TTS_REQUEST, async (message) => {
      const { sessionId, text } = message;

      // Add to session queue
      if (!this.sessionQueues.has(sessionId)) {
        this.sessionQueues.set(sessionId, []);
      }
      this.sessionQueues.get(sessionId).push(text);

      // Process queue if not already processing
      if (!this.processing.get(sessionId)) {
        this.processQueue(sessionId);
      }
    });
    logger.success('ElevenLabs', 'Service listening for TTS requests');
  }

  async processQueue(sessionId) {
    const queue = this.sessionQueues.get(sessionId);
    if (!queue || queue.length === 0) {
      this.processing.set(sessionId, false);
      return;
    }

    this.processing.set(sessionId, true);
    const text = queue.shift(); // Get next text from queue

    await this.synthesize(sessionId, text);

    // Process next in queue
    if (queue.length > 0) {
      this.processQueue(sessionId);
    } else {
      this.processing.set(sessionId, false);
    }
  }

  async synthesize(sessionId, text) {
    return new Promise((resolve, reject) => {
      try {
        logger.info('ElevenLabs', `Synthesizing: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

        // WebSocket streaming endpoint (like working project)
        const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream-input?model_id=eleven_turbo_v2_5&output_format=ulaw_8000`;

        const ws = new WebSocket(wsUrl);
        const audioChunks = [];
        let totalBytes = 0;

        // Store active WebSocket for this session
        this.activeWebSockets.set(sessionId, ws);

        ws.on('open', () => {
          logger.info('ElevenLabs', 'WebSocket connected');

          // Send initial configuration (required by ElevenLabs)
          const initMessage = {
            text: ' ',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0.0,
              use_speaker_boost: true
            },
            xi_api_key: this.apiKey
          };
          ws.send(JSON.stringify(initMessage));

          // Send the actual text with flush
          ws.send(JSON.stringify({
            text: text,
            flush: true
          }));

          // Send empty text to signal end
          ws.send(JSON.stringify({ text: '' }));
        });

        ws.on('message', async (data) => {
          try {
            const response = JSON.parse(data.toString());

            // Handle audio chunks - stream immediately!
            if (response.audio) {
              // Audio comes as base64 encoded μ-law
              const audioBuffer = Buffer.from(response.audio, 'base64');
              audioChunks.push(audioBuffer);
              totalBytes += audioBuffer.length;

              // Stream chunk immediately to Twilio (don't wait for isFinal)
              const message = {
                sessionId,
                audio: Array.from(audioBuffer),
                timestamp: Date.now(),
                streaming: true // Mark as streaming chunk
              };

              await rabbitmq.publish(rabbitmq.queues.AUDIO_OUTPUT_TWILIO, message);
              await rabbitmq.publish(rabbitmq.queues.AUDIO_OUTPUT_WS, message);
            }

            // Handle completion
            if (response.isFinal) {
              logger.success('ElevenLabs', `Streamed ${totalBytes} bytes μ-law audio in ${audioChunks.length} chunks`);

              // Send end-of-sentence marker
              const endMessage = {
                sessionId,
                audio: [],
                timestamp: Date.now(),
                streaming: false,
                endOfSentence: true
              };

              await rabbitmq.publish(rabbitmq.queues.AUDIO_OUTPUT_TWILIO, endMessage);

              ws.close();

              // Wait a bit to ensure audio is sent before resolving
              setTimeout(() => resolve(), 100);
            }
          } catch (error) {
            logger.error('ElevenLabs', 'Error processing WebSocket message', { error: error.message });
          }
        });

        ws.on('error', (error) => {
          logger.error('ElevenLabs', 'WebSocket error', { error: error.message });
          reject(error);
        });

        ws.on('close', () => {
          logger.info('ElevenLabs', 'WebSocket closed');
          // Remove from active WebSockets
          if (this.activeWebSockets.get(sessionId) === ws) {
            this.activeWebSockets.delete(sessionId);
          }
        });

        // Timeout after 30 seconds
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
            reject(new Error('ElevenLabs WebSocket timeout'));
          }
        }, 30000);

      } catch (error) {
        logger.error('ElevenLabs', 'Synthesis error', { error: error.message });
        reject(error);
      }
    });
  }

  stopGeneration(sessionId) {
    // Stop processing immediately
    this.processing.set(sessionId, false);

    // Clear the queue
    if (this.sessionQueues.has(sessionId)) {
      this.sessionQueues.set(sessionId, []);
    }

    // Close any active WebSocket immediately
    const ws = this.activeWebSockets.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
      logger.warn('ElevenLabs', `🛑 Stopped generation for session ${sessionId}`);
    }
    this.activeWebSockets.delete(sessionId);
  }

  clearSession(sessionId) {
    // Stop any active generation
    this.stopGeneration(sessionId);

    // Remove all session data
    this.processing.delete(sessionId);
    this.sessionQueues.delete(sessionId);

    logger.info('ElevenLabs', `Session ${sessionId} cleared`);
  }
}

export default ElevenLabsService;
