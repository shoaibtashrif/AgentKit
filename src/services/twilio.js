import twilio from 'twilio';
import express from 'express';
import { WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import rabbitmq from '../config/rabbitmq.js';

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
                const mulawBuffer = Buffer.from(msg.media.payload, 'base64');
                console.log(`[Twilio] Received ${mulawBuffer.length} bytes of μ-law audio from call ${callSid}`);

                const pcm8kHzBuffer = this.mulawToPcm16(mulawBuffer);

                const callData = this.activeCalls.get(callSid);
                if (callData && this.onAudioData) {
                  this.onAudioData(callData.sessionId, pcm8kHzBuffer);
                } else {
                  console.log(`[Twilio] No call data found for ${callSid}`);
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

    twiml.pause({ length: 60 });

    res.type('text/xml');
    res.send(twiml.toString());
  }

  async startAudioListener() {
    await rabbitmq.consume(rabbitmq.queues.AUDIO_OUTPUT_TWILIO, async (message) => {
      const { sessionId, audio } = message;
      this.sendAudioToCall(sessionId, audio);
    });
  }

  mulawToPcm16(mulawBuffer) {
    const pcm16Buffer = Buffer.alloc(mulawBuffer.length * 2);

    for (let i = 0; i < mulawBuffer.length; i++) {
      const mulawByte = mulawBuffer[i];
      const pcmSample = this.mulawToLinear(mulawByte);
      pcm16Buffer.writeInt16LE(pcmSample, i * 2);
    }

    return pcm16Buffer;
  }

  mulawToLinear(mulawByte) {
    const MULAW_BIAS = 33;
    mulawByte = ~mulawByte;
    const sign = (mulawByte & 0x80);
    const exponent = (mulawByte >> 4) & 0x07;
    const mantissa = mulawByte & 0x0F;
    let sample = mantissa << (exponent + 3);
    sample += MULAW_BIAS;
    if (exponent > 0) {
      sample += (1 << (exponent + 2));
    }
    return sign ? -sample : sample;
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
    const MULAW_BIAS = 33;
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

    for (let i = 0; i < outputSamples; i++) {
      const inputIndex = i * 4;
      const sample = pcm16Buffer.readInt16LE(inputIndex);
      downsampled.writeInt16LE(sample, i * 2);
    }

    return downsampled;
  }

  sendAudioToCall(sessionId, audioData) {
    for (const [callSid, callData] of this.activeCalls) {
      if (callData.sessionId === sessionId) {
        const ws = callData.ws;

        if (ws && ws.readyState === ws.OPEN) {
          const pcm16kHzBuffer = Buffer.from(audioData);
          const pcm8kHzBuffer = this.downsample16To8kHz(pcm16kHzBuffer);
          const mulawBuffer = this.pcm16ToMulaw(pcm8kHzBuffer);
          const payload = mulawBuffer.toString('base64');

          ws.send(JSON.stringify({
            event: 'media',
            streamSid: callData.streamSid,
            media: {
              track: 'outbound',
              payload
            }
          }));
          console.log(`[Twilio] Sent ${mulawBuffer.length} bytes of μ-law audio to call ${callSid}`);
        } else {
          console.log(`[Twilio] WebSocket not ready for session ${sessionId}, state: ${ws ? ws.readyState : 'null'}`);
        }
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
