import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Local Embeddings using Sentence Transformers
 * Provides a LangChain-compatible embeddings interface
 */
class LocalEmbeddings {
  constructor() {
    this.pythonProcess = null;
    this.requestQueue = [];
    this.isReady = false;
  }

  /**
   * Start the Python embedding service
   */
  async start() {
    return new Promise((resolve, reject) => {
      const pythonScript = path.join(__dirname, 'python', 'embeddings.py');

      this.pythonProcess = spawn('python3', [pythonScript], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const rl = readline.createInterface({
        input: this.pythonProcess.stdout,
        crlfDelay: Infinity
      });

      // Handle responses from Python
      rl.on('line', (line) => {
        try {
          const response = JSON.parse(line);
          const callback = this.requestQueue.shift();
          if (callback) {
            if (response.status === 'success') {
              callback.resolve(response);
            } else {
              callback.reject(new Error(response.message || 'Embedding failed'));
            }
          }
        } catch (error) {
          console.error('[LocalEmbeddings] Error parsing response:', error.message);
        }
      });

      // Handle errors from Python
      this.pythonProcess.stderr.on('data', (data) => {
        const message = data.toString();
        console.log('[LocalEmbeddings]', message.trim());

        // Check if service is ready
        if (message.includes('Service ready')) {
          this.isReady = true;
          resolve();
        }
      });

      this.pythonProcess.on('error', (error) => {
        console.error('[LocalEmbeddings] Process error:', error);
        reject(error);
      });

      this.pythonProcess.on('exit', (code) => {
        console.log(`[LocalEmbeddings] Process exited with code ${code}`);
        this.isReady = false;
      });

      // Timeout if service doesn't start
      setTimeout(() => {
        if (!this.isReady) {
          reject(new Error('Python embedding service failed to start'));
        }
      }, 30000);
    });
  }

  /**
   * Send a request to the Python service
   */
  async sendRequest(request) {
    return new Promise((resolve, reject) => {
      if (!this.pythonProcess || !this.isReady) {
        reject(new Error('Python embedding service not ready'));
        return;
      }

      this.requestQueue.push({ resolve, reject });
      this.pythonProcess.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  /**
   * Embed documents (LangChain compatible interface)
   * @param {Array<string>} texts - Array of documents to embed
   * @returns {Promise<Array<Array<number>>>} Array of embedding vectors
   */
  async embedDocuments(texts) {
    const response = await this.sendRequest({
      action: 'embed_texts',
      texts: texts
    });
    return response.embeddings;
  }

  /**
   * Embed a query (LangChain compatible interface)
   * @param {string} text - Query text to embed
   * @returns {Promise<Array<number>>} Embedding vector
   */
  async embedQuery(text) {
    const response = await this.sendRequest({
      action: 'embed_query',
      query: text
    });
    return response.embedding;
  }

  /**
   * Stop the Python service
   */
  async stop() {
    if (this.pythonProcess) {
      this.pythonProcess.kill();
      this.pythonProcess = null;
      this.isReady = false;
    }
  }
}

export default LocalEmbeddings;
