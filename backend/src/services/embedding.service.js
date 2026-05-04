import logger from '../config/logger.js';

const HF_MODEL = 'sentence-transformers/all-mpnet-base-v2';
const HF_API_URL = `https://api-inference.huggingface.co/pipeline/feature-extraction/${HF_MODEL}`;

// Strategy: HF Inference API (fast, same model) → local Xenova (offline/dev) → mock
let mode = null; // 'hf-api' | 'xenova' | 'mock'
let hfToken = null;
let extractor = null;
const embeddingCache = new Map();

async function callHFApi(text) {
  const res = await fetch(HF_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${hfToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`HF API ${res.status}: ${errBody}`);
  }
  const data = await res.json();
  // HF returns [[...768 floats]] for feature-extraction pipeline
  // Mean-pool across tokens then return
  if (Array.isArray(data) && Array.isArray(data[0]) && Array.isArray(data[0][0])) {
    // Token-level embeddings: shape [1, tokens, 768] — mean pool
    const tokens = data[0];
    const dim = tokens[0].length;
    const mean = new Array(dim).fill(0);
    for (const tok of tokens) {
      for (let i = 0; i < dim; i++) mean[i] += tok[i];
    }
    for (let i = 0; i < dim; i++) mean[i] /= tokens.length;
    // L2 normalize
    const norm = Math.sqrt(mean.reduce((s, v) => s + v * v, 0));
    return norm > 0 ? mean.map(v => v / norm) : mean;
  }
  if (Array.isArray(data) && typeof data[0] === 'number') {
    return data; // Already pooled
  }
  throw new Error('Unexpected HF API response shape');
}

export class EmbeddingService {
  static async init() {
    if (mode) return;

    // Try HF Inference API first (same model, remote inference)
    hfToken = process.env.HF_TOKEN;
    if (hfToken) {
      try {
        const testEmb = await callHFApi('test');
        if (testEmb.length === 768) {
          mode = 'hf-api';
          logger.info(`[EMBEDDING-MODEL] Using HF Inference API: ${HF_MODEL} | Dimensions: 768`);
          return;
        }
      } catch (err) {
        logger.warn(`HF Inference API init failed: ${err.message}, trying local model...`);
      }
    }

    // Fallback: local Xenova model (good for local dev)
    try {
      const { pipeline, env } = await import('@xenova/transformers');
      env.allowLocalModels = true;
      env.useBrowserCache = false;
      logger.info('Initializing local embedding model (Xenova/all-mpnet-base-v2)...');
      extractor = await pipeline('feature-extraction', 'Xenova/all-mpnet-base-v2');
      mode = 'xenova';
      logger.info('[EMBEDDING-MODEL] Using local Xenova/all-mpnet-base-v2 | Dimensions: 768');
    } catch (error) {
      logger.warn('Failed to initialize local embedding model. Falling back to mock embeddings.');
      mode = 'mock';
    }
  }

  static async getEmbedding(text) {
    if (embeddingCache.has(text)) {
      return embeddingCache.get(text);
    }

    await this.init();

    let result;

    if (mode === 'hf-api') {
      try {
        result = await callHFApi(text);
      } catch (err) {
        logger.error(`HF API embedding error: ${err.message}`);
      }
    } else if (mode === 'xenova' && extractor) {
      try {
        const output = await extractor(text, { pooling: 'mean', normalize: true });
        result = Array.from(output.data);
      } catch (err) {
        logger.error(`Xenova embedding error: ${err.message}`);
      }
    }

    if (!result) {
      result = new Array(768).fill(0).map((_, i) => (text.length + i) % 100 / 100);
    }

    embeddingCache.set(text, result);
    return result;
  }

  static getMode() {
    return mode || 'mock';
  }
}
