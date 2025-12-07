import fs from 'fs';
import { Document } from 'langchain/document';

/**
 * Custom JSONL document loader for medical training data
 * Handles both Q&A format and call transcript format
 */
class JSONLLoader {
  constructor(filePath) {
    this.filePath = filePath;
  }

  /**
   * Load and parse JSONL file
   * @returns {Promise<Array<Document>>} Array of LangChain documents
   */
  async load() {
    const content = fs.readFileSync(this.filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    const documents = [];

    for (const line of lines) {
      try {
        const data = JSON.parse(line);

        // Handle medical_frontdesk_train.jsonl format
        if (data.messages) {
          const doc = this.parseQAFormat(data);
          if (doc) documents.push(doc);
        }

        // Handle pain_calls_whisper_style.jsonl format
        else if (data.transcript) {
          const doc = this.parseCallFormat(data);
          if (doc) documents.push(doc);
        }
      } catch (error) {
        console.warn(`[JSONLLoader] Failed to parse line: ${error.message}`);
      }
    }

    console.log(`[JSONLLoader] Loaded ${documents.length} documents from ${this.filePath}`);
    return documents;
  }

  /**
   * Parse Q&A format (medical_frontdesk_train.jsonl)
   * Extract user question and assistant answer as separate documents
   */
  parseQAFormat(data) {
    const messages = data.messages;

    // Find user and assistant messages
    const userMsg = messages.find(m => m.role === 'user');
    const assistantMsg = messages.find(m => m.role === 'assistant');

    if (!userMsg || !assistantMsg) return null;

    // Create a single document with Q&A pair
    // This keeps question and answer together for better retrieval
    const pageContent = `Question: ${userMsg.content}\n\nAnswer: ${assistantMsg.content}`;

    return new Document({
      pageContent,
      metadata: {
        source: 'medical_frontdesk_qa',
        type: 'qa_pair',
        question: userMsg.content,
        answer: assistantMsg.content
      }
    });
  }

  /**
   * Parse call transcript format (pain_calls_whisper_style.jsonl)
   * Extract meaningful exchanges
   */
  parseCallFormat(data) {
    const transcript = data.transcript;
    const callId = data.call_id;

    // Clean up transcript
    const cleanTranscript = transcript
      .replace(/patient:/gi, '\nPatient:')
      .replace(/clinic:/gi, '\nClinic:')
      .trim();

    return new Document({
      pageContent: cleanTranscript,
      metadata: {
        source: `call_${callId}`,
        type: 'call_transcript',
        call_id: callId
      }
    });
  }
}

export default JSONLLoader;
