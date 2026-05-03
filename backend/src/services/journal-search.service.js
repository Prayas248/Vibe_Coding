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
   * Discovers relevant journals by searching for papers AND venues directly.
   * Ranks candidates by metadata-driven pre-ranking before full semantic scoring.
   */
  /**
   * Hybrid candidate generation: Merges OpenAlex discovery with curated elite venues.
   * Treats all candidates uniformly, delegating ranking to the existing scoring pipeline.
   */
  static async findJournalsByKeywords(keywords, abstractSnippet = '', abstractEmbedding = null, detectedDomain = '', analysis = null) {
    if (!keywords || keywords.length === 0) return [];

    try {
      logger.info(`Discovery: Generating LLM search queries for OpenAlex`);
      const searchQueries = await AiService.generateSearchQueries(abstractSnippet, detectedDomain);
      
      // Fix 2: Add neuroscience domain anchor query
      if (detectedDomain === 'neuroscience') {
        searchQueries.push("neuroscience brain plasticity");
        logger.info(`[DOMAIN-QUERY] Added neuroscience domain anchor query`);
      }

      const allWorks = [];
      await Promise.all(searchQueries.map(async (query) => {
        logger.info(`[SEARCH-QUERY] "${query}"`);
        const worksUrl = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per_page=50&select=primary_location,concepts,abstract_inverted_index`;
        try {
          const res = await fetchWithTimeout(worksUrl, { headers: { 'User-Agent': 'Vibe/1.0' } });
          if (!res.ok) {
            console.warn('[OPENALEX] Request failed:', res.status, res.statusText);
            logger.warn(`[OPENALEX] Request failed: ${res.status} ${res.statusText}`);
          } else {
            const data = await res.json();
            console.log('[OPENALEX] query results:', data.results?.length ?? 0);
            allWorks.push(...(data.results || []));
          }
        } catch (e) {
          console.error('[OPENALEX] Fetch error:', e.message);
          logger.error(`OpenAlex fetch failed for query "${query}": ${e.message}`);
        }
      }));

      const initialWorks = allWorks;
      
      const uniqueSourceIds = new Set();
      initialWorks.forEach(w => {
        const s = w.primary_location?.source;
        if (s && s.id) {
          uniqueSourceIds.add(s.id);
        }
      });
      
      console.log('[SEARCH] uniqueSourceIds.size:', uniqueSourceIds.size);
      logger.info(`[SEARCH-RESULTS] ${uniqueSourceIds.size} unique venues found across 3 queries`);
      
      if (uniqueSourceIds.size === 0) {
        if (detectedDomain === 'cs_ai' || detectedDomain === 'nlp') {
          logger.info(`[SEARCH-FAILED] Falling back to static cs_ai list for domain: ${detectedDomain}`);
          return [];
        }
        logger.info(`[SEARCH-FAILED] Search exhausted. Relying on dynamic discovery for domain: ${detectedDomain}`);
      }

      const directSources = [];

      // --- Unified Candidate Pool with Deduplication & Filtering ---
      const sourceMap = new Map();
      const nameToId = new Map();
      const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      const processCandidate = (s, curatedMeta = null) => {
        if (!s || !s.display_name) return;
        // Filter preprint servers (e.g. arXiv)
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

      // 1. Discover candidates from OpenAlex (Direct & Paper-anchored retrieval)
      directSources.forEach(s => processCandidate(s));
      initialWorks.forEach(w => {
        const s = w.primary_location?.source;
        if (s) processCandidate(s);
      });

      // 2. Decision-Aware Expansion Layer: Softly expand with elite venues if recommended by analysis
      const currentCandidates = Array.from(sourceMap.values());
      const hasHighRep = currentCandidates.some(c => {
        const hIndex = c.summary_stats?.h_index || 0;
        const rep = Math.min(0.98, Math.max(0.4, (hIndex / 120) * 0.55 + 0.43));
        return rep > 0.9;
      });

      const nonCSDomains = ['biology', 'neuroscience', 'medicine', 'chemistry', 'physics', 'general_stem'];
      const alwaysMergedDomains = ['neuroscience', 'cs_ai', 'nlp'];
      const isNonCSDomain = nonCSDomains.includes(detectedDomain);
      const expansionTriggered = isNonCSDomain || alwaysMergedDomains.includes(detectedDomain) || 
        (analysis?.venue_strategy?.recommended_tier === 'elite' && 
        (currentCandidates.length < 10 || !hasHighRep));
        
      logger.info(`[EXPANSION-CHECK] venue_strategy: ${analysis?.venue_strategy?.recommended_tier} | candidates.length: ${currentCandidates.length} | hasHighRep: ${hasHighRep} | isNonCSDomain: ${isNonCSDomain} | expansionTriggered: ${expansionTriggered}`);
      if (expansionTriggered) {
        logger.info(`[ELITE-DOMAIN-LOOKUP] Injecting pre-built cache for domain: ${detectedDomain}`);

        // Use ONLY the pre-built venue cache (computed at startup) — no live API calls
        const venuesToInject = getEliteVenuesForDomain(detectedDomain) || [];

        const seenIds = new Set();
        venuesToInject.forEach(v => {
          if (!seenIds.has(v.id)) {
            logger.info(`[ELITE-INJECT] ${v.name} | domain: ${detectedDomain}`);
            processCandidate({ id: v.id, display_name: v.name, type: v.venue_type }, { curated_reputation: v.reputation, isElite: true });
            seenIds.add(v.id);
          }
        });
      }

      // Enrich missing metadata for the unified pool
      const missingMetaIds = Array.from(sourceMap.keys()).filter(id => !sourceMap.get(id).works_count);
      if (missingMetaIds.length > 0) {
        const metaUrl = `https://api.openalex.org/sources?filter=openalex:${missingMetaIds.slice(0, 50).join('|')}&per_page=50&select=id,display_name,type,works_count,cited_by_count,x_concepts,summary_stats`;
        const res = await fetchWithTimeout(metaUrl, { headers: { 'User-Agent': 'Vibe/1.0' } });
        if (res.ok) {
          const data = await res.json();
          (data.results || []).forEach(s => processCandidate(s));
        }
      }

      // --- Unified Pre-ranking (No explicit elite bias) ---
      const keywordsSet = new Set(keywords.map(k => k.toLowerCase()));
      const candidates = Array.from(sourceMap.values()).filter(c => c.isElite || c.works_count);
      console.log('[SEARCH] after elite injection:', candidates.length);
      candidates.forEach(c => {
        logger.info(`[ELITE-FLAG-CHECK] ${c.display_name} → isElite: ${!!c.isElite} | id: ${c.id}`);
      });

      const maxWorks = Math.max(...candidates.map(c => c.works_count || 0), 1);
      const maxCites = Math.max(...candidates.map(c => c.cited_by_count || 0), 1);

      const ranked = candidates.map(c => {
        const worksN = Math.log10((c.works_count || 0) + 1) / Math.log10(maxWorks + 1);
        const citesN = Math.log10((c.cited_by_count || 0) + 1) / Math.log10(maxCites + 1);
        const overlap = (c.x_concepts || []).filter(con => keywordsSet.has(con.display_name?.toLowerCase())).length;
        const overlapScore = overlap / Math.max(keywords.length, 1);

        const preRank = (worksN * 0.25) + (citesN * 0.25) + (overlapScore * 0.5);

        const hIndex = c.summary_stats?.h_index || 0;
        const dataReputation = Math.min(0.98, Math.max(0.4, (hIndex / 120) * 0.55 + 0.43));
        const reputation = c.curated_reputation || dataReputation;

        return { ...c, preRank, reputation };
      }).sort((a, b) => b.preRank - a.preRank);

      // Uniform candidate selection for final semantic scoring
      const topSet = ranked.slice(0, 30);
      const topIds = new Set(topSet.map(c => toShortId(c.id)));

      // Synchronize work pool
      let finalWorks = initialWorks.filter(w => w.primary_location?.source?.id && topIds.has(toShortId(w.primary_location.source.id)));
      const counts = {};
      finalWorks.forEach(w => { const id = toShortId(w.primary_location.source.id); counts[id] = (counts[id] || 0) + 1; });

      const sparseIds = topSet.filter(c => (counts[toShortId(c.id)] || 0) < 5).map(c => toShortId(c.id));
      if (sparseIds.length > 0) {
        const batchUrl = `https://api.openalex.org/works?filter=primary_location.source.id:${sparseIds.slice(0, 15).join('|')}&per_page=50&select=primary_location,concepts,abstract_inverted_index`;
        const res = await fetchWithTimeout(batchUrl, { headers: { 'User-Agent': 'Vibe/1.0' } });
        if (res.ok) {
          const data = await res.json();
          finalWorks.push(...(data.results || []));
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
          const venue = topSet.find(v => v.id === sid);
          journalStats[sid] = { count: 0, sims: [], concepts: new Set() };
          journalMetadata[sid] = {
            name: venue.display_name,
            id: sid,
            reputation: venue.reputation,
            venue_type: venue.type,
            isElite: venue.isElite
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
        const baseSimilarity = (sims[0] * 0.75) + (top3Avg * 0.25);

        const relevanceScore = (stats.count * 0.01) + ScoringService.computeFinalScore(baseSimilarity, analysis, meta, scoringState);

        return { ...meta, frequency: stats.count, relevanceScore };
      }).sort((a, b) => b.relevanceScore - a.relevanceScore);

      logger.info(`[TOP10-SELECTION] ${Math.min(allOpenAlexCandidates.length, 10)} venues selected from ${allOpenAlexCandidates.length} OpenAlex results`);
      const openAlexTop10 = allOpenAlexCandidates.slice(0, 10);

      const finalVenuesMap = new Map();
      openAlexTop10.forEach(v => {
        const shortId = toShortId(v.id);
        finalVenuesMap.set(shortId, { ...v, id: shortId });
      });

      const eliteCandidates = candidates.filter(c => c.isElite);
      let addedEliteCount = 0;

      eliteCandidates.forEach(c => {
        const shortId = toShortId(c.id);
        if (!finalVenuesMap.has(shortId)) {
          finalVenuesMap.set(shortId, {
            name: c.display_name,
            id: shortId,
            reputation: c.curated_reputation || c.reputation || 0.95,
            venue_type: c.type,
            isElite: true,
            scope: "Elite curated venue",
            type: "general",
            profile_vector: JournalSearchService.buildProfileVector("general", []),
            frequency: 0,
            relevanceScore: 0
          });
          addedEliteCount++;
        } else {
          const existing = finalVenuesMap.get(shortId);
          finalVenuesMap.set(shortId, { ...existing, isElite: true });
        }
      });

      const finalCandidates = Array.from(finalVenuesMap.values());
      logger.info(`[PRE-FINAL] OpenAlex candidates: ${openAlexTop10.length} | Elite venues for domain ${detectedDomain}: ${addedEliteCount}`);
      logger.info(`[FINAL-CANDIDATES] ${finalCandidates.length} venues passed to controller (${openAlexTop10.length} from OpenAlex + ${addedEliteCount} elite)`);
      
      return finalCandidates;

    } catch (error) {
      logger.error(`Journal discovery pipeline failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Builds a semantic representation of a journal using its recent abstracts and official topics.
   * Implements a recency window (3 years, falling back to 5 years) to ensure temporal relevance.
   */
  static async getJournalRepresentation(journalId, venueName = 'Unknown Venue') {
    const now = new Date();
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(now.getFullYear() - 3);
    const threeYearsAgoStr = threeYearsAgo.toISOString().split('T')[0];

    const fetchWorks = async (fromDate) => {
      const url = `https://api.openalex.org/works?filter=primary_location.source.id:${journalId},from_publication_date:${fromDate}&per_page=6&select=abstract_inverted_index,topics`;
      const response = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Vibe/1.0' } });
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

        const url = `https://api.openalex.org/works?filter=primary_location.source.id:${shortId}&sort=publication_date:desc&per_page=6&select=abstract_inverted_index,topics`;
        logger.info(`[ELITE-FETCH-URL] ${url}`);
        const response = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Vibe/1.0' } });
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

          logger.warn(`Venue "${venueName}" (${journalId}) had sparse recent coverage (less than 4 papers in 3 years). Falling back to 5-year window.`);
          data = await fetchWorks(fiveYearsAgoStr);
          results = data.results || [];
        }
      }

      if (results.length < 4) {
        if (isElite) {
          logger.info(`[ELITE-THIN-CENTROID] ${venueName} — building centroid from ${results.length} papers`);
        } else {
          logger.info(`Venue "${venueName}" flagged as sparseData due to insufficient papers in 5-year window.`);
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
