import { FaissStore } from '@langchain/community/vectorstores/faiss';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';
import LocalEmbeddings from './local-embeddings.js';
import JSONLLoader from './jsonl-loader.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class RAGService {
  constructor() {
    this.embeddings = new LocalEmbeddings();
    this.vectorStore = null;
    this.vectorStorePath = path.join(__dirname, '../../data/vectorstore');
  }

  /**
   * Initialize the RAG system by loading or creating the vector store
   * Auto-ingests documents if vectorstore is missing or outdated
   */
  async initialize() {
    try {
      // Start the local embedding service
      console.log('[RAG] Starting local embedding service...');
      await this.embeddings.start();
      console.log('✓ Local embedding service started');

      const documentsPath = path.join(__dirname, '../../data/documents');
      const vectorStoreIndexPath = path.join(this.vectorStorePath, 'faiss.index');
      const vectorStoreExists = fs.existsSync(vectorStoreIndexPath);
      const documentsExist = fs.existsSync(documentsPath);

      // Check if we need to ingest
      let needsIngestion = false;

      if (!vectorStoreExists && documentsExist) {
        console.log('[RAG] No vector store found. Auto-ingesting documents...');
        needsIngestion = true;
      } else if (vectorStoreExists && documentsExist) {
        // Check if documents are newer than vectorstore
        const vectorStoreTime = this.getLatestFileTime(this.vectorStorePath);
        const documentsTime = this.getLatestFileTime(documentsPath);

        if (documentsTime > vectorStoreTime) {
          console.log('[RAG] Documents updated. Re-ingesting...');
          needsIngestion = true;
        }
      }

      // Perform ingestion if needed
      if (needsIngestion) {
        await this.ingestDocuments();
      }

      // Load the vector store
      if (fs.existsSync(this.vectorStorePath)) {
        console.log('[RAG] Loading existing FAISS vector store...');
        this.vectorStore = await FaissStore.load(
          this.vectorStorePath,
          this.embeddings
        );
        console.log('✓ RAG FAISS vector store loaded successfully');
        return true;
      } else {
        console.log('[RAG] No vector store found and no documents to ingest.');
        return false;
      }
    } catch (error) {
      console.error('[RAG] Error initializing:', error.message);
      return false;
    }
  }

  /**
   * Get the latest modification time of files in a directory
   */
  getLatestFileTime(dirPath) {
    try {
      const stats = fs.statSync(dirPath);
      if (!stats.isDirectory()) {
        return stats.mtime;
      }

      let latestTime = stats.mtime;
      const files = fs.readdirSync(dirPath);

      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const fileStats = fs.statSync(filePath);
        if (fileStats.mtime > latestTime) {
          latestTime = fileStats.mtime;
        }
      }

      return latestTime;
    } catch (error) {
      return new Date(0); // Return epoch if error
    }
  }

  /**
   * Ingest documents from the data/documents directory
   */
  async ingestDocuments() {
    try {
      const documentsPath = path.join(__dirname, '../../data/documents');

      if (!fs.existsSync(documentsPath)) {
        throw new Error(`Documents directory not found: ${documentsPath}`);
      }

      console.log('[RAG] Loading documents from:', documentsPath);

      let docs = [];

      // Load .txt files
      const txtLoader = new DirectoryLoader(
        documentsPath,
        {
          '.txt': (path) => new TextLoader(path)
        }
      );
      const txtDocs = await txtLoader.load();
      docs.push(...txtDocs);
      console.log(`[RAG] Loaded ${txtDocs.length} .txt documents`);

      // Load .jsonl files
      const jsonlFiles = fs.readdirSync(documentsPath)
        .filter(file => file.endsWith('.jsonl'))
        .map(file => path.join(documentsPath, file));

      for (const jsonlFile of jsonlFiles) {
        const loader = new JSONLLoader(jsonlFile);
        const jsonlDocs = await loader.load();
        docs.push(...jsonlDocs);
      }

      console.log(`[RAG] Total loaded: ${docs.length} documents`);

      if (docs.length === 0) {
        throw new Error('No documents found to ingest');
      }

      // Split documents into chunks (optimized for voice)
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 300,
        chunkOverlap: 60  // 20% overlap for better context preservation
      });

      const splitDocs = await textSplitter.splitDocuments(docs);
      console.log(`[RAG] Split into ${splitDocs.length} chunks`);

      // Create FAISS vector store from documents
      console.log('[RAG] Creating embeddings and FAISS vector store...');
      this.vectorStore = await FaissStore.fromDocuments(
        splitDocs,
        this.embeddings
      );

      // Save FAISS vector store to disk
      if (!fs.existsSync(this.vectorStorePath)) {
        fs.mkdirSync(this.vectorStorePath, { recursive: true });
      }

      await this.vectorStore.save(this.vectorStorePath);
      console.log('✓ RAG FAISS vector store created and saved successfully');

      return true;
    } catch (error) {
      console.error('[RAG] Error ingesting documents:', error.message);
      throw error;
    }
  }

  /**
   * Query the RAG system for relevant context
   * @param {string} query - The user's question
   * @param {number} k - Number of relevant documents to retrieve (default: 2 for voice)
   * @param {number} scoreThreshold - Minimum similarity score (0-1, default: 0.7)
   * @returns {Promise<Object>} Object containing context and metadata
   */
  async query(query, k = 2, scoreThreshold = 0.7) {
    try {
      if (!this.vectorStore) {
        console.warn('[RAG] Vector store not initialized, initializing now...');
        const initialized = await this.initialize();
        if (!initialized) {
          return {
            hasContext: false,
            context: '',
            sources: []
          };
        }
      }

      // Search for relevant documents with similarity scores
      const results = await this.vectorStore.similaritySearchWithScore(query, k);

      // Filter by similarity score threshold
      const filtered = results.filter(([doc, score]) => score >= scoreThreshold);

      if (filtered.length === 0) {
        console.log(`[RAG] No documents found above threshold ${scoreThreshold} for query`);
        return {
          hasContext: false,
          context: '',
          sources: []
        };
      }

      // Format context from filtered results
      const contextParts = filtered.map((result, index) => {
        const [doc, score] = result;
        return `[Source ${index + 1}] (relevance: ${(score * 100).toFixed(0)}%):\n${doc.pageContent}`;
      });

      const context = contextParts.join('\n\n');

      // Extract source metadata with scores and check for direct answers
      const sources = filtered.map((result) => {
        const [doc, score] = result;
        return {
          source: doc.metadata.source,
          content: doc.pageContent.substring(0, 100) + '...',
          score: score,
          metadata: doc.metadata,
          fullContent: doc.pageContent
        };
      });

      console.log(`[RAG] Found ${filtered.length}/${results.length} relevant documents (threshold: ${scoreThreshold}) for query: "${query.substring(0, 50)}..."`);
      if (filtered.length > 0) {
        console.log(`[RAG] Best match score: ${(sources[0].score * 100).toFixed(0)}%`);
      }

      // Check if we have a high-confidence direct answer from Q&A pairs
      const directAnswer = this.extractDirectAnswer(sources);

      return {
        hasContext: true,
        context,
        sources,
        directAnswer: directAnswer.answer,
        confidence: directAnswer.confidence
      };
    } catch (error) {
      console.error('[RAG] Error querying:', error.message);
      return {
        hasContext: false,
        context: '',
        sources: [],
        error: error.message
      };
    }
  }

  /**
   * Extract direct answer from Q&A pairs with high confidence
   * @param {Array} sources - Retrieved sources with scores
   * @returns {Object} {answer: string|null, confidence: string}
   */
  extractDirectAnswer(sources) {
    if (!sources || sources.length === 0) {
      return { answer: null, confidence: 'none' };
    }

    const topSource = sources[0];

    // High confidence: score >= 0.8 AND it's a Q&A pair with full answer
    if (topSource.score >= 0.8 && topSource.metadata.type === 'qa_pair') {
      console.log('[RAG] ✓ High confidence direct answer (score >= 0.8, Q&A pair)');
      return {
        answer: topSource.metadata.answer,
        confidence: 'high'
      };
    }

    // Medium confidence: score >= 0.6
    if (topSource.score >= 0.6) {
      return { answer: null, confidence: 'medium' };
    }

    // Low confidence: score < 0.6
    return { answer: null, confidence: 'low' };
  }

  /**
   * Check if query is relevant to the knowledge base
   * @param {string} query - The user's question
   * @returns {boolean} True if query seems relevant to pain management
   */
  isRelevantQuery(query) {
    const relevantKeywords = [
      'pain', 'appointment', 'schedule', 'doctor', 'treatment', 'insurance',
      'service', 'therapy', 'medication', 'procedure', 'clinic', 'center',
      'provider', 'physician', 'hours', 'location', 'cost', 'billing',
      'injection', 'physical therapy', 'back', 'neck', 'chronic', 'acute',
      'northview'
    ];

    const queryLower = query.toLowerCase();
    return relevantKeywords.some(keyword => queryLower.includes(keyword));
  }
}

export default RAGService;
