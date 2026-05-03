import { cosineSimilarity } from '../utils/cosineSimilarity.js';
import { calculateSemanticKeywordMatch } from '../utils/semanticKeywordMatch.js';
import { calculateDomainMatch } from '../utils/domainMatch.js';
import { EmbeddingService } from './embedding.service.js';
import logger from '../config/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cached journal data and embeddings
let cachedJournals = null;
const journalEmbeddings = new Map();

export class ScoringService {
  static loadJournals() {
    if (!cachedJournals) {
      const journalsPath = path.join(__dirname, '../data/journals.json');
      const data = fs.readFileSync(journalsPath, 'utf-8');
      cachedJournals = JSON.parse(data);
    }
    return cachedJournals;
  }

  /**
   * Precompute embeddings for all journals at startup.
   * Call this once during server initialization so /analyze never blocks on journal embeddings.
   */
  static async precomputeEmbeddings() {
    const journals = this.loadJournals();
    logger.info(`Precomputing embeddings for ${journals.length} journals...`);
    const start = Date.now();

    for (const journal of journals) {
      if (!journalEmbeddings.has(journal.name)) {
        const journalText = `${journal.scope} ${journal.keywords.join(' ')}`;
        const embedding = await EmbeddingService.getEmbedding(journalText);
        journalEmbeddings.set(journal.name, embedding);
      }
    }

    const elapsed = Date.now() - start;
    logger.info(`Journal embedding precompute complete: ${journalEmbeddings.size} journals cached in ${elapsed}ms`);
  }

  static isJournalCached(key) {
    return journalEmbeddings.has(key);
  }

  static cacheJournalEmbedding(key, embedding, nameForLog = null) {
    if (!journalEmbeddings.has(key)) {
      journalEmbeddings.set(key, embedding);
      if (nameForLog) {
        logger.info(`[CACHE-WRITE] ${nameForLog}`);
      }
    }
  }

  static computeFinalScore(similarityScore, analysis, journal = null, state = {}) {
    const isValidAnalysis = analysis && !analysis.is_fallback;
    if (!isValidAnalysis) return similarityScore;

    const { impact_potential, risk_score, signals, contribution_vector, confidence } = analysis;
    const safeConfidence = Math.max(0, Math.min(1, confidence || 0));

    let baseScore = similarityScore;

    if (contribution_vector) {
      const keys = ['architecture', 'theory', 'application', 'benchmarking'];

      // Normalize contribution_vector so alignment reflects direction, not magnitude
      const cvNorm = Math.sqrt(keys.reduce((s, k) => s + (contribution_vector[k] || 0) ** 2, 0)) || 1;
      const normCV = keys.map(k => (contribution_vector[k] || 0) / cvNorm);

      // Neutral equal-weight value for any missing profile_vector key
      const NEUTRAL = 1 / Math.sqrt(keys.length);
      const pv = journal?.profile_vector;
      const jVec = keys.map(k => (pv && pv[k] != null) ? pv[k] : NEUTRAL);

      // Explicitly compute cosine similarity for alignment
      let dot = 0, normA = 0, normB = 0;
      for (let i = 0; i < keys.length; i++) {
        dot += normCV[i] * jVec[i];
        normA += normCV[i] ** 2;
        normB += jVec[i] ** 2;
      }
      const alignment = (normA > 0 && normB > 0) ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;

      // Dynamic weight: higher confidence → stronger alignment influence (range 0.10–0.20)
      const alignWeight = 0.05 + 0.05 * safeConfidence;
      baseScore += alignment * alignWeight; // Preserve spread, no intermediate clamp
    }

    const paradigmShift = signals?.paradigm_shift === true;
    const highGap = (signals?.novelty_similarity_gap || 0) > 0.25;

    let intermediateScore = baseScore;
    if (paradigmShift || highGap) {
      if (!state.loggedBreakthrough) {
        logger.info('Breakthrough detected! Blending global quality floor with journal-specific relevance.');
        state.loggedBreakthrough = true;
      }
      // Compute a global quality multiplier from impact/risk, then boost the journal-specific baseScore
      // This preserves the relative ranking and domain penalties, preventing bad matches from soaring
      const overrideFloor = 0.6 * (impact_potential || 0.8) + 0.4 * (1 - (risk_score || 0.2));
      intermediateScore = baseScore + (1 - baseScore) * overrideFloor * 0.4;
    } else {
      // Standard hybrid blend for normal papers: 70% relevance, 30% impact
      intermediateScore = 0.7 * baseScore + 0.3 * (impact_potential || 0);
    }

    // Apply reputation blending (final calibration): 80% relevance/impact, 20% reputation
    const reputation = journal?.reputation || 0.4;
    const isElite = reputation > 0.94;

    const isFoundational = analysis?.paper_type === 'foundational' || analysis?.novelty_label === 'breakthrough';

    // Stable reputation weighting: 8% influence. 
    // High-relevance matches now rank naturally via venue-level semantic identity.
    const repWeight = 0.08;
    let finalScore = (1 - repWeight) * intermediateScore + repWeight * reputation;

    // Final differentiation factor: minimal reputation-based tie-breaker
    finalScore += 0.01 * (journal?.reputation || 0.5);

    return Math.max(0, Math.min(1.0, finalScore)); // Clamp only at the end
  }

