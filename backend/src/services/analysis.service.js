import Groq from 'groq-sdk';
import logger from '../config/logger.js';

let _groq = null;
function getGroq() {
  if (_groq) return _groq;
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    logger.warn('GROQ_API_KEY not set, AnalysisService will use fallback mock data.');
    return null;
  }
  _groq = new Groq({ apiKey: key });
  return _groq;
}

export class AnalysisService {
  /**
   * Performs deep novelty and impact analysis using Llama 3 via Groq.
   * This goes beyond simple semantic similarity to identify paradigm shifts.
   */
  static async analyzePaper(abstract) {
    const groq = getGroq();
    
    if (!groq) {
      return this.getFallbackAnalysis();
    }

    const prompt = `
You are an expert research scientist and program committee reviewer for top-tier venues such as NeurIPS, ICML, and ACL. 
Analyze the paper abstract below and determine its true research nature. 
Identify whether it is foundational (new paradigm), incremental (improving existing work), application-based, or survey-based.

Return your response STRICTLY in JSON format with the following fields:
{
  "paper_type": "foundational" | "incremental" | "application" | "survey",
  "novelty_score": 0-1,
  "novelty_label": "low" | "medium" | "high" | "breakthrough",
  "impact_potential": 0-1,
  "confidence": 0-1,
  "signals": {
    "paradigm_shift": boolean,
    "novelty_similarity_gap": 0-1
  },
  "contribution_vector": {
    "architecture": 0-1,
    "theory": 0-1,
    "application": 0-1,
    "benchmarking": 0-1
  }, // MUST SUM TO 1.0. Give the primary contribution type the highest value.
  "reviewer_sentiment": {
    "positive": 0-1,
    "skepticism": 0-1
  },
  "risk_factors": [
    { "type": "string", "severity": 0-1, "description": "string" }
  ],
  "risk_score": 0-1,
  "venue_strategy": {
    "recommended_tier": "elite" | "mid-tier" | "broad",
    "override_similarity": boolean,
    "reasoning": "string"
  },
  "final_recommendation": {
    "submission_readiness": "low_fit" | "moderate_fit" | "high_fit" | "high_potential_high_risk",
    "confidence_in_acceptance": 0-1
  },
  "key_contribution_summary": "one sentence",
  "reviewer_explanation": "2-3 sentences"
}

Abstract:
${abstract}
`;

    try {
      for (const model of [
        'llama-3.3-70b-versatile',
        'llama-3.1-70b-versatile',
        'mixtral-8x7b-32768',
        'qwen-qwq-32b',
      ]) {
        try {
          console.log(`[AI] trying groq/${model}`);
          const response = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: model,
            response_format: { type: "json_object" }
          });

          const content = response.choices[0].message.content;
          return JSON.parse(content);
        } catch (err) {
          const shouldSkip = 
            err.status === 429 ||
            err.message?.includes('429') || 
            err.message?.includes('rate') ||
            err.message?.includes('decommissioned') ||
            err.message?.includes('model_decommissioned');

          if (shouldSkip) {
            console.warn(`[AI] groq/${model} unavailable or rate limited, waiting 3s before next...`);
            await new Promise(r => setTimeout(r, 3000));
            continue;
          }
          throw err;
        }
      }
      logger.error(`AnalysisService failed: All Groq models exhausted`);
      return this.getFallbackAnalysis();
    } catch (error) {
      logger.error(`AnalysisService failed: ${error.message}`);
      return this.getFallbackAnalysis();
    }
  }

  static getFallbackAnalysis() {
    logger.info('Using fallback analysis logic.');
    return {
      is_fallback: true,
      paper_type: "incremental",
      novelty_score: 0.5,
      novelty_label: "medium",
      impact_potential: 0.5,
      confidence: 0.5,
      signals: { paradigm_shift: false, novelty_similarity_gap: 0.1 },
      contribution_vector: { architecture: 0.5, theory: 0.3, application: 0.7, benchmarking: 0.5 },
      reviewer_sentiment: { positive: 0.6, skepticism: 0.4 },
      risk_factors: [],
      risk_score: 0.2,
      venue_strategy: { recommended_tier: "mid-tier", override_similarity: false, reasoning: "Fallback due to service error." },
      final_recommendation: { submission_readiness: "moderate_fit", confidence_in_acceptance: 0.4 },
      key_contribution_summary: "Research study on current field patterns.",
      reviewer_explanation: "The paper appears to offer incremental improvements. Further verification of novelty is required."
    };
  }
}
