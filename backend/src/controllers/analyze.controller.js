import { PdfService } from '../services/pdf.service.js';
import { AiService } from '../services/ai.service.js';
import { EmbeddingService } from '../services/embedding.service.js';
import { ScoringService } from '../services/scoring.service.js';
import { JournalSearchService } from '../services/journal-search.service.js';
import { AnalysisService } from '../services/analysis.service.js';
import { getEliteVenuesForDomain } from '../services/venue-discovery.service.js';
import { extractKeywordsLocal } from '../utils/keywordExtractor.js';
import logger from '../config/logger.js';

export const analyzePaper = async (req, res, next) => {
  try {
    console.log('[CONTROLLER] entered');
    const startTime = Date.now();
    const timings = {};

    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    // --- Step 1: Parsing & Feature Extraction ---
    let t0 = Date.now();
    let abstract, abstractSource;
    try {
      const result = await PdfService.extractAbstract(req.file.buffer);
      abstract = result.abstract;
      abstractSource = result.source;
      console.log('[STEP1 PDF] abstract length:', abstract?.length ?? 'NULL');
      console.log('[STEP1 PDF] preview:', abstract?.slice(0, 150));
    } catch (err) {
      console.error('[STEP1 PDF CRASH]', err.message);
      return res.status(400).json({ error: 'Failed to extract text from PDF. The file may be scanned or image-based.' });
    }

    if (!abstract || abstract.trim().length < 30) {
      console.error('[STEP1 PDF] Abstract too short or empty');
      return res.status(400).json({ error: 'Could not find abstract in this PDF.' });
    }
    
    timings.pdfExtraction = Date.now() - t0;
    logger.info(`Abstract extracted (Length: ${abstract.length}) via ${abstractSource}`);

    // --- Steps 2 + 2.5: AI extraction + embedding (parallel-safe), then analysis ---
    t0 = Date.now();
    // Run feature extraction and embedding in parallel (embedding is local, no API conflict)
    const [extractedFeatures, abstractEmbedding] = await Promise.all([
      AiService.extractFeatures(abstract).catch(err => {
        console.error('[STEP2 AI FEATURES]', err.message);
        throw err;
      }),
      EmbeddingService.getEmbedding(abstract).catch(err => {
        console.error('[STEP2 EMBEDDING]', err.message);
        throw err;
      })
    ]);
    // Run analysis AFTER feature extraction so they don't compete for Groq rate limits
    const analysis = await AnalysisService.analyzePaper(abstract).catch(err => {
      console.error('[STEP2 ANALYSIS]', err.message);
      // Analysis failure is non-fatal — use fallback
      return AnalysisService.getFallbackAnalysis();
    });
    timings.aiFeatures = Date.now() - t0;
    logger.info(`AI features + embedding + analysis completed in parallel: ${timings.aiFeatures}ms`);

    console.log('[PIPELINE] Step 2 complete');
    console.log('[PIPELINE] domain:', extractedFeatures.domain);
    console.log('[PIPELINE] keywords:', extractedFeatures.keywords);
    console.log('[PIPELINE] searchQueries:', extractedFeatures.searchQueries);
    console.log('[PIPELINE] impact_potential:', analysis.impact_potential);

    // --- Step 3: Advanced Journal Discovery (Papers -> Venues -> Abstracts) ---
    t0 = Date.now();
    // Use fast local keyword extraction for the initial OpenAlex search
    const searchKeywords = extractKeywordsLocal(abstract);
    // Extract first 2-3 sentences as a domain anchor for the structured query
    const abstractSnippet = abstract.split(/[.!?]/).filter(s => s.trim().length > 30).slice(0, 2).join('. ').trim();
    logger.info(`Local keywords for OpenAlex search: ${searchKeywords.join(', ')}`);

    let candidates;
    try {
      candidates = await JournalSearchService.findJournalsByKeywords(
        searchKeywords,
        abstractSnippet,
        abstractEmbedding,
        extractedFeatures.domain,
        analysis
      );
      console.log('[STEP3] candidates:', candidates.length);
    } catch (err) {
      console.error('[STEP3 CRASH]', err.message, err.stack);
      throw err;
    }

    // Note: Cross-domain and research-type filtering is now handled intelligently 
    // within ScoringService.computeJournalScores via scalable penalty multipliers 
    // (e.g., Domain Penalty, Clinical vs Analytical Penalty) rather than brittle keyword blocklists.

    timings.journalDiscovery = Date.now() - t0;
    console.log('[PIPELINE] Step 3 complete');
    console.log('[PIPELINE] raw candidates:', candidates.length);
    logger.info(`Discovered ${candidates.length} unique journals from OpenAlex paper search`);

    t0 = Date.now();
    let dynamicJournals = [];
    if (candidates.length > 0) {
      // Cap enrichment to top 15 candidates to save API calls and time
      const candidatesToEnrich = candidates.slice(0, 15);
      logger.info(`[ENRICHMENT] Enriching ${candidatesToEnrich.length} of ${candidates.length} candidates`);
      const enrichedCandidates = await Promise.all(candidatesToEnrich.map(async (candidate) => {
        const representation = await JournalSearchService.getJournalRepresentation(candidate.id, candidate.name);
        if (representation) {
          return {
            name: candidate.name,
            frequency: candidate.frequency,
            isElite: candidate.isElite,
            ...representation
          };
        }
        return null;
      }));

      // --- Robust Semantic Filtering Layer ---
      const activeCandidates = enrichedCandidates.filter(c => c && !c.sparseData);
      console.log('[PIPELINE] Step 3.7 complete');
      console.log('[PIPELINE] enriched journals:', activeCandidates.length);

      // Fix: When OpenAlex abstracts unavailable (budget exhausted), use domain venue cache directly
      if (activeCandidates.length === 0) {
        console.warn('[PIPELINE] No enriched candidates — injecting domain venue cache elites');
        // First priority: use domain-specific curated venue cache (ACL/EMNLP for nlp, Nature/Cell for biology, etc.)
        const cacheElites = getEliteVenuesForDomain(extractedFeatures.domain) || [];
        const eliteFallbacks = cacheElites.map(v => ({
          name: v.name,
          id: v.id,
          frequency: v.frequency || 1,
          isElite: true,
          scope: v.scope || `Leading academic venue for ${extractedFeatures.domain} research.`,
          keywords: v.keywords || [extractedFeatures.domain, 'high-impact scientific publication'],
          domain: extractedFeatures.domain,
          abstracts: [],
          sparseData: true,
        }));
        if (eliteFallbacks.length > 0) {
          dynamicJournals.push(...eliteFallbacks);
          console.log('[PIPELINE] domain cache elites injected:', eliteFallbacks.map(j => j.name));
        }
      }

      const journalScoringStats = [];
      let absoluteMaxSim = 0;

      // First pass: compute all similarities and find the global maximum
      for (const journal of activeCandidates) {
        let stat = { journal, maxSim: 0, topTwoAvg: 0 };
        if (journal.abstracts && journal.abstracts.length > 0) {
          const abstractEmbeddings = await Promise.all(
            journal.abstracts.map(text => EmbeddingService.getEmbedding(text))
          );

          const sims = abstractEmbeddings.map(emb => {
            let dot = 0, normA = 0, normB = 0;
            for (let i = 0; i < emb.length; i++) {
              dot += emb[i] * abstractEmbedding[i];
              normA += emb[i] * emb[i];
              normB += abstractEmbedding[i] * abstractEmbedding[i];
            }
            return (normA > 0 && normB > 0) ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
          }).sort((a, b) => b - a);

          stat.maxSim = sims[0] || 0;
          stat.topTwoAvg = (sims[0] + (sims[1] || sims[0])) / 2;

          if (stat.maxSim > absoluteMaxSim) absoluteMaxSim = stat.maxSim;
        }

        // [ELITE-SCORE-FLOOR] Prevent elite venues from sinking to bottom due to thin centroids
        if (stat.journal.isElite && (!stat.maxSim || stat.maxSim < 0.1)) {
          logger.info(`[ELITE-SCORE-FLOOR] ${stat.journal.name} — thin centroid detected, applying score floor`);
          stat.maxSim = 0.1;
        }

        journalScoringStats.push(stat);
      }

      // Second pass: apply simplified adaptive consistency thresholds
      // 1. Relative threshold: Keep if >= 60% of absolute best candidate (loosened from 0.1 gap)
      // 2. Consistency floor: Ensure the journal consistently publishes in this area
      // 3. Hard floor: Keep if Max similarity exceeds 0.35 regardless of other factors
      const ADAPTIVE_THRESHOLD = 0.60;
      const HARD_FLOOR = 0.35;
      const MIN_CONSISTENCY = 0.28;

      logger.info(`[ADAPTIVE-THRESHOLD] BestGlobal: ${absoluteMaxSim.toFixed(4)} | threshold: ${(absoluteMaxSim * ADAPTIVE_THRESHOLD).toFixed(4)}`);

      const filtered = journalScoringStats.filter(stat => {
        logger.info(`[FILTER-ENTRY] ${stat.journal.name} → isElite: ${!!stat.journal.isElite}`);
        // Fix 1: Elite venues bypass adaptive filter
        if (stat.journal.isElite) {
          // Elite venues bypass filter ONLY if they have at least minimal semantic signal
          // This prevents irrelevant elite venues (e.g. Cell for a toxicology paper) from forcing their way in
          let eliteMinSim = absoluteMaxSim * 0.30; // Must score at least 30% of best match
          
          // If the journal domain perfectly matches the extracted domain, lower the floor
          // to ensure core domain venues (like ACL for NLP) are never dropped due to thin centroids
          if (stat.journal.domain && extractedFeatures.domain) {
            const extMapped = extractedFeatures.domain === 'nlp' ? 'natural language processing' : 
                              extractedFeatures.domain === 'cs_ai' ? 'artificial intelligence' : extractedFeatures.domain;
            if (extMapped.toLowerCase() === stat.journal.domain.toLowerCase() || stat.journal.domain.toLowerCase().includes(extMapped.toLowerCase())) {
              eliteMinSim = absoluteMaxSim * 0.10; // Practically bypass the filter
            }
          }

          if (stat.maxSim >= eliteMinSim || stat.maxSim === 0) {
            logger.info(`[ELITE-BYPASS] ${stat.journal.name} — passed (sim: ${stat.maxSim.toFixed(3)}, floor: ${eliteMinSim.toFixed(3)})`);
            return true;
          }
          logger.info(`[ELITE-FILTER] ${stat.journal.name} — elite venue rejected (sim: ${stat.maxSim.toFixed(3)} below floor: ${eliteMinSim.toFixed(3)})`);
          return false;
        }

        // NEVER filter out the absolute best match found, even if it's weak
        const isBestMatch = stat.maxSim === absoluteMaxSim && absoluteMaxSim > 0;
        // Hard signal floor: Signal is strong enough to keep regardless of relative ranking
        const isAboveHardFloor = stat.maxSim > HARD_FLOOR;
        // Must be competitive with the best match found
        const isCompetitive = stat.maxSim >= (absoluteMaxSim * ADAPTIVE_THRESHOLD);
        // Must have consistent research focus (top-two average)
        const isConsistent = stat.topTwoAvg >= MIN_CONSISTENCY;

        const keep = isBestMatch || isAboveHardFloor || (isCompetitive && isConsistent);

        if (!keep && stat.journal.abstracts?.length > 0) {
          logger.info(`Discarding ${stat.journal.name} - Failed adaptive filter (Max: ${stat.maxSim.toFixed(2)}, Top2: ${stat.topTwoAvg.toFixed(2)}, BestGlobal: ${absoluteMaxSim.toFixed(2)})`);
        }
        return keep || !stat.journal.abstracts; // Keep fallbacks with no data
      }).map(stat => stat.journal);

      dynamicJournals.push(...filtered);
      console.log('[PIPELINE] Step 3.8 complete');
      console.log('[PIPELINE] after filter:', dynamicJournals.length);

      // Old blocklist removed (handled earlier by universal DOMAIN_BLOCKLISTS)

      // --- Cache Optimization for Discovered Venues ---
      await Promise.all(dynamicJournals.map(async (journal) => {
        const cacheKey = journal.id || journal.name;
        if (!ScoringService.isJournalCached(cacheKey)) {
          const journalText = `${journal.scope} ${journal.keywords.join(' ')}`;
          const embedding = await EmbeddingService.getEmbedding(journalText);
          ScoringService.cacheJournalEmbedding(cacheKey, embedding, journal.name);
        }
      }));
      timings.journalEnrichment = Date.now() - t0;
      logger.info(`Robust filtering retained ${dynamicJournals.length} journals (Best Global Sim: ${absoluteMaxSim.toFixed(2)})`);
    }

    // --- Step 4: Scoring, Explanation & Ranking ---
    t0 = Date.now();
    const scoredJournals = await ScoringService.computeJournalScores(
      abstractEmbedding,
      extractedFeatures,
      dynamicJournals,
      analysis
    );
    timings.scoring = Date.now() - t0;
    console.log('[PIPELINE] Step 4 complete');
    console.log('[PIPELINE] top 5:', scoredJournals.slice(0,5).map(j => j.name));

    const top5 = scoredJournals.slice(0, 5);

    if (top5.length === 0) {
      return res.json({
        features: {
          summary: (extractedFeatures.summary || '').replace('[Quota fallback] ', ''),
          domain: extractedFeatures.domain,
          keywords: extractedFeatures.keywords,
          abstractSource
        },
        readinessScore: {
          overall: 0,
          factors: {
            semanticFit: 0,
            domainAlignment: 0,
            contributionMatch: 0,
            riskPenalty: 0
          },
          acceptanceLevel: "No Matches",
          risks: ["No relevant academic venues found in OpenAlex search"],
          weaknesses: ["Keyword search returned candidates that failed semantic validation"],
          issues: ["No relevant academic venues found in OpenAlex search"],
          suggestions: ["Refine abstract or keywords to broaden search"]
        },
        topJournals: [],
        debug: { timings, totalTime: Date.now() - startTime }
      });
    }

    t0 = Date.now();
    const journalsWithExplanations = await AiService.generateExplanations(abstract, extractedFeatures, top5);
    timings.explanations = Date.now() - t0;

    const readinessScore = ScoringService.computeReadiness(top5[0], extractedFeatures, analysis);

    const totalTime = Date.now() - startTime;
    logger.info(`Full analysis pipeline completed in ${totalTime}ms`);

    const finalTopJournals = journalsWithExplanations.map(j => ({
      ...j,
      focusScore: j.focusScore != null ? Number(j.focusScore.toFixed(2)) : undefined
    }));

    // Temporary debug log for focus calibration
    finalTopJournals.forEach(j => {
      console.log(`[FOCUS-CHECK] ${j.name} → ${j.focusScore}`);
    });

    res.json({
      features: {
        summary: (extractedFeatures.summary || '').replace('[Quota fallback] ', ''),
        domain: extractedFeatures.domain,
        keywords: extractedFeatures.keywords,
        abstractSource
      },
      readinessScore,
      topJournals: finalTopJournals,
      debug: {
        timings,
        totalTime
      }
    });

  } catch (error) {
    console.error('[CONTROLLER CRASH]', error.message);
    console.error('[CONTROLLER STACK]', error.stack);
    logger.error(`Analysis failed: ${error.message}`);
    next(error);
  }
};
