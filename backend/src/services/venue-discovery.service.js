import { ELITE_VENUES } from '../data/elite-venues.js';
import logger from '../config/logger.js';

// Domain → topic search queries
const DOMAIN_QUERIES = {
  neuroscience: [
    'synaptic plasticity neuronal circuits hippocampus memory',
    'brain function neural activity cortex behavior',
  ],
  biology: 'CRISPR gene expression protein folding cell biology',
  cs_ai: 'deep learning convolutional neural network natural language processing GPU training',
  nlp: 'natural language processing computational linguistics',
  general_stem: 'Nature Science PNAS multidisciplinary breakthrough discovery',
  medicine: 'randomized controlled trial cancer immunotherapy clinical outcomes',
  chemistry: [
    'organic synthesis catalysis reaction mechanism heterocyclic',
    'analytical chemistry mass spectrometry chromatography spectroscopy NMR'
  ],
};

const STATIC_FALLBACK = {
  neuroscience: ['Nature Neuroscience', 'Neuron', 'Journal of Neuroscience', 'NeuroImage', 'Cerebral Cortex'],
  biology: ['Nature', 'Cell', 'PLOS Biology', 'Genome Biology', 'Molecular Cell'],
  medicine: ['New England Journal of Medicine', 'The Lancet', 'JAMA', 'Nature Medicine', 'BMJ'],
  chemistry: ['Journal of the American Chemical Society', 'Angewandte Chemie', 'Nature Chemistry', 'Chemical Science', 'Analytical Chemistry'],
  general_stem: ['Nature', 'Science', 'PNAS', 'Nature Communications'],
};

// In-memory cache — computed once at startup
let venueCache = null;
let cacheReady = false;

async function getTopicsForQuery(query) {
  const res = await fetch(
    `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per_page=10&select=topics`,
    { headers: { 'User-Agent': 'orbis/1.0' } }
  );
  const data = await res.json();
  const topicIds = [...new Set(
    data.results?.flatMap(w => w.topics?.map(t => t.id.replace('https://openalex.org/', '')) || []) || []
  )].slice(0, 3);
  return topicIds;
}

async function getTopVenuesForTopic(topicId) {
  const res = await fetch(
    `https://api.openalex.org/works?filter=topics.id:${topicId}&sort=cited_by_count:desc&per_page=50&select=primary_location`,
    { headers: { 'User-Agent': 'orbis/1.0' } }
  );
  const data = await res.json();

  // Tally venue appearances
  const tally = {};
  data.results?.forEach(w => {
    const src = w.primary_location?.source;
    if (src?.id && src?.display_name) {
      const shortId = src.id.replace('https://openalex.org/', '');
      if (!tally[shortId]) {
        tally[shortId] = {
          id: shortId,
          name: src.display_name,
          count: 0,
          works_count: src.works_count || 1
        };
      }
      tally[shortId].count++;
    }
  });

  // Specificity score: rewards journals where this topic dominates their output
  // A journal with 3 appearances out of 8,000 total works beats one with 
  // 6 appearances out of 447,000 total works
  return Object.values(tally)
    .map(v => ({
      ...v,
      specificityScore: (v.count / Math.log1p(v.works_count)) * v.count
    }))
    .sort((a, b) => b.specificityScore - a.specificityScore)
    .slice(0, 8);
}

