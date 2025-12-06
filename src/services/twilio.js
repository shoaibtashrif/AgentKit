import twilio from 'twilio';
import express from 'express';
import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import rabbitmq from '../config/rabbitmq.js';
import logger from '../utils/logger.js';

const VoiceResponse = twilio.twiml.VoiceResponse;

class TwilioService {
  constructor(accountSid, authToken, webhookPort = 8081) {
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.webhookPort = webhookPort;
    this.app = express();
    this.wss = null;
    this.server = null;
    this.activeCalls = new Map();
    this.onCallStart = null;
    this.onCallEnd = null;
    this.onAudioData = null;
    this.audioQueues = new Map(); // Queue per session for sequential playback
    this.processing = new Map(); // Track if session is playing audio
  }

  async start() {
    this.app.use(express.urlencoded({ extended: false }));
    this.app.use(express.json());

    this.app.post('/voice', (req, res) => {
      this.handleIncomingCall(req, res);
    });

    this.app.post('/voice/stream', (req, res) => {
      res.status(200).send('OK');
    });

    this.app.post('/twilio/status', (req, res) => {
      res.status(200).send('OK');
    });

    this.server = this.app.listen(this.webhookPort, () => {
      console.log(`✓ Twilio webhook server listening on port ${this.webhookPort}`);
    });

    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on('connection', (ws) => {
      console.log('✓ Twilio Media Stream connected');

      let streamSid = null;
      let callSid = null;
      let sessionId = null;

      ws.on('message', async (message) => {
        try {
          const msg = JSON.parse(message);

          switch (msg.event) {
            case 'start':
              streamSid = msg.start.streamSid;
              callSid = msg.start.callSid;
              sessionId = randomUUID();

              console.log(`🟢 Call started: ${callSid}`);
              console.log(`   Session ID: ${sessionId}`);
              console.log(`   Stream SID: ${streamSid}`);

              this.activeCalls.set(callSid, {
                ws,
                streamSid,
                sessionId,
                callSid
              });

              if (this.onCallStart) {
                this.onCallStart(sessionId, callSid);
              }
              break;

            case 'media':
              if (msg.media && msg.media.payload) {
                try {
                  const mulawBuffer = Buffer.from(msg.media.payload, 'base64');

                  if (mulawBuffer.length > 0) {
                    const pcm8kHzBuffer = this.mulawToPcm16(mulawBuffer);

                    const callData = this.activeCalls.get(callSid);
                    if (callData && this.onAudioData) {
                      this.onAudioData(callData.sessionId, pcm8kHzBuffer);
                    }
                  }
                } catch (error) {
                  console.error(`[Twilio] Error processing audio data:`, error);
                }
              }
              break;

            case 'stop':
              console.log(`🔴 Call ended: ${callSid}`);

              const callData = this.activeCalls.get(callSid);
              if (callData) {
                if (this.onCallEnd) {
                  this.onCallEnd(callData.sessionId, callSid);
                }
                this.activeCalls.delete(callSid);
              }
              break;
          }
        } catch (error) {
          console.error('Error processing Twilio message:', error);
        }
      });

      ws.on('close', () => {
        console.log('Twilio Media Stream disconnected');
      });
    });

    await this.startAudioListener();

    console.log(`✓ Twilio Media Stream WebSocket on port ${this.webhookPort}`);
  }

  async processAudioQueue(sessionId) {
    const queue = this.audioQueues.get(sessionId);
    if (!queue || queue.length === 0) {
      this.processing.set(sessionId, false);
      return;
    }

    this.processing.set(sessionId, true);
    const audio = queue.shift(); // Get next audio from queue

    logger.info('Twilio', `Processing audio from queue (${queue.length} remaining)`);

    await this.sendAudioToCall(sessionId, audio);

    // Process next in queue
    if (queue.length > 0) {
      this.processAudioQueue(sessionId);
    } else {
      this.processing.set(sessionId, false);
    }
  }