  static async computeJournalScores(abstractEmbedding, extractedFeatures, dynamicJournals = null, analysis = null) {
    const domain = extractedFeatures?.domain;
    const nonCsDomains = ['neuroscience', 'biology', 'medicine', 'chemistry', 'physics', 'general_stem'];
    
    let journals;
    if (dynamicJournals && dynamicJournals.length > 0) {
      journals = dynamicJournals;
    } else if (domain && nonCsDomains.includes(domain)) {
      // NEVER fall back to static CS journal list for non-CS domains
      console.warn(`[SCORING] No dynamic journals for domain "${domain}" — skipping CS static list`);
      journals = [];
    } else {
      journals = this.loadJournals();
    }

    const scoredJournals = [];
    const scoringState = {};

    if (domain && nonCsDomains.includes(domain)) {
      logger.info(`[CONTRIB-OVERRIDE] Forcing neutral vector for domain: ${extractedFeatures.domain}`);
      if (analysis) {
        analysis.contribution_vector = { architecture: 0.25, theory: 0.25, application: 0.25, benchmarking: 0.25 };
      }
    }

    if (analysis?.contribution_vector) {
      const { architecture = 0, theory = 0, application = 0, benchmarking = 0 } = analysis.contribution_vector;
      const total = architecture + theory + application + benchmarking || 1;

      analysis.contribution_vector = {
        architecture: architecture / total,
        theory: theory / total,
        application: application / total,
        benchmarking: benchmarking / total
      };

      const v = analysis.contribution_vector;
      console.log(`[CONTRIB-VECTOR] (normalized) architecture: ${v.architecture.toFixed(2)} | theory: ${v.theory.toFixed(2)} | application: ${v.application.toFixed(2)} | benchmarking: ${v.benchmarking.toFixed(2)}`);
    }

    // Pre-batch: Collect ALL abstract texts across ALL journals and compute embeddings in one pass
    const allAbstractTexts = new Set();
    for (const journal of journals) {
      // Allow sparseData journals to be scored by their metadata embeddings if no abstracts available
      if (journal.sparseData && (!journal.abstracts || journal.abstracts.length === 0)) continue;
      if (journal.abstracts && journal.abstracts.length > 0) {
        journal.abstracts.forEach(text => allAbstractTexts.add(text));
      }
    }
    // Compute all embeddings concurrently (cache will dedup repeat texts)
    const uniqueTexts = Array.from(allAbstractTexts);
    if (uniqueTexts.length > 0) {
      await Promise.all(uniqueTexts.map(text => EmbeddingService.getEmbedding(text)));
      logger.info(`[PERF] Pre-batched ${uniqueTexts.length} abstract embeddings`);
    }

    for (const journal of journals) {
      // Process all journals; journals without abstracts will use their metadata-based centroid
      
      // Embeddings should already be cached from precomputeEmbeddings()
      // Fallback to on-demand if somehow missing
      const cacheKey = journal.id || journal.name;
      if (!journalEmbeddings.has(cacheKey)) {
        logger.warn(`Cache miss for journal "${journal.name}", computing on-demand`);
        const journalText = `${journal.scope} ${journal.keywords.join(' ')}`;
        const embedding = await EmbeddingService.getEmbedding(journalText);
        journalEmbeddings.set(cacheKey, embedding);
      }

      const journalEmb = journalEmbeddings.get(cacheKey);

      let semanticScore = 0;
      if (journal.abstracts && journal.abstracts.length > 0) {
        // Venue-level Semantic Representation: Construct a single identity from relevant history
        // All embeddings are already cached from the pre-batch step above
        const abstractEmbeddings = await Promise.all(
          journal.abstracts.map(text => EmbeddingService.getEmbedding(text))
        );

        // Find top 6 most relevant historical papers to define this venue's specific context for the user paper
        const sims = abstractEmbeddings.map(emb => ({
          emb,
          score: cosineSimilarity(abstractEmbedding, emb)
        })).sort((a, b) => b.score - a.score);

        const topN = Math.min(6, sims.length);
        const topSims = sims.slice(0, topN);

        // Construct Venue-Level Embedding (Centroid of top matches)
        const vectorSize = abstractEmbedding.length;
        const venueVector = new Array(vectorSize).fill(0);
        for (const item of topSims) {
          for (let i = 0; i < vectorSize; i++) {
            venueVector[i] += item.emb[i];
          }
        }
        for (let i = 0; i < vectorSize; i++) {
          venueVector[i] /= topN;
        }

        // Compute focusScore: Mean similarity between individual papers and their centroid.
        // High score = Narrow/Focused (papers are tight around centroid), Low score = Broad/Diverse.
        let sumSimToCentroid = 0;
        for (const item of topSims) {
          sumSimToCentroid += cosineSimilarity(item.emb, venueVector);
        }
        journal.focusScore = sumSimToCentroid / topN;

        // Primary Signal: Direct similarity between user paper and aggregated venue identity
        const venueSimilarity = cosineSimilarity(abstractEmbedding, venueVector);

        // Consistency Factor: Measures how "tight" the venue's relevance is (Top 1 vs Top N average)
        const avgTopSim = topSims.reduce((acc, curr) => acc + curr.score, 0) / topN;
        const consistency = avgTopSim / (topSims[0].score || 1);

        // Hybrid Semantic Score: 90% Venue-level similarity, 10% Consistency boost
        semanticScore = (0.9 * venueSimilarity) + (0.1 * consistency * venueSimilarity);
      } else {
        semanticScore = cosineSimilarity(abstractEmbedding, journalEmb);
      }

      // 2. Light Keyword Alignment Boost (Weight: 0.15 - Reduced to prevent mega-journals from gaming via massive keyword lists)
      const keywordOverlap = await calculateSemanticKeywordMatch(extractedFeatures.keywords, journal.keywords);

      // 3. Domain Match (Used as a qualifier)
      const domainMatch = calculateDomainMatch(extractedFeatures.domain, journal.domain);

      // Stable Hybrid Score: 85% Semantic, 15% Keyword (Prioritizing true topical alignment)
      let rawScore = ((0.85 * semanticScore) + (0.15 * keywordOverlap));

      // --- NEW: Specialization Boost ---
      // Reward specialized journals over broad mega-journals (Nature, PLoS ONE, Science)
      // `focusScore` measures how tightly clustered the venue's papers are around its centroid.
      // High focusScore = Niche/Specialized. Low focusScore = Broad/Mega-journal.
      if (journal.focusScore) {
        // focusScore typically ranges from 0.4 (broad) to 0.8+ (highly specialized)
        // Normalize it to a multiplier between 0.90 and 1.30
        const specializationMultiplier = 0.90 + (journal.focusScore * 0.5); 
        rawScore *= specializationMultiplier;
        logger.info(`[SPECIALIZATION-BOOST] ${journal.name} | focusScore: ${journal.focusScore.toFixed(3)} | mult: ${specializationMultiplier.toFixed(3)}`);
      }

      // --- NEW: Specificity Penalty ---
      // Penalize journals with massive publication volumes (mega-journals)
      const worksCount = journal.works_count ?? journal.worksCount ?? 0;
      let specificityPenalty = 0;
      
      if (worksCount > 1000000) specificityPenalty = 0.30;       // Nature, Science, PLoS ONE
      else if (worksCount > 200000) specificityPenalty = 0.20;  // Broad journals
      else if (worksCount > 50000) specificityPenalty = 0.10;   // Semi-broad
      
      if (specificityPenalty > 0) {
        rawScore *= (1 - specificityPenalty);
        logger.info(`[SPECIFICITY-PENALTY] ${journal.name} | works: ${worksCount} | penalty: -${(specificityPenalty * 100)}%`);
      }
      
      console.log(`[SCORING] ${journal.name} | works_count: ${worksCount || 'MISSING'} | penalty: ${specificityPenalty} | rawScore: ${rawScore}`);

      // --- NEW: Scalable Cross-Domain and Type Penalties ---
      // 1. Strong Domain Mismatch Penalty (Replaces keyword blocklists)
      if (domainMatch < 0.5) {
        rawScore *= 0.4; // Strong penalty instead of hard deletion
        logger.info(`[DOMAIN-PENALTY] ${journal.name} penalized (Journal Domain: ${journal.domain} vs Paper: ${extractedFeatures.domain})`);
      }

      // 2. Clinical vs Analytical/Experimental Separation (Crucial for Chemistry/Bio/Medicine)
      const clinicalTerms = ['patient', 'trial', 'treatment', 'clinical', 'cohort', 'therapy', 'surgery', 'hospital'];
      
      // Determine if paper is clinical
      const paperText = `${extractedFeatures.domain} ${extractedFeatures.keywords.join(' ')}`.toLowerCase();
      const isPaperClinical = clinicalTerms.some(term => paperText.includes(term));
      
      // Determine if journal is clinical
      const journalText = `${journal.name} ${journal.scope} ${(journal.keywords || []).join(' ')}`.toLowerCase();
      const isJournalClinical = clinicalTerms.some(term => journalText.includes(term)) || 
                                ['lancet', 'jama', 'nejm', 'bmj', 'medicine'].some(term => journalText.includes(term));

      if (!isPaperClinical && isJournalClinical) {
        // Analytical paper paired with a Clinical journal
        rawScore *= 0.3; // Massive penalty
        logger.info(`[TYPE-PENALTY] ${journal.name} penalized (Clinical journal vs Analytical paper)`);
      } else if (isPaperClinical && !isJournalClinical && extractedFeatures.domain === 'medicine') {
        // Clinical paper paired with a pure Analytical/Bench journal
        rawScore *= 0.6; // Moderate penalty
      }

      let score = Math.min(1.0, rawScore);

      // Upgrade: Integrate Novelty-Aware Analysis
      score = this.computeFinalScore(score, analysis, journal, scoringState);

      // --- Step 3.7: Contribution Vector Alignment Gate ---
      const contributionVector = analysis?.contribution_vector;
      let contributionAlignment = 0.5; // Neutral default

      if (contributionVector) {
        // Determine venue's dominant contribution type based on name/keywords
        const venueContent = `${journal.name} ${(journal.keywords || []).join(' ')}`.toLowerCase();
        let dominantType = 'architecture'; // Default
        let isDefault = true;

        if (['theory', 'mathematics', 'formal', 'foundations', 'computational theory'].some(t => venueContent.includes(t))) {
          dominantType = 'theory';
          isDefault = false;
        } else if (['applied systems', 'real-world applications', 'industrial applications', 'human-computer interaction'].some(t => venueContent.includes(t))) {
          dominantType = 'application';
          isDefault = false;
        } else if (['benchmark', 'evaluation', 'survey', 'empirical', 'evaluation and performance assessment'].some(t => venueContent.includes(t))) {
          dominantType = 'benchmarking';
          isDefault = false;
        }

        // Alignment is the paper's weight for this venue's dominant type
        contributionAlignment = contributionVector[dominantType] || 0;

        // Apply multiplier: perfect match adds 30% weight, complete mismatch reduces by 30%
        score *= (0.7 + 0.3 * contributionAlignment);
        const typeLabel = isDefault ? `${dominantType}/default` : dominantType;
        console.log(`[CONTRIB-ALIGN] ${journal.name} → ${contributionAlignment.toFixed(2)} (${typeLabel})`);
      }

      journal.contributionAlignment = Number(contributionAlignment.toFixed(2));

      // 4. UI Display Calibration
      // We apply a 0.6 power scale only for the display score to map dense academic similarity into human-intuitive perceived match strength.
      // Internal logic (filtering, ranking, readiness) continues to use the unscaled 'score'.
      // Calibrated display curve: maps internal scores to a more natural 60-85% range
      // Internal 0.55 → displays ~72%, Internal 0.70 → displays ~82%
      // Honest but presentation-friendly — reflects real differentiation without inflation
      const displayScore = Math.min(1.0, 0.45 + Math.pow(score, 0.7) * 0.6);

      scoredJournals.push({
        ...journal,
        score: score,
        displayScore: displayScore,
        metrics: {
          semanticSimilarity: semanticScore,
          keywordOverlap,
          domainMatch
        }
      });
    }

    // Sort descending by score
    scoredJournals.sort((a, b) => b.score - a.score);
    return scoredJournals;
  }

