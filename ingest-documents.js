import dotenv from 'dotenv';
import RAGService from './src/services/rag.js';

dotenv.config();

async function main() {
  console.log('🔄 Starting document ingestion...\n');

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY not found in .env file');
    process.exit(1);
  }

  try {
    const ragService = new RAGService(process.env.OPENAI_API_KEY);

    console.log('📚 Ingesting documents from data/documents directory...');
    await ragService.ingestDocuments();

    console.log('\n✅ Document ingestion completed successfully!');
    console.log('📊 Vector store saved to: data/vectorstore');
    console.log('\nYou can now start the voice agent with: npm start');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error during ingestion:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
