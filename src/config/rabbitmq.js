import amqp from 'amqplib';

class RabbitMQManager {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.queues = {
      TRANSCRIPTION: 'transcription_queue',
      LLM_REQUEST: 'llm_request_queue',
      LLM_RESPONSE: 'llm_response_queue',
      TTS_REQUEST: 'tts_request_queue',
      AUDIO_OUTPUT_TWILIO: 'audio_output_twilio',
      AUDIO_OUTPUT_WS: 'audio_output_ws',
      CLEAR_AUDIO: 'clear_audio_queue'
    };
  }

  async connect(url = 'amqp://localhost') {
    try {
      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();

      await Promise.all(
        Object.values(this.queues).map(queue =>
          this.channel.assertQueue(queue, { durable: false })
        )
      );

      console.log('✓ RabbitMQ connected and queues initialized');

      this.connection.on('error', (err) => {
        console.error('RabbitMQ connection error:', err);
      });

      this.connection.on('close', () => {
        console.log('RabbitMQ connection closed');
      });

      return true;
    } catch (error) {
      console.error('Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }

  async publish(queue, message) {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }

    const content = Buffer.from(JSON.stringify(message));
    return this.channel.sendToQueue(queue, content);
  }

  async consume(queue, callback) {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }

    return this.channel.consume(queue, async (msg) => {
      if (msg) {
        try {
          const content = JSON.parse(msg.content.toString());
          await callback(content);
          this.channel.ack(msg);
        } catch (error) {
          console.error(`Error processing message from ${queue}:`, error);
          this.channel.nack(msg, false, false);
        }
      }
    });
  }

  async close() {
    if (this.channel) {
      await this.channel.close();
    }
    if (this.connection) {
      await this.connection.close();
    }
  }
}

export default new RabbitMQManager();
