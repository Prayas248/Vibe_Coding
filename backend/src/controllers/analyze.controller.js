import { PdfService } from '../services/pdf.service.js';
import { AiService } from '../services/ai.service.js';
import { EmbeddingService } from '../services/embedding.service.js';
import { ScoringService } from '../services/scoring.service.js';
import { JournalSearchService } from '../services/journal-search.service.js';
import { AnalysisService } from '../services/analysis.service.js';
import { VectorStoreService } from '../services/vector-store.service.js';
import { getEliteVenuesForDomain } from '../services/venue-discovery.service.js';
import { extractKeywordsLocal } from '../utils/keywordExtractor.js';
import { progressEmitter } from '../utils/progressEmitter.js';
import { HistoryService } from '../services/history.service.js';
import logger from '../config/logger.js';

export const analyzePaper = async (req, res, next) => {
  try {
    console.log('[CONTROLLER] entered');
    const startTime = Date.now();
    const timings = {};
    const sessionId = req.headers['x-session-id'] || null;

    const emitProgress = (step, message) => {
      if (sessionId) progressEmitter.send(sessionId, step, message);
    };

    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    // --- Step 1: Parsing & Feature Extraction ---
    emitProgress(1, 'Extracting text from your manuscript...');
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

    // --- Steps 2 + 2.5: AI extraction + embedding + analysis (all parallel) ---
    emitProgress(2, 'Analyzing research domain and methodology...');
    t0 = Date.now();
    // All three are independent: features=Gemini, embedding=local, analysis=Groq
    const [extractedFeatures, abstractEmbedding, analysis] = await Promise.all([
      AiService.extractFeatures(abstract).catch(err => {
        console.error('[STEP2 AI FEATURES]', err.message);
        throw err;
      }),
      EmbeddingService.getEmbedding(abstract).catch(err => {
        console.error('[STEP2 EMBEDDING]', err.message);
        throw err;
      }),
      AnalysisService.analyzePaper(abstract).catch(err => {
        console.error('[STEP2 ANALYSIS]', err.message);
        return AnalysisService.getFallbackAnalysis();
      })
    ]);
    timings.aiFeatures = Date.now() - t0;
    logger.info(`AI features + embedding + analysis completed in parallel: ${timings.aiFeatures}ms`);

    console.log('[PIPELINE] Step 2 complete');
    console.log('[PIPELINE] domain:', extractedFeatures.domain);
    console.log('[PIPELINE] keywords:', extractedFeatures.keywords);
    console.log('[PIPELINE] searchQueries:', extractedFeatures.searchQueries);
    console.log('[PIPELINE] impact_potential:', analysis.impact_potential);

    // --- Step 3: Hybrid Journal Discovery (Vector DB → OpenAlex fallback) ---
    emitProgress(3, 'Searching 3,000+ academic venues...');
    t0 = Date.now();
    let candidates;
    let discoveryMode = 'none';

    // Strategy A: Fast vector search from pre-built index
    if (VectorStoreService.isAvailable()) {
      const vectorResults = VectorStoreService.search(abstractEmbedding, {
        topK: 30,
        domain: extractedFeatures.domain,
      });
      logger.info(`[VECTOR-SEARCH] Found ${vectorResults.length} candidates in ${Date.now() - t0}ms`);

      if (vectorResults.length >= 5) {
        candidates = vectorResults;
        discoveryMode = 'vector';
        console.log('[PIPELINE] Using vector search (fast mode)');
      }
    }

    // Strategy B: Live OpenAlex discovery (fallback if no vector index or too few results)
    if (!candidates || candidates.length < 5) {
      console.log('[PIPELINE] Falling back to live OpenAlex discovery...');
      const searchKeywords = extractKeywordsLocal(abstract);
      const abstractSnippet = abstract.split(/[.!?]/).filter(s => s.trim().length > 30).slice(0, 2).join('. ').trim();
      logger.info(`Local keywords for OpenAlex search: ${searchKeywords.join(', ')}`);

      try {
        const liveResults = await JournalSearchService.findJournalsByKeywords(
          searchKeywords,
          abstractSnippet,
          abstractEmbedding,
          extractedFeatures.domain,
          analysis
        );
        // Merge with any vector results (vector results first, dedup by id)
        const seenIds = new Set((candidates || []).map(c => c.id));
        const merged = [...(candidates || [])];
        for (const r of liveResults) {
          if (!seenIds.has(r.id)) {
            merged.push(r);
            seenIds.add(r.id);
          }
        }
        candidates = merged;
        discoveryMode = candidates.length > 0 ? (discoveryMode === 'vector' ? 'hybrid' : 'openalex') : 'none';
        console.log('[STEP3] live candidates:', liveResults.length, '| merged total:', candidates.length);
      } catch (err) {
        console.error('[STEP3 CRASH]', err.message, err.stack);
        if (!candidates || candidates.length === 0) throw err;
        // If vector gave us some results, continue despite OpenAlex failure
        logger.warn(`[STEP3] OpenAlex failed but vector gave ${candidates.length} candidates, continuing...`);
      }
    }

    timings.journalDiscovery = Date.now() - t0;
    console.log(`[PIPELINE] Step 3 complete (mode: ${discoveryMode})`);
    console.log('[PIPELINE] raw candidates:', candidates?.length || 0);
    logger.info(`Discovered ${candidates?.length || 0} unique journals via ${discoveryMode}`);

    emitProgress(4, 'Enriching top candidates with publication data...');
    t0 = Date.now();
    let dynamicJournals = [];
    if (candidates && candidates.length > 0) {
      const eliteCandidates = candidates.filter(c => c.isElite);
      const nonEliteCandidates = candidates.filter(c => !c.isElite);
      const maxNonElite = Math.max(2, 15 - eliteCandidates.length);
      const candidatesToEnrich = [...eliteCandidates, ...nonEliteCandidates.slice(0, maxNonElite)];
      logger.info(`[ENRICHMENT] Enriching ${candidatesToEnrich.length} candidates (${eliteCandidates.length} elite + ${Math.min(maxNonElite, nonEliteCandidates.length)} discovered)`);

      // For vector-sourced candidates, fetch fresh paper abstracts for rich centroid scoring
      // For OpenAlex-sourced candidates, they already have enrichment data
      const enrichedCandidates = [];
      const CONCURRENCY = 10;
      for (let i = 0; i < candidatesToEnrich.length; i += CONCURRENCY) {
        const batch = candidatesToEnrich.slice(i, i + CONCURRENCY);
        const batchResults = await Promise.all(batch.map(async (candidate) => {
          // If candidate already has abstracts (from OpenAlex pipeline), skip enrichment
          if (candidate.abstracts && candidate.abstracts.length > 0) {
            return candidate;
          }
          // Fetch fresh paper data from OpenAlex for this venue
          const representation = await JournalSearchService.getJournalRepresentation(candidate.id, candidate.name);
          if (representation) {
            return {
              name: candidate.name,
              frequency: candidate.frequency || 1,
              isElite: candidate.isElite,
              works_count: candidate.works_count,
              cited_by_count: candidate.cited_by_count,
              searchFrequency: candidate.searchFrequency || 0,
              reputation: candidate.reputation,
              ...representation
            };
          }
          return null;
        }));
        enrichedCandidates.push(...batchResults);
      }

      // --- Robust Semantic Filtering Layer ---
      const activeCandidates = enrichedCandidates.filter(c => c && !c.sparseData);
      console.log('[PIPELINE] Step 3.7 complete');
      console.log('[PIPELINE] enriched journals:', activeCandidates.length);

      // Fix: When OpenAlex abstracts unavailable (budget exhausted), use domain venue cache directly
      if (activeCandidates.length === 0) {
        console.warn('[PIPELINE] No enriched candidates — injecting domain venue cache elites');
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

      // Pass all active candidates directly to scoring — no redundant pre-filtering
      // The scoring service computes embeddings (with caching) and handles ranking properly
      dynamicJournals.push(...activeCandidates);
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
      logger.info(`Enrichment complete: ${dynamicJournals.length} journals ready for scoring`);
    }

    // --- Step 4: Scoring, Explanation & Ranking ---
    emitProgress(5, 'Computing semantic match scores...');
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

    emitProgress(6, 'Generating detailed explanations...');
    t0 = Date.now();
    const journalsWithExplanations = await AiService.generateExplanations(abstract, extractedFeatures, top5);
    timings.explanations = Date.now() - t0;

    emitProgress(7, 'Finalizing your results...');
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

    const responsePayload = {
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
    };

    let savedId = null;
    if (req.user?.id) {
      try {
        const saved = await HistoryService.save(
          req.user.id,
          responsePayload,
          req.file?.originalname || null
        );
        savedId = saved?.id ?? null;
      } catch (saveErr) {
        logger.warn(`[HISTORY] save skipped: ${saveErr.message}`);
      }
    }

    res.json({ id: savedId, ...responsePayload });

  } catch (error) {
    console.error('[CONTROLLER CRASH]', error.message);
    console.error('[CONTROLLER STACK]', error.stack);
    logger.error(`Analysis failed: ${error.message}`);
    next(error);
  }
};
