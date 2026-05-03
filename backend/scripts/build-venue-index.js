/**
 * One-time indexing script: builds a pre-computed venue index for fast vector search.
 * 
 * Usage: node scripts/build-venue-index.js [--pages N]
 * 
 * Fetches top venues from OpenAlex (sorted by citations), extracts concepts,
 * computes embeddings with the same local model used at query time, and saves
 * a compact index (metadata JSON + binary embeddings).
 * 
 * API cost: ~15 OpenAlex calls (light).
 * Time: ~3-5 minutes (mostly embedding computation).
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = true;
env.useBrowserCache = false;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');

const OA_BASE = 'https://api.openalex.org';
const OA_HEADERS = { 'User-Agent': 'VibeApp/1.0 (venue indexer)' };
const EMBEDDING_DIM = 768;

// All elite venue IDs from elite-venues.js (deduplicated)
const ELITE_IDS = new Set([
  // CS/AI
  'S4306420609','S4306419644','S4306419637','S4306420508','S4306418267',
  'S4210191458','S4363607701','S118988714','S139930977','S199944782',
  // NLP
  'S4306420633','S2729999759','S4306419219','S155526855',
  // Biology
  'S137773608','S110447773','S154343897','S1336409049','S156208185',
  // Neuroscience
  'S2298632','S45757444','S5555990','S118357697','S117898428','S125754415',
  // Medicine
  'S62468778','S49861241','S4306400883','S192814187','S203256638',
  // Chemistry
  'S111155417','S67393510','S202193212','S184645833',
  // Physics
  'S24807848','S156274416',
  // General
  'S3880285',
]);

// Map elite IDs to their domain for tagging
const ELITE_DOMAINS = {};
const domainMap = {
  cs_ai: ['S4306420609','S4306419644','S4306419637','S4210191458','S4363607701','S118988714','S139930977','S199944782'],
  nlp: ['S4306420508','S4306418267','S4306420633','S2729999759','S4306419219','S155526855'],
  biology: ['S137773608','S110447773','S154343897','S1336409049','S156208185'],
  neuroscience: ['S2298632','S45757444','S5555990','S118357697','S117898428'],
  medicine: ['S62468778','S49861241','S4306400883','S192814187','S203256638'],
  chemistry: ['S111155417','S67393510','S202193212','S184645833'],
  physics: ['S24807848','S156274416'],
  general_stem: ['S137773608','S3880285','S125754415'],
};
for (const [domain, ids] of Object.entries(domainMap)) {
  for (const id of ids) {
    if (!ELITE_DOMAINS[id]) ELITE_DOMAINS[id] = [];
    ELITE_DOMAINS[id].push(domain);
  }
}

async function fetchPage(page, perPage = 200) {
  const url = `${OA_BASE}/sources?filter=type:journal&sort=cited_by_count:desc&per_page=${perPage}&page=${page}&select=id,display_name,type,works_count,cited_by_count,summary_stats,topics`;
  const res = await fetch(url, { headers: OA_HEADERS });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAlex HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function buildEmbeddingText(venue) {
  const concepts = venue.concepts.slice(0, 15).join(', ');
  return `${venue.name}. Topics: ${concepts}`;
}

async function main() {
  const pageArg = process.argv.find(a => a.startsWith('--pages='));
  const totalPages = pageArg ? parseInt(pageArg.split('=')[1]) : 15; // default 3000 venues

  console.log(`\n=== Venue Index Builder ===`);
  console.log(`Fetching top ${totalPages * 200} venues from OpenAlex...\n`);

  // --- Phase 1: Fetch venue metadata ---
  const venues = [];
  for (let page = 1; page <= totalPages; page++) {
    try {
      const data = await fetchPage(page);
      if (!data.results || data.results.length === 0) {
        console.log(`Page ${page}: no more results, stopping.`);
        break;
      }
      for (const src of data.results) {
        const shortId = src.id.replace('https://openalex.org/', '');
        const concepts = (src.topics || [])
          .sort((a, b) => (b.count || 0) - (a.count || 0))
          .slice(0, 20)
          .map(c => c.display_name);

        if (concepts.length < 2) continue; // Skip venues with no concept data

        venues.push({
          id: shortId,
          name: src.display_name,
          type: src.type,
          works_count: src.works_count || 0,
          cited_by_count: src.cited_by_count || 0,
          h_index: src.summary_stats?.h_index || 0,
          concepts,
          isElite: ELITE_IDS.has(shortId),
          eliteDomains: ELITE_DOMAINS[shortId] || [],
        });
      }
      console.log(`Page ${page}/${totalPages}: ${venues.length} venues fetched`);
    } catch (err) {
      console.error(`Page ${page} failed: ${err.message}`);
      if (venues.length > 500) {
        console.log('Enough venues collected, continuing with what we have...');
        break;
      }
    }
    // Brief delay to be polite to OpenAlex
    if (page < totalPages) await new Promise(r => setTimeout(r, 200));
  }

  if (venues.length === 0) {
    console.error('No venues fetched. Check internet/OpenAlex budget.');
    process.exit(1);
  }

  // --- Phase 2: Compute embeddings ---
  console.log(`\nLoading embedding model (Xenova/all-mpnet-base-v2)...`);
  const extractor = await pipeline('feature-extraction', 'Xenova/all-mpnet-base-v2');
  console.log(`Embedding ${venues.length} venues...\n`);

  const embeddingsBuffer = Buffer.alloc(venues.length * EMBEDDING_DIM * 4);
  const t0 = Date.now();

  for (let i = 0; i < venues.length; i++) {
    const text = buildEmbeddingText(venues[i]);
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    const emb = output.data; // Float32Array

    // Write to binary buffer
    for (let j = 0; j < EMBEDDING_DIM; j++) {
      embeddingsBuffer.writeFloatLE(emb[j], (i * EMBEDDING_DIM + j) * 4);
    }

    if ((i + 1) % 100 === 0 || i === venues.length - 1) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      const rate = ((i + 1) / (Date.now() - t0) * 1000).toFixed(1);
      console.log(`  Embedded ${i + 1}/${venues.length} (${elapsed}s, ${rate} venues/s)`);
    }
  }

  // --- Phase 3: Save index ---
  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Metadata JSON (without embeddings)
  const metadata = {
    version: 1,
    builtAt: new Date().toISOString(),
    model: 'Xenova/all-mpnet-base-v2',
    embeddingDim: EMBEDDING_DIM,
    count: venues.length,
    venues: venues.map(v => ({
      id: v.id,
      name: v.name,
      type: v.type,
      works_count: v.works_count,
      cited_by_count: v.cited_by_count,
      h_index: v.h_index,
      concepts: v.concepts,
      isElite: v.isElite,
      eliteDomains: v.eliteDomains,
    })),
  };

  const metaPath = path.join(DATA_DIR, 'venue-index.json');
  const embPath = path.join(DATA_DIR, 'venue-embeddings.bin');

  fs.writeFileSync(metaPath, JSON.stringify(metadata));
  fs.writeFileSync(embPath, embeddingsBuffer);

  const metaSizeMB = (fs.statSync(metaPath).size / 1024 / 1024).toFixed(1);
  const embSizeMB = (fs.statSync(embPath).size / 1024 / 1024).toFixed(1);

  console.log(`\n=== Index Built Successfully ===`);
  console.log(`Venues: ${venues.length} (${venues.filter(v => v.isElite).length} elite)`);
  console.log(`Metadata: ${metaPath} (${metaSizeMB} MB)`);
  console.log(`Embeddings: ${embPath} (${embSizeMB} MB)`);
  console.log(`Total time: ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
