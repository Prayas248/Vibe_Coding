import app from './app.js';
import { ScoringService } from './services/scoring.service.js';
import { EmbeddingService } from './services/embedding.service.js';
import { VectorStoreService } from './services/vector-store.service.js';
import logger from './config/logger.js';
import { buildVenueCache } from './services/venue-discovery.service.js';

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

console.log(`[SERVER] Attempting to bind to ${HOST}:${PORT}`);

const server = app.listen(PORT, HOST, () => {
  console.log(`[SERVER] Successfully listening on ${HOST}:${PORT}`);
  logger.info(`Server running on port ${PORT}`);

  // Load vector index (sync, fast — just reads files)
  const vectorReady = VectorStoreService.load();
  if (vectorReady) {
    logger.info('Vector store index loaded — fast search mode enabled');
  } else {
    logger.info('Vector store index not found — using live OpenAlex discovery (run: node scripts/build-venue-index.js)');
  }

  // Fire-and-forget: precompute journal embeddings without blocking startup
  const tryPrecompute = () => {
    // Skip if embeddings are mock — vectors would be inconsistent
    if (EmbeddingService.getMode() === 'mock') {
      logger.info('Embedding model is mock — deferring journal precompute (retry in 10s)');
      setTimeout(tryPrecompute, 10_000);
      return;
    }

    ScoringService.precomputeEmbeddings()
      .then(() => logger.info('Journal embedding precompute succeeded'))
      .catch(err => logger.error(`Failed to precompute journal embeddings: ${err.message}`));
  };

  // Kick off after a short delay to let the model init settle
  setTimeout(tryPrecompute, 500);

  setTimeout(() => {
    buildVenueCache()
      .then(() => logger.info('Venue discovery cache ready'))
      .catch(err => logger.warn(`Venue discovery cache failed: ${err.message} — static fallback active`));
  }, 2000); // 2s delay to let embedding model settle first
});

// Keep the event loop alive — Node.js v24 aggressively drains when all async work completes
const keepAlive = setInterval(() => {}, 1 << 30);
server.on('close', () => clearInterval(keepAlive));
