import logger from '../config/logger.js';
import { reconstructAbstract } from '../utils/openAlexUtils.js';

import { AiService } from './ai.service.js';
import { EmbeddingService } from './embedding.service.js';

// Shared helper: fetch with a 10-second timeout to prevent hanging OpenAlex calls
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}
import { ScoringService } from './scoring.service.js';
import { ELITE_VENUES } from '../data/elite-venues.js';
import { getEliteVenuesForDomain, discoverEliteVenuesFromQueries } from './venue-discovery.service.js';

const OA_HEADERS = { 'User-Agent': 'Orbis/1.0' };

const toShortId = (id) => {
  if (!id) return id;
  return id.replace('https://openalex.org/', '');
};

export class JournalSearchService {
  static inferJournalType(concepts) {
    const text = concepts.join(' ').toLowerCase();
    if (text.includes('theory') || text.includes('theoretical') || text.includes('math')) return 'theoretical';
    if (text.includes('applied') || text.includes('application') || text.includes('system') || text.includes('engineering')) return 'applied';
    return 'general';
  }

  static buildProfileVector(type, concepts) {
    const text = concepts.join(' ').toLowerCase();
    const raw = {
      architecture: text.includes('architecture') || text.includes('network') || text.includes('model') ? 0.8 : 0.2,
      theory: type === 'theoretical' ? 0.9 : (text.includes('theorem') || text.includes('proof') ? 0.6 : 0.2),
      application: type === 'applied' ? 0.9 : (text.includes('applied') || text.includes('system') ? 0.6 : 0.2),
      benchmarking: text.includes('benchmark') || text.includes('evaluation') || text.includes('dataset') ? 0.7 : 0.2
    };
    const norm = Math.sqrt(Object.values(raw).reduce((s, v) => s + v * v, 0)) || 1;
    return { architecture: raw.architecture / norm, theory: raw.theory / norm, application: raw.application / norm, benchmarking: raw.benchmarking / norm };
  }

