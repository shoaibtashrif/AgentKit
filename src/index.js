import dotenv from 'dotenv';
import rabbitmq from './config/rabbitmq.js';
import DeepgramService from './services/deepgram.js';
import OpenAIService from './services/openai.js';
import ElevenLabsService from './services/elevenlabs.js';
import VoiceWebSocketServer from './server/websocket.js';
import TwilioService from './services/twilio.js';

dotenv.config();

class VoiceAgent {
  constructor() {
    this.deepgramService = new DeepgramService(process.env.DEEPGRAM_API_KEY);
    this.openaiService = new OpenAIService(process.env.OPENAI_API_KEY);
    this.elevenlabsService = new ElevenLabsService(
      process.env.ELEVENLABS_API_KEY,
      process.env.ELEVENLABS_VOICE_ID
    );
    this.wsServer = new VoiceWebSocketServer(3000);
    this.twilioService = new TwilioService(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
      8081
    );
    this.activeTranscriptions = new Map();
  }

  async start() {
    try {
      console.log('🚀 Starting Voice Agent...\n');

      await rabbitmq.connect();

      await this.setupTranscriptionConsumer();

      await this.openaiService.startListening();

      await this.elevenlabsService.startListening();

      this.wsServer.onSessionStart = (sessionId) => {
        this.handleSessionStart(sessionId);
      };

      this.wsServer.onAudioData = (sessionId, audioData) => {
        this.handleAudioData(sessionId, audioData);
      };

      this.wsServer.onSessionEnd = (sessionId) => {
        this.handleSessionEnd(sessionId);
      };

      await this.wsServer.start();

      this.twilioService.onCallStart = async (sessionId, callSid) => {
        this.handleTwilioSessionStart(sessionId);

        await rabbitmq.publish(rabbitmq.queues.LLM_REQUEST, {
          sessionId,
          transcript: 'Hello',
          timestamp: Date.now()
        });
      };

      this.twilioService.onAudioData = (sessionId, audioData) => {
        this.handleAudioData(sessionId, audioData);
      };

      this.twilioService.onCallEnd = (sessionId, callSid) => {
        this.handleSessionEnd(sessionId);
      };

      await this.twilioService.start();

      console.log('\n✅ Voice Agent is ready!\n');
      console.log('📡 WebSocket server: ws://localhost:3000');
      console.log('📞 Twilio webhook: http://localhost:8081/voice');
      console.log('📞 Twilio Media Stream: ws://localhost:8082');
      console.log('🎤 Ready for calls and browser connections\n');

    } catch (error) {
      console.error('Failed to start Voice Agent:', error);
      process.exit(1);
    }
  }

  async setupTranscriptionConsumer() {
    await rabbitmq.consume(rabbitmq.queues.TRANSCRIPTION, async (message) => {
      const { sessionId, transcript } = message;

      this.openaiService.stopGeneration(sessionId);
      await rabbitmq.publish(rabbitmq.queues.CLEAR_AUDIO, {
        sessionId,
        timestamp: Date.now()
      });

      this.wsServer.sendTranscript(sessionId, transcript);

      await rabbitmq.publish(rabbitmq.queues.LLM_REQUEST, {
        sessionId,
        transcript,
        timestamp: Date.now()
      });
    });
  }

  async handleSessionStart(sessionId) {
    console.log(`\n🟢 Session started: ${sessionId}`);

    const connection = await this.deepgramService.startTranscription(
      sessionId,
      (transcript) => {
        console.log(`[${sessionId}] User: ${transcript}`);
      },
      16000
    );

    this.activeTranscriptions.set(sessionId, connection);
  }

  async handleTwilioSessionStart(sessionId) {
    console.log(`\n🟢 Session started: ${sessionId}`);

    const connection = await this.deepgramService.startTranscription(
      sessionId,
      (transcript) => {
        console.log(`[${sessionId}] User: ${transcript}`);
      },
      8000
    );

    this.activeTranscriptions.set(sessionId, connection);
  }

  handleAudioData(sessionId, audioData) {
    this.deepgramService.sendAudio(sessionId, audioData);
  }

  handleSessionEnd(sessionId) {
    console.log(`\n🔴 Session ended: ${sessionId}`);

    this.deepgramService.closeConnection(sessionId);
    this.openaiService.clearHistory(sessionId);
    this.activeTranscriptions.delete(sessionId);
  }

  async shutdown() {
    console.log('\n🛑 Shutting down Voice Agent...');

    this.deepgramService.closeAllConnections();
    this.openaiService.clearAllHistory();
    this.wsServer.close();
    this.twilioService.close();
    await rabbitmq.close();

    console.log('✅ Voice Agent shut down successfully');
    process.exit(0);
  }
}

const agent = new VoiceAgent();

process.on('SIGINT', () => agent.shutdown());
process.on('SIGTERM', () => agent.shutdown());

agent.start().catch(console.error);
