#!/usr/bin/env python3
"""
Local Embedding Service using Sentence Transformers
Provides embeddings for RAG without requiring OpenAI API
"""

import sys
import json
from sentence_transformers import SentenceTransformer
import numpy as np

class LocalEmbeddingService:
    def __init__(self, model_name='all-MiniLM-L6-v2'):
        """
        Initialize the embedding model
        all-MiniLM-L6-v2: Fast, lightweight, good for semantic search (384 dimensions)
        Other options:
        - all-mpnet-base-v2: Better quality but slower (768 dimensions)
        - paraphrase-MiniLM-L3-v2: Faster but lower quality (384 dimensions)
        """
        print(f"[Embeddings] Loading model: {model_name}...", file=sys.stderr)
        self.model = SentenceTransformer(model_name)
        print(f"[Embeddings] Model loaded successfully", file=sys.stderr)

    def embed_texts(self, texts):
        """
        Generate embeddings for a list of texts
        Returns: List of embedding vectors
        """
        if isinstance(texts, str):
            texts = [texts]

        embeddings = self.model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
        return embeddings.tolist()

    def embed_query(self, query):
        """
        Generate embedding for a single query
        Returns: Single embedding vector
        """
        embedding = self.model.encode(query, convert_to_numpy=True, show_progress_bar=False)
        return embedding.tolist()

def main():
    """
    CLI interface for the embedding service
    Reads JSON from stdin and writes JSON to stdout
    """
    service = LocalEmbeddingService()

    print("[Embeddings] Service ready, waiting for requests...", file=sys.stderr)

    for line in sys.stdin:
        try:
            request = json.loads(line.strip())
            action = request.get('action')

            if action == 'embed_texts':
                texts = request.get('texts', [])
                result = service.embed_texts(texts)
                response = {'status': 'success', 'embeddings': result}

            elif action == 'embed_query':
                query = request.get('query', '')
                result = service.embed_query(query)
                response = {'status': 'success', 'embedding': result}

            elif action == 'ping':
                response = {'status': 'success', 'message': 'pong'}

            else:
                response = {'status': 'error', 'message': f'Unknown action: {action}'}

            print(json.dumps(response), flush=True)

        except Exception as e:
            error_response = {'status': 'error', 'message': str(e)}
            print(json.dumps(error_response), flush=True)

if __name__ == '__main__':
    main()
