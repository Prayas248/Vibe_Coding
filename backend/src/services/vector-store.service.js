/**
 * Vector Store Service — fast pre-indexed venue search.
 * 
 * Loads venue-index.json + venue-embeddings.bin at startup.
 * At query time: brute-force cosine similarity over all venue embeddings.
 * For <5000 venues × 768 dims, this takes <50ms.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../config/logger.js';
import { ELITE_VENUES } from '../data/elite-venues.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

let _index = null;       // { venues: [...], count, embeddingDim, ... }
let _embeddings = null;  // Float32Array of all embeddings concatenated
let _loaded = false;

// Build elite reputation lookup from elite-venues.js
const _eliteReputation = new Map();
for (const venues of Object.values(ELITE_VENUES)) {
  for (const v of venues) {
    if (!_eliteReputation.has(v.id) || v.reputation > _eliteReputation.get(v.id)) {
      _eliteReputation.set(v.id, v.reputation);
    }
  }
}

export class VectorStoreService {
  /**
   * Load the pre-built index. Call once at startup.
   * Returns false if index files don't exist (system falls back to live search).
   */
  static load() {
    const metaPath = path.join(DATA_DIR, 'venue-index.json');
    const embPath = path.join(DATA_DIR, 'venue-embeddings.bin');

    if (!fs.existsSync(metaPath) || !fs.existsSync(embPath)) {
      logger.warn('[VECTOR-STORE] Index files not found. Run: node scripts/build-venue-index.js');
      _loaded = false;
      return false;
    }

    try {
      const t0 = Date.now();
      const metaRaw = fs.readFileSync(metaPath, 'utf-8');
      _index = JSON.parse(metaRaw);

      const embBuffer = fs.readFileSync(embPath);
      _embeddings = new Float32Array(embBuffer.buffer, embBuffer.byteOffset, embBuffer.length / 4);

      const expected = _index.count * _index.embeddingDim;
      if (_embeddings.length !== expected) {
        throw new Error(`Embedding size mismatch: got ${_embeddings.length}, expected ${expected}`);
      }

      _loaded = true;
      const elapsed = Date.now() - t0;
      logger.info(`[VECTOR-STORE] Loaded ${_index.count} venues in ${elapsed}ms (built: ${_index.builtAt})`);
      return true;
    } catch (err) {
      logger.error(`[VECTOR-STORE] Failed to load index: ${err.message}`);
      _loaded = false;
      return false;
    }
  }

  static isAvailable() {
    return _loaded && _index && _embeddings;
  }

  /**
   * Search for venues most similar to the query embedding.
   * 
   * @param {number[]} queryEmbedding - 768-dim abstract embedding
   * @param {object} options
   * @param {number} options.topK - number of results (default 30)
   * @param {string} options.domain - detected paper domain for boosting
   * @param {boolean} options.eliteOnly - only return elite venues
   * @returns {object[]} - venues sorted by similarity, formatted for scoring pipeline
   */
  static search(queryEmbedding, options = {}) {
    if (!_loaded) return [];

    const { topK = 30, domain = null, eliteOnly = false } = options;
    const dim = _index.embeddingDim;
    const venues = _index.venues;

    // Pre-compute query norm
    let qNorm = 0;
    for (let i = 0; i < dim; i++) qNorm += queryEmbedding[i] * queryEmbedding[i];
    qNorm = Math.sqrt(qNorm);
    if (qNorm === 0) return [];

    // Compute cosine similarity for all venues
    const scores = new Float32Array(venues.length);
    for (let v = 0; v < venues.length; v++) {
      if (eliteOnly && !venues[v].isElite) continue;

      const offset = v * dim;
      let dot = 0, vNorm = 0;
      for (let i = 0; i < dim; i++) {
        const val = _embeddings[offset + i];
        dot += queryEmbedding[i] * val;
        vNorm += val * val;
      }
      vNorm = Math.sqrt(vNorm);
      scores[v] = (vNorm > 0) ? dot / (qNorm * vNorm) : 0;
    }

    // Build scored candidates with domain boosting
    const candidates = [];
    for (let v = 0; v < venues.length; v++) {
      if (scores[v] <= 0) continue;
      if (eliteOnly && !venues[v].isElite) continue;

      let boostedScore = scores[v];

      if (venues[v].isElite) {
        const domainMatches = domain && venues[v].eliteDomains?.includes(domain);
        // Related domain pairs (partial credit)
        const RELATED = { nlp: ['cs_ai'], cs_ai: ['nlp'], biology: ['medicine', 'neuroscience'], 
                          medicine: ['biology', 'neuroscience'], neuroscience: ['biology', 'medicine'],
                          chemistry: ['biology', 'physics'], physics: ['chemistry'] };
        const relatedMatch = domain && !domainMatches && 
          (RELATED[domain] || []).some(d => venues[v].eliteDomains?.includes(d));

        if (domainMatches) {
          boostedScore += 0.10; // Strong boost for same-domain elite
        } else if (relatedMatch) {
          boostedScore += 0.02; // Small boost for related domain
        } else if (domain && venues[v].eliteDomains?.length > 0) {
          boostedScore -= 0.08; // Penalize off-domain elite (e.g., biology elite for NLP paper)
        }
      }

      candidates.push({ index: v, score: boostedScore, rawScore: scores[v] });
    }

    // Sort by boosted score, take top K
    candidates.sort((a, b) => b.score - a.score);
    const topCandidates = candidates.slice(0, topK);

    // Format for the scoring pipeline
    return topCandidates.map(c => {
      const v = venues[c.index];
      const reputation = _eliteReputation.get(v.id) || 
        Math.min(0.98, Math.max(0.4, (v.h_index / 120) * 0.55 + 0.43));

      return {
        id: v.id,
        name: v.name,
        type: v.type,
        venue_type: v.type,
        works_count: v.works_count,
        cited_by_count: v.cited_by_count,
        h_index: v.h_index,
        isElite: v.isElite,
        reputation,
        frequency: 1,
        searchFrequency: 0,
        // Scoring-compatible fields built from concepts
        scope: v.concepts.slice(0, 8).join(', '),
        keywords: v.concepts.slice(0, 15),
        domain: v.concepts[0] || 'General Science',
        // Vector search metadata
        _vectorScore: c.rawScore,
        _boostedScore: c.score,
        _source: 'vector-index',
      };
    });
  }
}
