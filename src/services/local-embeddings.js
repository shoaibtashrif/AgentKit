import { pipeline } from '@xenova/transformers';

/**
 * Local Embeddings using Transformers.js
 * Pure Node.js implementation - no Python required
 * Provides LangChain-compatible embeddings interface
 */
class LocalEmbeddings {
  constructor(modelName = 'Xenova/all-MiniLM-L6-v2') {
    this.modelName = modelName;
    this.extractor = null;
    this.isReady = false;
  }

  /**
   * Initialize the embedding model
   * Downloads model on first run (~25MB), then caches locally
   */
  async start() {
    try {
      console.log(`[Embeddings] Loading model: ${this.modelName}...`);

      this.extractor = await pipeline('feature-extraction', this.modelName, {
        quantized: true // Use quantized model for faster performance
      });

      this.isReady = true;
      console.log('[Embeddings] Model loaded successfully');
    } catch (error) {
      console.error('[Embeddings] Failed to load model:', error.message);
      throw error;
    }
  }

  /**
   * Generate embeddings with mean pooling
   * @private
   */
  async _embed(texts) {
    if (!this.isReady || !this.extractor) {
      throw new Error('Embedding model not initialized. Call start() first.');
    }

    // Ensure texts is an array
    const textsArray = Array.isArray(texts) ? texts : [texts];

    // Generate embeddings
    const output = await this.extractor(textsArray, { pooling: 'mean', normalize: true });

    // Convert to array format
    return output.tolist();
  }

  /**
   * Embed documents (LangChain compatible interface)
   * @param {Array<string>} texts - Array of documents to embed
   * @returns {Promise<Array<Array<number>>>} Array of embedding vectors
   */
  async embedDocuments(texts) {
    return await this._embed(texts);
  }

  /**
   * Embed a query (LangChain compatible interface)
   * @param {string} text - Query text to embed
   * @returns {Promise<Array<number>>} Embedding vector
   */
  async embedQuery(text) {
    const embeddings = await this._embed([text]);
    return embeddings[0];
  }

  /**
   * Stop the service (cleanup)
   */
  async stop() {
    this.extractor = null;
    this.isReady = false;
    console.log('[Embeddings] Service stopped');
  }
}

export default LocalEmbeddings;