export async function buildVenueCache() {
  logger.info('[VENUE-DISCOVERY] Building citation-driven venue cache...');
  const cache = {};

  // Check OpenAlex budget status at startup
  try {
    const budgetCheck = await fetch('https://api.openalex.org/works?filter=is_oa:true&per_page=1', {
      headers: { 'User-Agent': 'orbis/1.0' }
    });
    const remaining = budgetCheck.headers.get('x-ratelimit-remaining');
    console.log('[OPENALEX] Budget remaining at startup:', remaining ?? 'unknown');
    if (remaining === '0') {
      console.warn('[OPENALEX] Budget exhausted — using static fallbacks for all domains');
      for (const [domain] of Object.entries(DOMAIN_QUERIES)) {
        if (domain === 'cs_ai' || domain === 'nlp') {
          cache[domain] = (ELITE_VENUES[domain] || []).map(v => ({ ...v, isElite: true }));
        } else {
          cache[domain] = (STATIC_FALLBACK[domain] || []).map(v => ({ name: v, isElite: true }));
        }
      }
      venueCache = cache;
      cacheReady = true;
      logger.info('[VENUE-DISCOVERY] Cache build complete (static fallback mode)');
      return cache;
    }
  } catch (e) {
    console.warn('[OPENALEX] Budget check failed:', e.message);
  }

  for (const [domain, query] of Object.entries(DOMAIN_QUERIES)) {
    // These domains use static lists — dynamic discovery for these is either unreliable or requires strict curation
    if (domain === 'cs_ai' || domain === 'nlp') {
      cache[domain] = (ELITE_VENUES[domain] || []).map(v => ({ ...v, isElite: true }));
      logger.info(`[VENUE-DISCOVERY] ${domain} → using curated static list`);
      continue;
    }

    try {
      let topicIds = [];
      if (Array.isArray(query)) {
        for (const q of query) {
          topicIds.push(...(await getTopicsForQuery(q)));
        }
        topicIds = [...new Set(topicIds)];
      } else {
        topicIds = await getTopicsForQuery(query);
      }
      logger.info(`[VENUE-DISCOVERY] ${domain} → topics: ${topicIds.join(', ')}`);

      const venueMap = new Map();
      for (const topicId of topicIds) {
        const venues = await getTopVenuesForTopic(topicId);
        venues.forEach(v => {
          if (!venueMap.has(v.id)) venueMap.set(v.id, { ...v, isElite: true, reputation: 0.9 });
          else venueMap.get(v.id).count += v.count;
        });
      }

      // Sort by total citation tally, take top 15 (to allow room for filtering)
      let results = Array.from(venueMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

      // Post-filtering
      if (domain === 'cs_ai') {
        const blacklist = ['physiology', 'evolutionary', 'statistical', 'physics', 'eBooks', 'arXiv'];
        results = results.filter(v => !blacklist.some(term => v.name.toLowerCase().includes(term.toLowerCase())));
      } else if (domain === 'general_stem') {
        const whitelist = ['Nature', 'Science', 'PNAS', 'Proceedings', 'Royal Society'];
        const blacklist = ['Information Science', 'Library', 'Management', 'Education', 'Psychology'];
        
        results = results.filter(v => 
          whitelist.some(term => v.name.includes(term)) &&
          !blacklist.some(term => v.name.includes(term))
        );

        if (results.length < 3) {
          const fallback = (ELITE_VENUES.general_stem || [])
            .filter(v => !results.some(r => r.id === v.id))
            .map(v => ({ ...v, isElite: true, count: 0 }));
          results = [...results, ...fallback];
        }
      }

      cache[domain] = results.slice(0, 10);

      if (cache[domain].length === 0) {
        console.warn(`[VENUE-DISCOVERY] ${domain} dynamic cache empty — using static fallback`);
        cache[domain] = (STATIC_FALLBACK[domain] || []).map(v => ({ name: v, isElite: true }));
      }

      logger.info(`[VENUE-DISCOVERY] ${domain} → ${cache[domain].length} venues cached: ${cache[domain].map(v => v.name).join(', ')}`);
    } catch (e) {
      // Fallback to static list for this domain
      console.warn(`[VENUE-DISCOVERY] ${domain} cache failed (${e.message}), falling back to static list`);
      cache[domain] = (STATIC_FALLBACK[domain] || []).map(v => ({ name: v, isElite: true }));
    }

    // Delay between domain queries to avoid OpenAlex rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  venueCache = cache;
  cacheReady = true;
  logger.info('[VENUE-DISCOVERY] Cache build complete');
  return cache;
}

export function getEliteVenuesForDomain(domain) {
  const normalizedDomain = (domain || '').toLowerCase().trim();
  const availableKeys = venueCache ? Object.keys(venueCache).join(', ') : 'null';
  logger.info(`[CACHE-LOOKUP] Looking for domain: "${normalizedDomain}" | Available keys: ${availableKeys}`);

  if (!cacheReady || !venueCache) {
    // Fallback to static list if cache not ready yet
    logger.warn(`[VENUE-DISCOVERY] Cache not ready — falling back to static list for domain: ${normalizedDomain}`);
    return (ELITE_VENUES[normalizedDomain] || []).map(v => ({ ...v, isElite: true }));
  }
  // Merge domain-specific + general_stem (only for non-CS domains), deduplicated by ID
  const domainVenues = venueCache[normalizedDomain] || [];
  
  // Don't inject general_stem (Nature/Science/PNAS) into CS/NLP domains — they crowd out real matches
  const skipStemMerge = ['cs_ai', 'nlp'].includes(normalizedDomain);
  const stemVenues = skipStemMerge ? [] : (venueCache['general_stem'] || []);
  
  const merged = new Map();
  [...stemVenues, ...domainVenues].forEach(v => merged.set(v.id, v));
  return Array.from(merged.values());
}

export async function discoverEliteVenuesFromQueries(searchQueries) {
  try {
    logger.info(`[VENUE-DISCOVERY] Dynamic discovery from ${searchQueries.length} LLM queries`);
    const venueMap = new Map();

    for (const query of searchQueries) {
      const topicIds = await getTopicsForQuery(query);
      logger.info(`[VENUE-DISCOVERY] Query "${query}" → topics: ${topicIds.join(', ')}`);

      for (const topicId of topicIds) {
        const venues = await getTopVenuesForTopic(topicId);
        venues.forEach(v => {
          if (!venueMap.has(v.id)) {
            venueMap.set(v.id, { ...v, isElite: true, reputation: 0.9 });
          } else {
            const existing = venueMap.get(v.id);
            existing.count += v.count;
            // Recalculate specificity with updated count
            existing.specificityScore = (existing.count / Math.log1p(existing.works_count)) * existing.count;
          }
        });
      }
    }

    const results = Array.from(venueMap.values())
      .sort((a, b) => b.specificityScore - a.specificityScore)
      .slice(0, 12);

    console.log('DYNAMIC ELITE VENUES FOUND:', results.length);
    logger.info(`[VENUE-DISCOVERY] Dynamic discovery found: ${results.map(v => v.name).join(', ')}`);
    return results;
  } catch (e) {
    logger.warn(`[VENUE-DISCOVERY] Dynamic discovery failed: ${e.message}`);
    return [];
  }
}

export function isCacheReady() { return cacheReady; }
