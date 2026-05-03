import { pipeline, env } from '@xenova/transformers';
import logger from '../config/logger.js';

// Let Xenova use local cache
env.allowLocalModels = true;
env.useBrowserCache = false;

let extractor = null;
let useMock = false;
const embeddingCache = new Map();

export class EmbeddingService {
  static async init() {
    if (!extractor && !useMock) {
      try {
        logger.info('Initializing local embedding model (Xenova/all-mpnet-base-v2)...');
        extractor = await pipeline('feature-extraction', 'Xenova/all-mpnet-base-v2');
        logger.info('Embedding model initialized successfully.');
        logger.info('[EMBEDDING-MODEL] Loaded: all-mpnet-base-v2 | Dimensions: 768');
      } catch (error) {
        logger.warn('Failed to initialize local embedding model. Falling back to mock embeddings for demo stability.');
        useMock = true;
      }
    }
  }

  static async getEmbedding(text) {
    if (embeddingCache.has(text)) {
      return embeddingCache.get(text);
    }

    await this.init();
    
    if (useMock || !extractor) {
      // Return a deterministic mock embedding based on text length
      const mockVector = new Array(768).fill(0).map((_, i) => (text.length + i) % 100 / 100);
      embeddingCache.set(text, mockVector);
      return mockVector;
    }

    try {
      // Generate embeddings
      const output = await extractor(text, { pooling: 'mean', normalize: true });
      const result = Array.from(output.data);
      embeddingCache.set(text, result);
      return result;
    } catch (err) {
      logger.error('Error generating embedding, using mock', err);
      return new Array(768).fill(0.1);
    }
  }
  static getMode() {
    return useMock ? "mock" : "real";
  }
}
