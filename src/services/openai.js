import OpenAI from 'openai';
import rabbitmq from '../config/rabbitmq.js';
import RAGService from './rag.js';

class OpenAIService {
  constructor(apiKey) {
    this.client = new OpenAI({ apiKey });
    this.conversationHistory = new Map();
    this.activeGenerations = new Map();
    this.ragService = new RAGService(apiKey);
    this.systemPrompt = `You are a helpful voice assistant for Northview Pain Management Center. Keep your responses concise and natural for spoken conversation. Respond in 1-3 sentences unless more detail is specifically requested.

When answering questions:
- Use the provided context from our knowledge base when available
- If the context doesn't contain the answer, politely say you don't have that specific information
- Be helpful, professional, and empathetic
- For appointment scheduling, insurance questions, or specific medical concerns, suggest calling the office at (555) 123-4567`;
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

      // Query RAG for relevant context (only 1 doc for speed)
      let contextualMessage = userMessage;
      if (this.ragService.isRelevantQuery(userMessage)) {
        const ragResult = await this.ragService.query(userMessage, 1);

        if (ragResult.hasContext) {
          console.log(`[OpenAI] Using RAG context (1 source for speed)`);

          // Concise context format to reduce tokens
          contextualMessage = `Context: ${ragResult.context.substring(0, 400)}...\n\nQ: ${userMessage}`;
        } else {
          console.log(`[OpenAI] No RAG context found, using general LLM`);
        }
      } else {
        console.log(`[OpenAI] Query not relevant to knowledge base, using general LLM`);
      }

      history.push({ role: 'user', content: contextualMessage });

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
