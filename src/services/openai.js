import OpenAI from 'openai';
import rabbitmq from '../config/rabbitmq.js';
import RAGService from './rag.js';

class OpenAIService {
  constructor(apiKey) {
    this.client = new OpenAI({ apiKey });
    this.conversationHistory = new Map();
    this.activeGenerations = new Map();
    this.ragService = new RAGService();
    this.systemPrompt = `You are an exceptional virtual AI assistant for Northview Pain Management Center. You represent a professional medical practice dedicated to providing compassionate, expert care to patients managing chronic pain conditions.

YOUR ROLE:
- Serve as the first point of contact for patients and callers
- Provide accurate information about our services, treatments, and practice
- Maintain a warm, empathetic, and professional demeanor at all times
- Help patients feel heard, understood, and supported

COMMUNICATION STYLE:
- Speak naturally and conversationally, as if you're a knowledgeable receptionist
- Keep responses concise (1-3 sentences) unless more detail is specifically requested
- Use a caring, patient-centered tone that reflects the compassionate nature of pain management
- Be professional yet approachable - balance expertise with warmth

IMPORTANT RULES:
- ONLY answer using information from the provided context
- If the context contains the answer, use it directly - DO NOT make up additional information
- If the context doesn't contain the answer, say "I don't have that specific information available, but I'd be happy to connect you with our team"
- NEVER hallucinate or invent information not in the context
- For appointment scheduling, urgent medical concerns, or detailed questions, politely direct callers to our office at (555) 123-4567
- Always prioritize patient safety and wellbeing in your responses

Remember: You represent Northview Pain Management Center's commitment to exceptional patient care.`;
  }

  async startListening() {
    // Initialize RAG service
    const ragInitialized = await this.ragService.initialize();
    if (ragInitialized) {
      console.log('✓ RAG service initialized');
    } else {
      console.log('⚠ RAG service not initialized - run document ingestion first');
    }

    await rabbitmq.consume(rabbitmq.queues.LLM_REQUEST, async (message) => {
      const { sessionId, transcript } = message;
      await this.processMessage(sessionId, transcript);
    });
    console.log('✓ OpenAI service listening for LLM requests');
  }

  async processMessage(sessionId, userMessage) {
    try {
      let history = this.conversationHistory.get(sessionId);
      if (!history) {
        history = [{ role: 'system', content: this.systemPrompt }];
        this.conversationHistory.set(sessionId, history);
      }

      console.log(`[OpenAI] Processing: ${userMessage}`);

      // Query RAG for relevant context (2-3 chunks for accuracy, still fast)
      if (this.ragService.isRelevantQuery(userMessage)) {
        const ragResult = await this.ragService.query(userMessage, 3, 0.5);

        if (ragResult.hasContext) {
          console.log(`[OpenAI] RAG found context (confidence: ${ragResult.confidence})`);

          // HIGH CONFIDENCE: Return direct answer (SKIP LLM!)
          if (ragResult.directAnswer && ragResult.confidence === 'high') {
            console.log('[OpenAI] ⚡ Direct answer from RAG (SKIPPING LLM for speed)');

            // Send answer directly without LLM processing
            await rabbitmq.publish(rabbitmq.queues.TTS_REQUEST, {
              sessionId,
              text: ragResult.directAnswer,
              timestamp: Date.now()
            });

            return; // Exit early - no LLM needed!
          }

          // MEDIUM/LOW CONFIDENCE: Use LLM with RAG context
          console.log(`[OpenAI] Using LLM with RAG context (${ragResult.sources.length} sources)`);
          const contextualMessage = `Context from knowledge base:\n${ragResult.context}\n\nUser question: ${userMessage}\n\nProvide a natural, conversational answer using ONLY the information in the context above. Do not mention sources, relevance scores, or any technical details. Speak naturally as if you're having a conversation. If the context doesn't contain the answer, say "I don't have that information in our records."`;
          history.push({ role: 'user', content: contextualMessage });
        } else {
          console.log(`[OpenAI] No RAG context found, using general LLM`);
          history.push({ role: 'user', content: userMessage });
        }
      } else {
        console.log(`[OpenAI] Query not relevant to knowledge base, using general LLM`);
        history.push({ role: 'user', content: userMessage });
      }

      this.activeGenerations.set(sessionId, true);

      const stream = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: history,
        stream: true,
        temperature: 0.7,
        max_tokens: 150,
        stream_options: { include_usage: false } // Reduce overhead
      });

      let fullResponse = '';
      let sentenceBuffer = '';

      for await (const chunk of stream) {
        if (!this.activeGenerations.get(sessionId)) {
          console.log(`[OpenAI] Generation stopped for session: ${sessionId}`);
          return;
        }

        const content = chunk.choices[0]?.delta?.content || '';

        if (content) {
          fullResponse += content;
          sentenceBuffer += content;

          const sentenceEndings = /[.!?]\s/;
          if (sentenceEndings.test(sentenceBuffer)) {
            const sentences = sentenceBuffer.split(sentenceEndings);

            for (let i = 0; i < sentences.length - 1; i++) {
              const sentence = sentences[i].trim();
              if (sentence && this.activeGenerations.get(sessionId)) {
                await rabbitmq.publish(rabbitmq.queues.TTS_REQUEST, {
                  sessionId,
                  text: sentence,
                  timestamp: Date.now()
                });
                console.log(`[OpenAI] Streaming sentence: ${sentence}`);
              }
            }

            sentenceBuffer = sentences[sentences.length - 1];
          }
        }
      }

      if (sentenceBuffer.trim() && this.activeGenerations.get(sessionId)) {
        await rabbitmq.publish(rabbitmq.queues.TTS_REQUEST, {
          sessionId,
          text: sentenceBuffer.trim(),
          timestamp: Date.now()
        });
        console.log(`[OpenAI] Final sentence: ${sentenceBuffer.trim()}`);
      }

      if (this.activeGenerations.get(sessionId)) {
        history.push({ role: 'assistant', content: fullResponse });

        if (history.length > 20) {
          history = [history[0], ...history.slice(-19)];
          this.conversationHistory.set(sessionId, history);
        }

        console.log(`[OpenAI] Complete response: ${fullResponse}`);
      }

      this.activeGenerations.delete(sessionId);

    } catch (error) {
      console.error('OpenAI processing error:', error);
      this.activeGenerations.delete(sessionId);
      await rabbitmq.publish(rabbitmq.queues.TTS_REQUEST, {
        sessionId,
        text: "I'm sorry, I encountered an error processing your request.",
        timestamp: Date.now()
      });
    }
  }

  stopGeneration(sessionId) {
    if (this.activeGenerations.has(sessionId)) {
      this.activeGenerations.set(sessionId, false);
      console.log(`[OpenAI] Stopping generation for session: ${sessionId}`);
    }
  }

  clearHistory(sessionId) {
    this.conversationHistory.delete(sessionId);
  }

  clearAllHistory() {
    this.conversationHistory.clear();
  }
}

export default OpenAIService;
