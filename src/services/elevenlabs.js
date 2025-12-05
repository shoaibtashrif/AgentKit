import rabbitmq from '../config/rabbitmq.js';

class ElevenLabsService {
  constructor(apiKey, voiceId) {
    this.apiKey = apiKey;
    this.voiceId = voiceId;
    this.baseUrl = 'https://api.elevenlabs.io/v1';
  }

  async startListening() {
    await rabbitmq.consume(rabbitmq.queues.TTS_REQUEST, async (message) => {
      const { sessionId, text } = message;
      await this.synthesize(sessionId, text);
    });
    console.log('✓ ElevenLabs service listening for TTS requests');
  }

  async synthesize(sessionId, text) {
    try {
      console.log(`[ElevenLabs] Synthesizing: ${text}`);

      const response = await fetch(
        `${this.baseUrl}/text-to-speech/${this.voiceId}/stream`,
        {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': this.apiKey
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_turbo_v2_5',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
              style: 0.0,
              use_speaker_boost: true
            },
            output_format: 'pcm_16000'
          })
        }
      );

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.statusText}`);
      }

      const audioBuffer = await response.arrayBuffer();

      const message = {
        sessionId,
        audio: Array.from(new Uint8Array(audioBuffer)),
        timestamp: Date.now()
      };

      await rabbitmq.publish(rabbitmq.queues.AUDIO_OUTPUT_TWILIO, message);
      await rabbitmq.publish(rabbitmq.queues.AUDIO_OUTPUT_WS, message);

      console.log(`[ElevenLabs] Audio generated and sent to queues`);

    } catch (error) {
      console.error('ElevenLabs synthesis error:', error);
    }
  }
}

export default ElevenLabsService;
