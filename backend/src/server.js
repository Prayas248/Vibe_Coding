import app from './app.js';
import { ScoringService } from './services/scoring.service.js';
import { EmbeddingService } from './services/embedding.service.js';
import logger from './config/logger.js';
import { buildVenueCache } from './services/venue-discovery.service.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);

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
