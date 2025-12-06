import { OpenAIEmbeddings } from '@langchain/openai';
import { FaissStore } from '@langchain/community/vectorstores/faiss';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class RAGService {
  constructor(openaiApiKey) {
    this.openaiApiKey = openaiApiKey;
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: openaiApiKey,
      modelName: 'text-embedding-3-small' // Fast and cost-effective
    });
    this.vectorStore = null;
    this.vectorStorePath = path.join(__dirname, '../../data/vectorstore');
  }

  /**
   * Initialize the RAG system by loading or creating the vector store
   */
  async initialize() {
    try {
      // Try to load existing FAISS vector store
      if (fs.existsSync(this.vectorStorePath)) {
        console.log('[RAG] Loading existing FAISS vector store...');
        this.vectorStore = await FaissStore.load(
          this.vectorStorePath,
          this.embeddings
        );
        console.log('✓ RAG FAISS vector store loaded successfully');
        return true;
      } else {
        console.log('[RAG] No vector store found. Please run document ingestion first.');
        return false;
      }
    } catch (error) {
      console.error('[RAG] Error initializing:', error.message);
      return false;
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

      // Load all text files from the documents directory
      const loader = new DirectoryLoader(
        documentsPath,
        {
          '.txt': (path) => new TextLoader(path)
        }
      );

      const docs = await loader.load();
      console.log(`[RAG] Loaded ${docs.length} documents`);

      if (docs.length === 0) {
        throw new Error('No documents found to ingest');
      }

      // Split documents into chunks (smaller for speed)
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 300,
        chunkOverlap: 30
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
   * @param {number} k - Number of relevant documents to retrieve (default: 3)
   * @returns {Promise<Object>} Object containing context and metadata
   */
  async query(query, k = 3) {
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

      // Search for relevant documents
      const results = await this.vectorStore.similaritySearchWithScore(query, k);

      if (results.length === 0) {
        return {
          hasContext: false,
          context: '',
          sources: []
        };
      }

      // Format context from results
      const contextParts = results.map((result, index) => {
        const [doc] = result;
        return `[Source ${index + 1}]:\n${doc.pageContent}`;
      });

      const context = contextParts.join('\n\n');

      // Extract source metadata
      const sources = results.map((result) => {
        const [doc] = result;
        return {
          source: doc.metadata.source,
          content: doc.pageContent.substring(0, 100) + '...'
        };
      });

      console.log(`[RAG] Found ${results.length} relevant documents for query: "${query.substring(0, 50)}..."`);

      return {
        hasContext: true,
        context,
        sources
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
