import WebSocket from 'ws';
import rabbitmq from '../config/rabbitmq.js';
import logger from '../utils/logger.js';

class ElevenLabsService {
  constructor(apiKey, voiceId) {
    this.apiKey = apiKey;
    this.voiceId = voiceId;
  }

  async startListening() {
    await rabbitmq.consume(rabbitmq.queues.TTS_REQUEST, async (message) => {
      const { sessionId, text } = message;
      await this.synthesize(sessionId, text);
    });
    logger.success('ElevenLabs', 'Service listening for TTS requests');
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

            // Handle audio chunks
            if (response.audio) {
              // Audio comes as base64 encoded μ-law
              const audioBuffer = Buffer.from(response.audio, 'base64');
              audioChunks.push(audioBuffer);
              totalBytes += audioBuffer.length;
            }

            // Handle completion
            if (response.isFinal) {
              logger.success('ElevenLabs', `Generated ${totalBytes} bytes μ-law audio (streaming)`);

              // Combine all chunks
              const completeAudio = Buffer.concat(audioChunks);

              const message = {
                sessionId,
                audio: Array.from(completeAudio),
                timestamp: Date.now()
              };

              await rabbitmq.publish(rabbitmq.queues.AUDIO_OUTPUT_TWILIO, message);
              await rabbitmq.publish(rabbitmq.queues.AUDIO_OUTPUT_WS, message);

              logger.success('ElevenLabs', `Audio sent to queues for session ${sessionId}`);

              ws.close();
              resolve();
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
}

export default ElevenLabsService;
