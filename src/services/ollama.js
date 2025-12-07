import rabbitmq from '../config/rabbitmq.js';
import RAGService from './rag.js';

class OllamaService {
  constructor(baseUrl = 'http://localhost:11434', model = 'qwen2.5:0.5b') {
    this.baseUrl = baseUrl;
    this.model = model;
    this.conversationHistory = new Map();
    this.activeGenerations = new Map();
    this.ragService = new RAGService(); // Now using local embeddings
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
      console.log('⚠ RAG service not initialized - will use LLM without context');
    }

    await rabbitmq.consume(rabbitmq.queues.LLM_REQUEST, async (message) => {
      const { sessionId, transcript } = message;
      await this.processMessage(sessionId, transcript);
    });
    console.log(`✓ Ollama service listening (model: ${this.model})`);
  }

  async processMessage(sessionId, userMessage) {
    try {
      let history = this.conversationHistory.get(sessionId);
      if (!history) {
        history = [{ role: 'system', content: this.systemPrompt }];
        this.conversationHistory.set(sessionId, history);
      }

      console.log(`[Ollama] Processing: ${userMessage}`);

      // Query RAG for relevant context (2-3 chunks for accuracy, still fast)
      if (this.ragService.isRelevantQuery(userMessage)) {
        const ragResult = await this.ragService.query(userMessage, 3, 0.5);

        if (ragResult.hasContext) {
          console.log(`[Ollama] RAG found context (confidence: ${ragResult.confidence})`);

          // HIGH CONFIDENCE: Return direct answer (SKIP LLM!)
          if (ragResult.directAnswer && ragResult.confidence === 'high') {
            console.log('[Ollama] ⚡ Direct answer from RAG (SKIPPING LLM for speed)');

            // Send answer directly without LLM processing
            await rabbitmq.publish(rabbitmq.queues.TTS_REQUEST, {
              sessionId,
              text: ragResult.directAnswer,
              timestamp: Date.now()
            });

            return; // Exit early - no LLM needed!
          }

          // MEDIUM/LOW CONFIDENCE: Use LLM with RAG context
          console.log(`[Ollama] Using LLM with RAG context (${ragResult.sources.length} sources)`);
          const contextualMessage = `Context from knowledge base:\n${ragResult.context}\n\nUser question: ${userMessage}\n\nProvide a natural, conversational answer using ONLY the information in the context above. Do not mention sources, relevance scores, or any technical details. Speak naturally as if you're having a conversation. If the context doesn't contain the answer, say "I don't have that information in our records."`;
          history.push({ role: 'user', content: contextualMessage });
        } else {
          console.log(`[Ollama] No RAG context found, using general LLM`);
          history.push({ role: 'user', content: userMessage });
        }
      } else {
        console.log(`[Ollama] Query not relevant to knowledge base, using general LLM`);
        history.push({ role: 'user', content: userMessage });
      }

      this.activeGenerations.set(sessionId, true);

      // Call Ollama API with streaming
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: history,
          stream: true,
          options: {
            temperature: 0.7,
            num_predict: 150, // max_tokens equivalent
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      let fullResponse = '';
      let sentenceBuffer = '';

      // Stream the response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (!this.activeGenerations.get(sessionId)) {
          console.log(`[Ollama] Generation stopped for session: ${sessionId}`);
          reader.cancel();
          return;
        }

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            const content = json.message?.content || '';

            if (content) {
              fullResponse += content;
              sentenceBuffer += content;

              // Send complete sentences immediately
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
                    console.log(`[Ollama] Streaming sentence: ${sentence}`);
                  }
                }

                sentenceBuffer = sentences[sentences.length - 1];
              }
            }
          } catch (e) {
            // Skip invalid JSON lines
          }
        }
      }

      // Send remaining text
      if (sentenceBuffer.trim() && this.activeGenerations.get(sessionId)) {
        await rabbitmq.publish(rabbitmq.queues.TTS_REQUEST, {
          sessionId,
          text: sentenceBuffer.trim(),
          timestamp: Date.now()
        });
        console.log(`[Ollama] Final sentence: ${sentenceBuffer.trim()}`);
      }

      if (this.activeGenerations.get(sessionId)) {
        history.push({ role: 'assistant', content: fullResponse });

        // Keep history manageable
        if (history.length > 20) {
          history = [history[0], ...history.slice(-19)];
          this.conversationHistory.set(sessionId, history);
        }

        console.log(`[Ollama] Complete response: ${fullResponse}`);
      }

      this.activeGenerations.delete(sessionId);

    } catch (error) {
      console.error('[Ollama] Processing error:', error);
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
      console.log(`[Ollama] Stopping generation for session: ${sessionId}`);
    }
  }

  clearHistory(sessionId) {
    this.conversationHistory.delete(sessionId);
  }

  clearAllHistory() {
    this.conversationHistory.clear();
  }
}

export default OllamaService;