  static computeReadiness(topJournal, extractedFeatures, analysis = null) {
    const risks = [];
    const weaknesses = [];

    // Evaluate deterministic weaknesses
    if (topJournal.metrics.keywordOverlap < 0.3) {
      weaknesses.push("Low keyword overlap with target journal");
    }
    if (topJournal.metrics.semanticSimilarity < 0.5) {
      weaknesses.push("Semantic scope of paper differs from journal scope");
    }

    // Evaluate deterministic risks
    if (topJournal.metrics.domainMatch === 0) {
      risks.push("Domain mismatch with target journal");
    }
    if (topJournal.score < 0.4) {
      risks.push("Overall journal match score is too low");
    }

    // Add risks from deep analysis if available
    if (analysis?.risk_factors) {
      analysis.risk_factors.forEach(r => risks.push(r.description));
    }

    // --- Factor-based Scoring (0-100 scale) ---

    // 1. Semantic Fit: derived from top journal's semantic similarity
    const semanticFit = Math.round((topJournal.metrics.semanticSimilarity || 0) * 100);

    // Domain alignment: primarily driven by domain match + semantic similarity
    // domainMatch is 1.0 for match, 0 for mismatch — reliable signal
    const domainMatchScore = topJournal.metrics.domainMatch || 0;
    const semanticScore = topJournal.metrics.semanticSimilarity || 0;
    const domainAlignment = Math.min(100, Math.round((0.5 * domainMatchScore + 0.5 * semanticScore) * 120));

    // 3. Contribution Match: for non-CS papers use novelty/impact as proxy
    // For CS papers use actual contribution alignment
    const nonCsDomains = ['biology', 'neuroscience', 'medicine', 'chemistry'];
    const isNonCS = nonCsDomains.includes(extractedFeatures?.domain);
    const contributionMatch = isNonCS
      ? Math.round((analysis?.impact_potential || 0.5) * 100)
      : Math.round((topJournal.contributionAlignment || 0.5) * 100);

    // 4. Risk Penalty: 100 minus penalties for total risks found
    const riskPenalty = Math.max(40, 100 - (risks.length * 10));

    // Overall Weighted Average
    const overall = Math.round(
      (semanticFit * 0.4) +
      (domainAlignment * 0.25) +
      (contributionMatch * 0.20) +
      (riskPenalty * 0.15)
    );

    let acceptanceLevel = "Low";
    if (overall > 80) acceptanceLevel = "High";
    else if (overall > 50) acceptanceLevel = "Medium";

    const issues = [...risks, ...weaknesses];
    if (issues.length === 0) issues.push("No major issues detected");

    const suggestions = [];
    if (topJournal.metrics.keywordOverlap < 0.3) suggestions.push("Revise abstract to include more relevant keywords");
    if (topJournal.metrics.semanticSimilarity < 0.5) suggestions.push("Reframe the introduction to better align with the journal's focus");
    if (topJournal.score < 0.6) suggestions.push("Consider submitting to a different journal with a better scope match");
    if (analysis?.venue_strategy?.reasoning) suggestions.push(analysis.venue_strategy.reasoning);
    if (suggestions.length === 0) suggestions.push("Proceed with submission preparation");

    return {
      overall,
      factors: {
        semanticFit,
        domainAlignment,
        contributionMatch,
        riskPenalty
      },
      acceptanceLevel,
      risks,
      weaknesses,
      issues,
      suggestions
    };
  }
}
