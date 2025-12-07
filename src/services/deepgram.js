import { createClient } from '@deepgram/sdk';
import rabbitmq from '../config/rabbitmq.js';
import logger from '../utils/logger.js';

class DeepgramService {
  constructor(apiKey) {
    this.client = createClient(apiKey);
    this.connections = new Map();
  }

  async startTranscription(sessionId, onTranscript, sampleRate = 16000) {
    try {
      logger.info('Deepgram', `Starting connection @ ${sampleRate}Hz for session ${sessionId}`);

      const connection = this.client.listen.live({
        model: 'nova-2',
        encoding: 'linear16',
        sample_rate: sampleRate,
        channels: 1,
        interim_results: true,
        smart_format: true,
        punctuate: true
      });

      // Wait for connection to open before proceeding
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Deepgram connection timeout'));
        }, 10000);

        connection.on('open', () => {
          clearTimeout(timeout);
          logger.success('Deepgram', `Connection opened for session ${sessionId} @ ${sampleRate}Hz`);
          resolve();
        });

        connection.on('error', (error) => {
          clearTimeout(timeout);
          logger.error('Deepgram', `Connection error for session ${sessionId}`, { error: error.message || error });
          this.connections.delete(sessionId);
          reject(error);
        });
      });

      let lastInterruptTime = 0;
      let interimTranscriptBuffer = '';
      let interimStartTime = 0;

      connection.on('Results', async (data) => {
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        const isFinal = data.is_final;
        const speechFinal = data.speech_final;

        // Handle interruption - if user starts speaking, stop current audio
        // Require 2+ words OR 150ms+ of speech to avoid false triggers from noise
        if (transcript && transcript.trim().length > 0 && !isFinal) {
          const now = Date.now();

          // Start tracking interim speech
          if (interimTranscriptBuffer === '') {
            interimStartTime = now;
            interimTranscriptBuffer = transcript;
          } else {
            interimTranscriptBuffer = transcript;
          }

          const speechDuration = now - interimStartTime;
          const wordCount = transcript.trim().split(/\s+/).length;

          // Trigger interruption if:
          // - At least 2 words spoken OR
          // - More than 150ms of continuous speech OR
          // - Transcript is 5+ characters long
          // AND we haven't interrupted in the last 500ms
          const shouldInterrupt =
            (wordCount >= 2 || speechDuration > 150 || transcript.trim().length >= 5) &&
            (now - lastInterruptTime > 500);

          if (shouldInterrupt) {
            logger.info('Deepgram', `🛑 User interruption detected: "${transcript}" (${wordCount} words, ${speechDuration}ms)`);
            await rabbitmq.publish(rabbitmq.queues.CLEAR_AUDIO, {
              sessionId,
              timestamp: now
            });
            lastInterruptTime = now;
            interimTranscriptBuffer = '';
          }
        }

        // Reset interim buffer on silence or final
        if (isFinal || speechFinal) {
          interimTranscriptBuffer = '';
          interimStartTime = 0;
        }

        if (transcript && transcript.trim().length > 0 && isFinal) {
          logger.success('Deepgram', `Transcript: "${transcript}"`);

          const message = {
            sessionId,
            transcript,
            timestamp: Date.now(),
            is_final: isFinal
          };

          await rabbitmq.publish(rabbitmq.queues.TRANSCRIPTION, message);

          if (onTranscript) {
            onTranscript(transcript);
          }
        }
      });



      connection.on('error', (error) => {
        logger.error('Deepgram', `Error for session ${sessionId}`, { error: error.message || error });
        this.connections.delete(sessionId);
      });

      connection.on('close', () => {
        logger.info('Deepgram', `Connection closed for session ${sessionId}`);
        this.connections.delete(sessionId);
      });

      this.connections.set(sessionId, connection);

      return connection;
    } catch (error) {
      logger.error('Deepgram', 'Failed to start transcription', { error: error.message });
      throw error;
    }
  }

  sendAudio(sessionId, audioData) {
    const connection = this.connections.get(sessionId);
    if (connection) {
      // Don't log every audio chunk - too verbose
      connection.send(audioData);
    } else {
      logger.warn('Deepgram', `No connection found for session ${sessionId}`);
    }
  }

  closeConnection(sessionId) {
    const connection = this.connections.get(sessionId);
    if (connection) {
      connection.finish();
      this.connections.delete(sessionId);
    }
  }

  closeAllConnections() {
    for (const [sessionId, connection] of this.connections) {
      connection.finish();
    }
    this.connections.clear();
  }
}

export default DeepgramService;