  /**
   * Hybrid candidate generation: Multi-strategy OpenAlex search + curated elite venues.
   * 
   * Strategy 1: Paper-anchored search (works endpoint) — finds venues that publish related papers
   * Strategy 2: Direct source search (sources endpoint) — finds venues by name/topic
   * Strategy 3: Citation-chain search — finds venues that cite or are cited by top papers  
   * Strategy 4: Elite venue injection — ensures domain-specific top venues are always considered
   */
  static async findJournalsByKeywords(keywords, abstractSnippet = '', abstractEmbedding = null, detectedDomain = '', analysis = null) {
    if (!keywords || keywords.length === 0) return [];

    try {
      logger.info(`Discovery: Generating LLM search queries for OpenAlex`);
      const searchQueries = await AiService.generateSearchQueries(abstractSnippet, detectedDomain);
      
      // Add domain anchor queries for better coverage
      const DOMAIN_ANCHORS = {
        neuroscience: ["neuroscience brain plasticity"],
        nlp: ["natural language processing computational linguistics", "machine translation language model"],
        cs_ai: ["deep learning neural network architecture", "machine learning optimization"],
        biology: ["molecular biology gene expression"],
        medicine: ["clinical trial treatment outcomes"],
        chemistry: ["chemical synthesis catalysis reaction"],
        physics: ["quantum mechanics condensed matter"]
      };
      const anchors = DOMAIN_ANCHORS[detectedDomain] || [];
      anchors.forEach(q => {
        searchQueries.push(q);
        logger.info(`[DOMAIN-QUERY] Added domain anchor: "${q}"`);
      });

      // Also add a direct abstract-based search (OpenAlex works great with natural language)
      const abstractFirstTwo = abstractSnippet.split(/[.!?]/).filter(s => s.trim().length > 20).slice(0, 2).join('. ').slice(0, 200);
      if (abstractFirstTwo.length > 40) {
        searchQueries.push(abstractFirstTwo);
        logger.info(`[DOMAIN-QUERY] Added abstract-as-query for broader coverage`);
      }

      // --- Strategy 1: Paper-anchored search (fetch highly-cited papers matching queries) ---
      const allWorks = [];
      await Promise.all(searchQueries.map(async (query) => {
        logger.info(`[SEARCH-QUERY] "${query}"`);
        // Sort by cited_by_count to find the most impactful papers (which are published in top venues)
        const worksUrl = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&sort=cited_by_count:desc&per_page=50&select=primary_location,concepts,abstract_inverted_index,cited_by_count,referenced_works`;
        try {
          const res = await fetchWithTimeout(worksUrl, { headers: OA_HEADERS });
          if (!res.ok) {
            logger.warn(`[OPENALEX] Request failed: ${res.status} ${res.statusText}`);
          } else {
            const data = await res.json();
            console.log('[OPENALEX] query results:', data.results?.length ?? 0);
            allWorks.push(...(data.results || []));
          }
        } catch (e) {
          logger.error(`OpenAlex fetch failed for query "${query}": ${e.message}`);
        }
      }));

      // --- Strategy 2 + 3: Run source search and citation-chain in PARALLEL ---
      const sourceSearchResults = [];
      const sourceQueries = new Set();
      if (keywords[0]) sourceQueries.add(keywords[0]);
      if (keywords[1]) sourceQueries.add(keywords[1]);
      sourceQueries.add(keywords.slice(0, 3).join(' '));
      const domainSourceTerms = {
        nlp: 'computational linguistics language',
        cs_ai: 'artificial intelligence machine learning',
        neuroscience: 'neuroscience brain',
        biology: 'biology cell molecular',
        medicine: 'medicine clinical',
        chemistry: 'chemistry chemical',
        physics: 'physics'
      };
      if (domainSourceTerms[detectedDomain]) {
        sourceQueries.add(domainSourceTerms[detectedDomain]);
      }

      // Run all source searches + citation chain concurrently
      const sourceSearchPromise = Promise.all(
        [...sourceQueries].filter(t => t.length >= 5).map(async (searchTerm) => {
          try {
            const sourcesUrl = `https://api.openalex.org/sources?search=${encodeURIComponent(searchTerm)}&per_page=10&select=id,display_name,type,works_count,cited_by_count,x_concepts,summary_stats`;
            const srcRes = await fetchWithTimeout(sourcesUrl, { headers: OA_HEADERS });
            if (srcRes.ok) {
              const srcData = await srcRes.json();
              const validSources = (srcData.results || []).filter(s => 
                (s.type === 'journal' || s.type === 'conference') && s.works_count > 50
              );
              logger.info(`[SOURCE-SEARCH] "${searchTerm}" → ${validSources.length} venues`);
              return validSources;
            }
          } catch (e) {
            logger.warn(`[SOURCE-SEARCH] Failed for "${searchTerm}": ${e.message}`);
          }
          return [];
        })
      );

      const citationChainPromise = (async () => {
        const topCitedWorks = [...allWorks]
          .filter(w => w.cited_by_count > 50 && w.referenced_works?.length > 0)
          .sort((a, b) => (b.cited_by_count || 0) - (a.cited_by_count || 0))
          .slice(0, 3);
        
        if (topCitedWorks.length === 0) return [];
        
        const refIds = new Set();
        topCitedWorks.forEach(w => {
          (w.referenced_works || []).slice(0, 8).forEach(ref => {
            refIds.add(ref.replace('https://openalex.org/', ''));
          });
        });
        const refIdList = [...refIds].slice(0, 30);
        
        if (refIdList.length === 0) return [];
        try {
          const refUrl = `https://api.openalex.org/works?filter=openalex:${refIdList.join('|')}&per_page=30&select=primary_location,concepts,cited_by_count`;
          const refRes = await fetchWithTimeout(refUrl, { headers: OA_HEADERS });
          if (refRes.ok) {
            const refData = await refRes.json();
            logger.info(`[CITATION-CHAIN] Found ${refData.results?.length || 0} referenced works`);
            return refData.results || [];
          }
        } catch (e) {
          logger.warn(`[CITATION-CHAIN] Failed: ${e.message}`);
        }
        return [];
      })();

      // Await both in parallel
      const [sourceResults, citationWorks] = await Promise.all([sourceSearchPromise, citationChainPromise]);
      sourceResults.forEach(arr => sourceSearchResults.push(...arr));
      allWorks.push(...citationWorks);

      const initialWorks = allWorks;
      
      const uniqueSourceIds = new Set();
      initialWorks.forEach(w => {
        const s = w.primary_location?.source;
        if (s && s.id) {
          uniqueSourceIds.add(s.id);
        }
      });
      
      console.log('[SEARCH] uniqueSourceIds.size:', uniqueSourceIds.size);
      logger.info(`[SEARCH-RESULTS] ${uniqueSourceIds.size} unique venues found across ${searchQueries.length} queries`);
      
      if (uniqueSourceIds.size === 0) {
        if (detectedDomain === 'cs_ai' || detectedDomain === 'nlp') {
          logger.info(`[SEARCH-FAILED] Falling back to static cs_ai list for domain: ${detectedDomain}`);
          return [];
        }
        logger.info(`[SEARCH-FAILED] Search exhausted. Relying on dynamic discovery for domain: ${detectedDomain}`);
      }

      // --- Unified Candidate Pool with Deduplication & Filtering ---
      const sourceMap = new Map();
      const nameToId = new Map();
      const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      // Track how many papers each venue has in our search results (frequency signal)
      const venueWorkCount = {};

      const processCandidate = (s, curatedMeta = null) => {
        if (!s || !s.display_name) return;
        // Filter preprint servers and repositories
        if (s.type === 'repository' || s.display_name.toLowerCase().includes('arxiv')) return;

        let id = s.id || curatedMeta?.id;
        const shortId = toShortId(id);

        const normName = normalize(s.display_name);

        const existingId = shortId ? shortId : nameToId.get(normName);
        if (existingId && sourceMap.has(existingId)) {
          const existing = sourceMap.get(existingId);
          const isElite = existing.isElite === true || curatedMeta?.isElite === true || s.isElite === true;
          sourceMap.set(existingId, { ...existing, ...s, ...curatedMeta, id: existingId, isElite });
        } else if (shortId) {
          sourceMap.set(shortId, { ...s, ...curatedMeta, id: shortId });
          if (normName) nameToId.set(normName, shortId);
        }
      };

      // 1. Discover candidates from paper-anchored search
      initialWorks.forEach(w => {
        const s = w.primary_location?.source;
        if (s) {
          processCandidate(s);
          const sid = toShortId(s.id);
          if (sid) venueWorkCount[sid] = (venueWorkCount[sid] || 0) + 1;
        }
      });

      // 1b. Inject results from direct source/venue search (deduplicated)
      const sourceDedup = new Map();
      sourceSearchResults.forEach(s => {
        const sid = toShortId(s.id);
        if (sid && !sourceDedup.has(sid)) {
          sourceDedup.set(sid, s);
          processCandidate(s);
        }
      });
      logger.info(`[SOURCE-INJECT] Added ${sourceDedup.size} unique venues from direct source search`);

      // 2. Always inject elite venues for the detected domain
      logger.info(`[ELITE-DOMAIN-LOOKUP] Injecting pre-built cache for domain: ${detectedDomain}`);
      const venuesToInject = getEliteVenuesForDomain(detectedDomain) || [];
      const seenEliteIds = new Set();
      venuesToInject.forEach(v => {
        if (!seenEliteIds.has(v.id)) {
          logger.info(`[ELITE-INJECT] ${v.name} | domain: ${detectedDomain}`);
          processCandidate({ id: v.id, display_name: v.name, type: v.venue_type }, { curated_reputation: v.reputation, isElite: true });
          seenEliteIds.add(v.id);
        }
      });

      // Enrich missing metadata for the unified pool (single batch, parallel)
      const missingMetaIds = Array.from(sourceMap.keys()).filter(id => !sourceMap.get(id).works_count);
      if (missingMetaIds.length > 0) {
        const metaUrl = `https://api.openalex.org/sources?filter=openalex:${missingMetaIds.slice(0, 50).join('|')}&per_page=50&select=id,display_name,type,works_count,cited_by_count,x_concepts,summary_stats`;
        try {
          const res = await fetchWithTimeout(metaUrl, { headers: OA_HEADERS });
          if (res.ok) {
            const data = await res.json();
            (data.results || []).forEach(s => processCandidate(s));
          }
        } catch (e) {
          logger.warn(`[META-FETCH] Failed: ${e.message}`);
        }
      }

      // --- Improved Pre-ranking ---
      // Key insight: use FREQUENCY (how often a venue appears in search results) as the primary signal.
      // A venue that appears in multiple different search queries is more likely to be topically relevant.
      // Also use h-index and concept overlap, but DOWN-weight raw works_count/cited_by_count 
      // which just measure journal SIZE, not relevance.
      const keywordsSet = new Set(keywords.map(k => k.toLowerCase()));
      const candidates = Array.from(sourceMap.values()).filter(c => c.isElite || c.works_count);
      console.log('[SEARCH] after elite injection:', candidates.length);

      const maxFreq = Math.max(...candidates.map(c => venueWorkCount[toShortId(c.id)] || 0), 1);

      const ranked = candidates.map(c => {
        const shortId = toShortId(c.id);
        const freq = venueWorkCount[shortId] || 0;
        const freqN = freq / maxFreq; // How often this venue appeared in search results
        
        // Concept overlap with paper keywords
        const overlap = (c.x_concepts || []).filter(con => keywordsSet.has(con.display_name?.toLowerCase())).length;
        const overlapScore = Math.min(1, overlap / Math.max(keywords.length, 1));

        // h-index as quality signal (normalized)
        const hIndex = c.summary_stats?.h_index || 0;
        const hIndexN = Math.min(1, hIndex / 200); // 200 is a very high h-index

        // Elite venues get a floor boost to ensure they're always in the pre-rank top set
        const eliteBoost = c.isElite ? 0.3 : 0;

        // Pre-rank: 40% search frequency, 30% concept overlap, 20% h-index, 10% elite
        const preRank = (freqN * 0.40) + (overlapScore * 0.30) + (hIndexN * 0.20) + eliteBoost;

        const dataReputation = Math.min(0.98, Math.max(0.4, (hIndex / 120) * 0.55 + 0.43));
        const reputation = c.curated_reputation || dataReputation;

        return { ...c, preRank, reputation, searchFrequency: freq };
      }).sort((a, b) => b.preRank - a.preRank);

      // Log top 15 pre-ranked for debugging
      ranked.slice(0, 15).forEach((c, i) => {
        logger.info(`[PRE-RANK #${i + 1}] ${c.display_name} | freq: ${c.searchFrequency} | preRank: ${c.preRank.toFixed(3)} | elite: ${!!c.isElite}`);
      });

      // Select top candidates — ensure ALL elite venues make it through
      const topSet = [];
      const topIds = new Set();
      const eliteIds = new Set();

      // First: all elite venues are guaranteed slots
      ranked.filter(c => c.isElite).forEach(c => {
        const sid = toShortId(c.id);
        if (!topIds.has(sid)) {
          topSet.push(c);
          topIds.add(sid);
          eliteIds.add(sid);
        }
      });

      // Then: fill remaining slots from pre-ranked list (up to 25 total)
      ranked.forEach(c => {
        if (topSet.length >= 25) return;
        const sid = toShortId(c.id);
        if (!topIds.has(sid)) {
          topSet.push(c);
          topIds.add(sid);
        }
      });

      logger.info(`[TOP-SET] ${topSet.length} venues selected (${eliteIds.size} elite + ${topSet.length - eliteIds.size} discovered)`);

      // Synchronize work pool — fetch additional papers for sparse venues
      let finalWorks = initialWorks.filter(w => w.primary_location?.source?.id && topIds.has(toShortId(w.primary_location.source.id)));
      const counts = {};
      finalWorks.forEach(w => { const id = toShortId(w.primary_location.source.id); counts[id] = (counts[id] || 0) + 1; });

      // Fetch more papers for venues with < 5 papers — single parallel batch
      const sparseIds = topSet.filter(c => (counts[toShortId(c.id)] || 0) < 5).map(c => toShortId(c.id));
      if (sparseIds.length > 0) {
        // Single batch fetch — limit to 50 papers total to stay fast
        const batchUrl = `https://api.openalex.org/works?filter=primary_location.source.id:${sparseIds.slice(0, 20).join('|')}&sort=cited_by_count:desc&per_page=50&select=primary_location,concepts,abstract_inverted_index`;
        try {
          const res = await fetchWithTimeout(batchUrl, { headers: OA_HEADERS });
          if (res.ok) {
            const data = await res.json();
            finalWorks.push(...(data.results || []));
            logger.info(`[SPARSE-FILL] Fetched ${data.results?.length || 0} papers for ${Math.min(20, sparseIds.length)} sparse venues`);
          }
        } catch (e) {
          logger.warn(`[SPARSE-FILL] Failed: ${e.message}`);
        }
      }

      const journalStats = {};
      const journalMetadata = {};

      // Filter and reconstruct abstracts first
      const validWorks = finalWorks.map(work => {
        const sid = toShortId(work.primary_location?.source?.id);
        if (!sid || !topIds.has(sid)) return null;
        let text = null;
        if (abstractEmbedding && work.abstract_inverted_index) {
          text = reconstructAbstract(work.abstract_inverted_index);
        }
        return { work, sid, text };
      }).filter(Boolean);

      // Compute all embeddings in parallel
      const embeddingsList = await Promise.all(
        validWorks.map(async ({ text }) => {
          if (text && text.length > 50) {
            return await EmbeddingService.getEmbedding(text);
          }
          return null;
        })
      );

      // Aggregate stats
      for (let i = 0; i < validWorks.length; i++) {
        const { work, sid } = validWorks[i];
        const workEmb = embeddingsList[i];
        let similarity = 0;

        if (workEmb) {
          let dot = 0, nA = 0, nB = 0;
          for (let j = 0; j < workEmb.length; j++) {
            dot += workEmb[j] * abstractEmbedding[j];
            nA += workEmb[j] * workEmb[j];
            nB += abstractEmbedding[j] * abstractEmbedding[j];
          }
          if (nA > 0 && nB > 0) similarity = dot / (Math.sqrt(nA) * Math.sqrt(nB));
        }

        if (!journalStats[sid]) {
          const venue = topSet.find(v => toShortId(v.id) === sid);
          if (!venue) continue;
          journalStats[sid] = { count: 0, sims: [], concepts: new Set() };
          journalMetadata[sid] = {
            name: venue.display_name,
            id: sid,
            reputation: venue.reputation,
            venue_type: venue.type,
            isElite: venue.isElite,
            works_count: venue.works_count,
            cited_by_count: venue.cited_by_count
          };
        }
        (work.concepts || []).forEach(c => { if (c.display_name) journalStats[sid].concepts.add(c.display_name); });
        journalStats[sid].count++;
        if (similarity > 0) journalStats[sid].sims.push(similarity);
      }

      const scoringState = {};
      logger.info(`[JOURNAL-STATS] ${Object.keys(journalStats).length} venues in journalStats`);
      const allOpenAlexCandidates = Object.keys(journalStats).map(id => {
        const stats = journalStats[id];
        const concepts = Array.from(stats.concepts);
        const meta = journalMetadata[id];

        meta.scope = concepts.slice(0, 5).join(', ');
        meta.type = JournalSearchService.inferJournalType(concepts);
        meta.profile_vector = JournalSearchService.buildProfileVector(meta.type, concepts);

        const sims = stats.sims.sort((a, b) => b - a);
        const top3Avg = sims.slice(0, 3).reduce((a, b, _, arr) => a + b / arr.length, 0) || 0;
        // Weighted: top paper matters most, but consistency matters too
        const baseSimilarity = sims.length > 0 ? (sims[0] * 0.6) + (top3Avg * 0.4) : 0;

        const relevanceScore = (stats.count * 0.005) + ScoringService.computeFinalScore(baseSimilarity, analysis, meta, scoringState);

        return { ...meta, frequency: stats.count, relevanceScore };
      }).sort((a, b) => b.relevanceScore - a.relevanceScore);

      // Log top candidates
      allOpenAlexCandidates.slice(0, 15).forEach((c, i) => {
        logger.info(`[DISCOVERY-RANK #${i + 1}] ${c.name} | score: ${c.relevanceScore.toFixed(4)} | freq: ${c.frequency} | elite: ${!!c.isElite}`);
      });

      logger.info(`[TOP-SELECTION] Selecting from ${allOpenAlexCandidates.length} OpenAlex results`);
      const openAlexTop = allOpenAlexCandidates.slice(0, 15);

      const finalVenuesMap = new Map();
      openAlexTop.forEach(v => {
        const shortId = toShortId(v.id);
        finalVenuesMap.set(shortId, { ...v, id: shortId });
      });

      // Ensure ALL elite venues are included — they'll be properly evaluated during enrichment
      const eliteCandidates = candidates.filter(c => c.isElite);
      let addedEliteCount = 0;

      eliteCandidates.forEach(c => {
        const shortId = toShortId(c.id);
        if (!finalVenuesMap.has(shortId)) {
          const stats = journalStats[shortId];
          const concepts = stats ? Array.from(stats.concepts) : [];
          finalVenuesMap.set(shortId, {
            name: c.display_name,
            id: shortId,
            reputation: c.curated_reputation || c.reputation || 0.95,
            venue_type: c.type,
            isElite: true,
            works_count: c.works_count,
            cited_by_count: c.cited_by_count,
            scope: concepts.slice(0, 5).join(', ') || "Elite curated venue",
            type: JournalSearchService.inferJournalType(concepts),
            profile_vector: JournalSearchService.buildProfileVector("general", concepts),
            frequency: stats?.count || 0,
            relevanceScore: 0
          });
          addedEliteCount++;
        } else {
          const existing = finalVenuesMap.get(shortId);
          finalVenuesMap.set(shortId, { ...existing, isElite: true });
        }
      });

      const finalCandidates = Array.from(finalVenuesMap.values());
      logger.info(`[PRE-FINAL] OpenAlex candidates: ${openAlexTop.length} | Elite venues added: ${addedEliteCount}`);
      logger.info(`[FINAL-CANDIDATES] ${finalCandidates.length} venues passed to controller`);
      
      return finalCandidates;

    } catch (error) {
      logger.error(`Journal discovery pipeline failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Builds a semantic representation of a journal using its recent abstracts and official topics.
   * Fetches MORE papers (up to 20) for better centroid quality and sorts by citations.
   */
  static async getJournalRepresentation(journalId, venueName = 'Unknown Venue') {
    const now = new Date();
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(now.getFullYear() - 3);
    const threeYearsAgoStr = threeYearsAgo.toISOString().split('T')[0];

    const fetchWorks = async (fromDate, perPage = 8) => {
      const url = `https://api.openalex.org/works?filter=primary_location.source.id:${journalId},from_publication_date:${fromDate}&sort=cited_by_count:desc&per_page=${perPage}&select=abstract_inverted_index,topics`;
      const response = await fetchWithTimeout(url, { headers: OA_HEADERS });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    };

    try {
      let isElite = false;
      for (const key of Object.keys(ELITE_VENUES)) {
        if (ELITE_VENUES[key].some(v => v.id === journalId || v.id === `https://openalex.org/${journalId}`)) {
          isElite = true;
          break;
        }
      }

      let data;
      let results = [];

      if (isElite) {
        const shortId = journalId.startsWith('https://')
          ? journalId.replace('https://openalex.org/', '')
          : journalId;

        // For elite venues, fetch top 10 papers (scoring only uses top 8 anyway)
        const url = `https://api.openalex.org/works?filter=primary_location.source.id:${shortId}&sort=cited_by_count:desc&per_page=10&select=abstract_inverted_index,topics`;
        logger.info(`[ELITE-FETCH-URL] ${url}`);
        const response = await fetchWithTimeout(url, { headers: OA_HEADERS });
        const rawText = await response.text();
        logger.info(`[ELITE-RAW-RESPONSE] ${venueName} → status: ${response.status} | body: ${rawText.slice(0, 300)}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${rawText.slice(0, 100)}`);
        data = JSON.parse(rawText);
        results = data.results || [];
      } else {
        data = await fetchWorks(threeYearsAgoStr);
        results = data.results || [];

        if (results.length < 4) {
          const fiveYearsAgo = new Date();
          fiveYearsAgo.setFullYear(now.getFullYear() - 5);
          const fiveYearsAgoStr = fiveYearsAgo.toISOString().split('T')[0];

          logger.warn(`Venue "${venueName}" (${journalId}) had sparse recent coverage. Falling back to 5-year window.`);
          data = await fetchWorks(fiveYearsAgoStr);
          results = data.results || [];
        }
      }

      if (results.length < 4) {
        if (isElite) {
          logger.info(`[ELITE-THIN-CENTROID] ${venueName} — building centroid from ${results.length} papers`);
        } else {
          logger.info(`Venue "${venueName}" flagged as sparseData due to insufficient papers.`);
          return { sparseData: true };
        }
      }

      let aggregatedText = "";
      const topics = new Set();

      for (const work of results) {
        const abstract = reconstructAbstract(work.abstract_inverted_index);
        if (abstract) aggregatedText += abstract + " ";
        if (work.topics) {
          work.topics.forEach(t => {
            topics.add(t.display_name);
            if (t.subfield) topics.add(t.subfield.display_name);
            if (t.field) topics.add(t.field.display_name);
          });
        }
      }

      const keywords = Array.from(topics).slice(0, 15);
      return {
        abstracts: results.map(work => reconstructAbstract(work.abstract_inverted_index)).filter(Boolean),
        scope: aggregatedText.substring(0, 500).trim() || "Academic venue focusing on research in this field.",
        keywords: keywords.length > 0 ? keywords : ["research", "academic"],
        domain: keywords[0] || "General Science",
        sparseData: false
      };
    } catch (error) {
      logger.error(`Journal representation failed for ${venueName} (${journalId}): ${error.message}`);
      return null;
    }
  }
}
