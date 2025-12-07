import dotenv from 'dotenv';
import RAGService from './src/services/rag.js';

dotenv.config();

async function main() {
  console.log('🔄 Starting document ingestion with local embeddings...\n');

  try {
    const ragService = new RAGService();

    // Initialize the RAG service (starts local embedding service)
    console.log('🚀 Initializing RAG service...');
    await ragService.initialize();

    console.log('\n✅ Document ingestion completed successfully!');
    console.log('📊 Vector store saved to: data/vectorstore');
    console.log('\nYou can now start the voice agent with: npm start');

    // Stop the embedding service
    await ragService.embeddings.stop();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error during ingestion:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