  handleIncomingCall(req, res) {
    const twiml = new VoiceResponse();

    // Get the host from the request (will be ngrok domain)
    const host = req.headers.host;

    // Use same port for WebSocket as HTTP
    let wsUrl;
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      wsUrl = `ws://${host}`;
    } else {
      // For ngrok or production, use wss:// with same domain
      wsUrl = `wss://${host}`;
    }

    console.log(`[Twilio] Incoming call, WebSocket URL: ${wsUrl}`);

    const connect = twiml.connect();
    connect.stream({ url: wsUrl });

    twiml.pause({ length: 600 });

    res.type('text/xml');
    res.send(twiml.toString());
  }

  async startAudioListener() {
    await rabbitmq.consume(rabbitmq.queues.AUDIO_OUTPUT_TWILIO, async (message) => {
      const { sessionId, audio } = message;

      // Verify session still exists
      const sessionExists = Array.from(this.activeCalls.values()).some(
        callData => callData.sessionId === sessionId
      );

      if (!sessionExists) {
        logger.warn('Twilio', `Ignoring audio for ended session ${sessionId}`);
        return;
      }

      // Add to session queue
      if (!this.audioQueues.has(sessionId)) {
        this.audioQueues.set(sessionId, []);
      }
      this.audioQueues.get(sessionId).push(audio);

      logger.audio('Twilio', `Received ${audio.length} bytes for session ${sessionId}`);

      // Process queue if not already processing
      if (!this.processing.get(sessionId)) {
        this.processAudioQueue(sessionId);
      }
    });

    // Listen for audio clearing (interruption handling)
    await rabbitmq.consume(rabbitmq.queues.CLEAR_AUDIO, async (message) => {
      const { sessionId } = message;
      logger.info('Twilio', `Clearing audio for session ${sessionId}`);
      this.clearAudioForSession(sessionId);
    });
  }

  mulawToPcm16(mulawBuffer) {
    const pcm16Buffer = Buffer.alloc(mulawBuffer.length * 2);

    for (let i = 0; i < mulawBuffer.length; i++) {
      const mulawByte = mulawBuffer[i];
      const pcmSample = this.mulawToLinear(mulawByte);

      // Amplify the signal by 4x for better Deepgram recognition
      const amplifiedSample = pcmSample * 4;

      // Ensure the sample is within 16-bit range
      const clampedSample = Math.max(-32768, Math.min(32767, amplifiedSample));
      pcm16Buffer.writeInt16LE(clampedSample, i * 2);
    }

    return pcm16Buffer;
  }

  mulawToLinear(mulawByte) {
    // Standard μ-law to linear conversion table
    const MULAW_TABLE = [
      -32124, -31100, -30076, -29052, -28028, -27004, -25980, -24956,
      -23932, -22908, -21884, -20860, -19836, -18812, -17788, -16764,
      -15996, -15484, -14972, -14460, -13948, -13436, -12924, -12412,
      -11900, -11388, -10876, -10364, -9852, -9340, -8828, -8316,
      -7932, -7676, -7420, -7164, -6908, -6652, -6396, -6140,
      -5884, -5628, -5372, -5116, -4860, -4604, -4348, -4092,
      -3900, -3772, -3644, -3516, -3388, -3260, -3132, -3004,
      -2876, -2748, -2620, -2492, -2364, -2236, -2108, -1980,
      -1884, -1820, -1756, -1692, -1628, -1564, -1500, -1436,
      -1372, -1308, -1244, -1180, -1116, -1052, -988, -924,
      -876, -844, -812, -780, -748, -716, -684, -652,
      -620, -588, -556, -524, -492, -460, -428, -396,
      -372, -356, -340, -324, -308, -292, -276, -260,
      -244, -228, -212, -196, -180, -164, -148, -132,
      -120, -112, -104, -96, -88, -80, -72, -64,
      -56, -48, -40, -32, -24, -16, -8, 0,
      32124, 31100, 30076, 29052, 28028, 27004, 25980, 24956,
      23932, 22908, 21884, 20860, 19836, 18812, 17788, 16764,
      15996, 15484, 14972, 14460, 13948, 13436, 12924, 12412,
      11900, 11388, 10876, 10364, 9852, 9340, 8828, 8316,
      7932, 7676, 7420, 7164, 6908, 6652, 6396, 6140,
      5884, 5628, 5372, 5116, 4860, 4604, 4348, 4092,
      3900, 3772, 3644, 3516, 3388, 3260, 3132, 3004,
      2876, 2748, 2620, 2492, 2364, 2236, 2108, 1980,
      1884, 1820, 1756, 1692, 1628, 1564, 1500, 1436,
      1372, 1308, 1244, 1180, 1116, 1052, 988, 924,
      876, 844, 812, 780, 748, 716, 684, 652,
      620, 588, 556, 524, 492, 460, 428, 396,
      372, 356, 340, 324, 308, 292, 276, 260,
      244, 228, 212, 196, 180, 164, 148, 132,
      120, 112, 104, 96, 88, 80, 72, 64,
      56, 48, 40, 32, 24, 16, 8, 0
    ];

    return MULAW_TABLE[mulawByte];
  }

  upsample8To16kHz(pcm8Buffer) {
    const inputSamples = pcm8Buffer.length / 2;
    const outputSamples = inputSamples * 2;
    const upsampled = Buffer.alloc(outputSamples * 2);

    for (let i = 0; i < inputSamples; i++) {
      const sample = pcm8Buffer.readInt16LE(i * 2);
      upsampled.writeInt16LE(sample, i * 4);
      upsampled.writeInt16LE(sample, (i * 4) + 2);
    }

    return upsampled;
  }

  pcm16ToMulaw(pcm16Buffer) {
    const mulawBuffer = Buffer.alloc(pcm16Buffer.length / 2);

    for (let i = 0; i < pcm16Buffer.length; i += 2) {
      const pcmSample = pcm16Buffer.readInt16LE(i);
      const mulawSample = this.linearToMulaw(pcmSample);
      mulawBuffer[i / 2] = mulawSample;
    }

    return mulawBuffer;
  }

  linearToMulaw(sample) {
    const MULAW_MAX = 0x1FFF;
    const MULAW_BIAS = 0x84;

    let sign = (sample >> 8) & 0x80;
    if (sign) sample = -sample;
    if (sample > MULAW_MAX) sample = MULAW_MAX;

    sample = sample + MULAW_BIAS;
    let exponent = 7;

    for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1);

    const mantissa = (sample >> (exponent + 3)) & 0x0F;
    const mulawByte = ~(sign | (exponent << 4) | mantissa);

    return mulawByte & 0xFF;
  }

  downsample16To8kHz(pcm16Buffer) {
    const inputSamples = pcm16Buffer.length / 2;
    const outputSamples = Math.floor(inputSamples / 2);
    const downsampled = Buffer.alloc(outputSamples * 2);

    // Use averaging for better quality
    for (let i = 0; i < outputSamples; i++) {
      const sample1 = pcm16Buffer.readInt16LE(i * 4);
      const sample2 = pcm16Buffer.readInt16LE(i * 4 + 2);
      const averaged = Math.floor((sample1 + sample2) / 2);
      downsampled.writeInt16LE(averaged, i * 2);
    }

    return downsampled;
  }

  sendAudioToCall(sessionId, audioData) {
    return new Promise((resolve) => {
      for (const [callSid, callData] of this.activeCalls) {
        if (callData.sessionId === sessionId) {
          const ws = callData.ws;

          if (ws && ws.readyState === ws.OPEN) {
            try {
              // audioData is already μ-law from ElevenLabs - use directly!
              const mulawBuffer = Buffer.from(audioData);

              if (mulawBuffer.length === 0) {
                logger.warn('Twilio', 'Empty audio buffer received');
                resolve();
                return;
              }

              // Store audio chunks for interruption handling
              if (!callData.audioChunks) {
                callData.audioChunks = [];
              }

              // Calculate total playback duration upfront
              // μ-law at 8kHz: 1 byte = 1 sample, 8000 samples/sec
              const totalDurationMs = (mulawBuffer.length / 8000) * 1000;

              logger.success('Twilio', `Sending ${mulawBuffer.length}B μ-law (${Math.round(totalDurationMs)}ms duration)`);

              // Start playback timer immediately (audio plays as soon as first chunk arrives)
              const playbackTimer = setTimeout(() => {
                logger.info('Twilio', `Playback completed for ${mulawBuffer.length} bytes`);
                resolve();
              }, totalDurationMs);

            // Use smaller chunks like working project (108 bytes)
            const chunkSize = 108;
            let chunkIndex = 0;
            let chunksInFlight = 0; // Track pending chunks for backpressure

            const sendChunk = () => {
              // Check if audio was cleared (interrupted)
              if (callData.audioCleared) {
                clearTimeout(playbackTimer);
                resolve();
                return;
              }

              if (chunkIndex >= mulawBuffer.length) {
                // All chunks sent, timer will handle resolution
                callData.audioChunks = [];
                return;
              }

              const chunk = mulawBuffer.subarray(chunkIndex, Math.min(chunkIndex + chunkSize, mulawBuffer.length));
              const payload = chunk.toString('base64');

              ws.send(JSON.stringify({
                event: 'media',
                streamSid: callData.streamSid,
                media: { track: 'outbound', payload }
              }));

              chunkIndex += chunkSize;
              chunksInFlight++;

              // CRITICAL: Backpressure like working project
              // Slow down if too many chunks are buffered
              let delay = 13; // Base delay ~13ms per 108-byte chunk at 8kHz

              if (chunksInFlight > 40) {
                // Too many pending, slow way down
                delay = 28; // ~15ms extra
                logger.warn('Twilio', `High buffer (${chunksInFlight}), applying backpressure`);
              } else if (chunksInFlight > 25) {
                // Getting full, slow down a bit
                delay = 21; // ~8ms extra
              }

              // Decrease in-flight count after chunk plays
              setTimeout(() => {
                chunksInFlight = Math.max(0, chunksInFlight - 1);
              }, delay);

              // Schedule next chunk
              if (chunkIndex < mulawBuffer.length) {
                const timeoutId = setTimeout(sendChunk, delay);
                callData.audioChunks.push(timeoutId);
              }
            };

            // Start sending immediately
            sendChunk();
            } catch (error) {
              logger.error('Twilio', 'Error sending audio', { error: error.message, stack: error.stack });
              resolve();
            }
          } else {
            logger.warn('Twilio', 'WebSocket is not open');
            resolve();
          }
          return;
        }
      }
      logger.warn('Twilio', `No call found for session ${sessionId}`);
      resolve();
    });
  }

  clearAudioForSession(sessionId) {
    for (const [callSid, callData] of this.activeCalls) {
      if (callData.sessionId === sessionId) {
        // Mark audio as cleared
        callData.audioCleared = true;

        // Clear any pending audio chunks
        if (callData.audioChunks) {
          callData.audioChunks.forEach(timeoutId => clearTimeout(timeoutId));
          callData.audioChunks = [];
        }

        // Send clear command to Twilio to stop current audio
        const ws = callData.ws;
        if (ws && ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            event: 'clear',
            streamSid: callData.streamSid
          }));
        }

        console.log(`[AUDIO-OUT] ✓ Cleared audio for session ${sessionId}`);

        // Reset the flag after a short delay
        setTimeout(() => {
          callData.audioCleared = false;
        }, 100);

        return;
      }
    }
  }

  cleanupSession(sessionId) {
    for (const [callSid, callData] of this.activeCalls) {
      if (callData.sessionId === sessionId) {
        // Clear any pending audio
        this.clearAudioForSession(sessionId);

        // Clear audio queue
        this.audioQueues.delete(sessionId);
        this.processing.delete(sessionId);

        // Remove from active calls
        this.activeCalls.delete(callSid);

        console.log(`[Twilio] Session ${sessionId} cleaned up`);
        return;
      }
    }
  }

  close() {
    if (this.wss) {
      this.wss.close();
    }
    if (this.server) {
      this.server.close();
    }
  }
}

export default TwilioService;
