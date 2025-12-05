import { createClient } from '@deepgram/sdk';
import rabbitmq from '../config/rabbitmq.js';

class DeepgramService {
  constructor(apiKey) {
    this.client = createClient(apiKey);
    this.connections = new Map();
  }

  async startTranscription(sessionId, onTranscript, sampleRate = 16000) {
    try {
      const connection = this.client.listen.live({
        model: 'nova-2',
        encoding: 'linear16',
        sample_rate: sampleRate,
        channels: 1
      });

      connection.on('open', () => {
        console.log(`✓ Deepgram connection opened for session: ${sessionId}`);
      });

      connection.on('Results', async (data) => {
        console.log(`[Deepgram] RAW Results event for session ${sessionId}:`, JSON.stringify(data, null, 2));

        const transcript = data.channel?.alternatives?.[0]?.transcript;
        const isFinal = data.is_final;

        console.log(`[Deepgram] Extracted - Transcript: "${transcript}", is_final: ${isFinal}`);

        if (transcript && transcript.trim().length > 0) {
          console.log(`[Deepgram] Valid transcript detected: "${transcript}" (is_final: ${isFinal})`);

          if (isFinal) {
            console.log(`[Deepgram] Publishing final transcript to RabbitMQ: "${transcript}"`);

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
        } else {
          console.log(`[Deepgram] Empty or invalid transcript - skipping`);
        }
      });

      connection.on('error', (error) => {
        console.error('Deepgram error:', error);
      });

      connection.on('close', () => {
        console.log(`Deepgram connection closed for session: ${sessionId}`);
        this.connections.delete(sessionId);
      });

      this.connections.set(sessionId, connection);

      return connection;
    } catch (error) {
      console.error('Failed to start Deepgram transcription:', error);
      throw error;
    }
  }

  sendAudio(sessionId, audioData) {
    const connection = this.connections.get(sessionId);
    if (connection) {
      console.log(`[Deepgram] Sending ${audioData.length} bytes of audio for session ${sessionId}`);
      connection.send(audioData);
    } else {
      console.error(`No Deepgram connection found for session: ${sessionId}`);
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
