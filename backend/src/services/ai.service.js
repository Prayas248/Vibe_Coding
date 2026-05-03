import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import logger from '../config/logger.js';
import { extractKeywordsLocal, extractKeywordsWithEmbeddings } from '../utils/keywordExtractor.js';
import { EmbeddingService } from './embedding.service.js';

// Lazy-initialized: dotenv may not have run yet at module parse time (ESM hoisting)
let _ai = null;
function getAI() {
  if (_ai) return _ai;
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    logger.warn('GROQ_API_KEY is not set — AI features will use mock fallback.');
    return null;
  }
  try {
    _ai = new Groq({ apiKey: key });
    logger.info('Groq client initialized.');
    return _ai;
  } catch (error) {
    logger.warn(`Groq failed to initialize: ${error.message}`);
    return null;
  }
}

let _gemini = null;
function getGemini() {
  if (_gemini) return _gemini;
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    logger.warn('GEMINI_API_KEY is not set — Gemini fallback unavailable.');
    return null;
  }
  try {
    _gemini = new GoogleGenerativeAI(key);
    logger.info('Gemini client initialized.');
    return _gemini;
  } catch (error) {
    logger.warn(`Gemini failed to initialize: ${error.message}`);
    return null;
  }
}

// Circuit breaker for Gemini — once 429'd, skip for 1 hour
let geminiCircuitBroken = false;
let geminiCircuitResetAt = 0;

async function callGemini(prompt, isJson = true) {
  if (geminiCircuitBroken && Date.now() < geminiCircuitResetAt) {
    throw new Error('Gemini circuit breaker open (quota exhausted)');
  }
  geminiCircuitBroken = false;

  const genAI = getGemini();
  if (!genAI) throw new Error('Gemini not available');

  const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.0-flash-lite"];
  let lastErr;

  for (const modelName of models) {
    try {
      console.log(`[AI] Attempting Gemini: ${modelName}`);
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        generationConfig: isJson ? { responseMimeType: "application/json" } : {}
      });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (err) {
      lastErr = err;
      const isQuota = err.message?.includes('429') || err.message?.includes('quota') || err.message?.includes('rate');
      if (isQuota) {
        console.warn(`[AI] Gemini/${modelName} rate limited — tripping circuit breaker for 1h`);
        geminiCircuitBroken = true;
        geminiCircuitResetAt = Date.now() + 3600_000;
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// Zod Schemas for AI output validation
const featureSchema = z.object({
  domain: z.string().min(1),
  keywords: z.array(z.string()).min(5).max(8),
  summary: z.string().min(1),
});

const explanationSchema = z.object({
  fitReason: z.string().min(1),
  risks: z.array(z.string()).min(1).max(2),
  suggestions: z.array(z.string()).min(1).max(2),
});

const recommendedJournalSchema = z.object({
  name: z.string().min(1),
  scope: z.string().min(1),
  domain: z.string().min(1),
  keywords: z.array(z.string()).min(3).max(8)
});

const DEFAULT_MODEL = "llama-3.3-70b-versatile";

const GROQ_FALLBACK_MODELS = [
  'llama-3.3-70b-versatile',
];

async function callWithFallback(prompt, validator = null) {
  // 1. Try Gemini first (primary — gemini-2.5-flash)
  try {
    console.log('[AI] Trying Gemini (primary)...');
    const text = await callGemini(prompt, true);
    if (validator) validator(text);
    return text;
  } catch (geminiErr) {
    const reason = geminiErr.message?.includes('circuit breaker') ? 'Circuit Breaker' :
                   geminiErr.message?.includes('429') ? 'Rate Limited' :
                   geminiErr.message?.includes('not available') ? 'No Key' :
                   geminiErr.message === 'GARBAGE_FEATURES' ? 'Validation Failed' :
                   geminiErr.message?.slice(0, 60);
    console.warn(`[AI] Gemini failed (${reason}), falling back to Groq...`);
  }

  // 2. Fallback to Groq
  const ai = getAI();
  if (!ai) {
    throw new Error('All LLM providers unavailable (Gemini failed, Groq not configured)');
  }

  for (const model of GROQ_FALLBACK_MODELS) {
    try {
      console.log(`[AI] Attempting Groq fallback: ${model}`);
      const response = await ai.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model,
        response_format: { type: "json_object" }
      });
      const text = response.choices[0].message.content;
      if (validator) validator(text);
      return text;
    } catch (err) {
      const isRateLimit = err.status === 429 || err.message?.includes('429') || err.message?.includes('rate');
      const isDecommissioned = err.message?.includes('decommissioned') || err.message?.includes('model_decommissioned');
      const isGarbage = err.message === 'GARBAGE_FEATURES';

      if (isRateLimit || isDecommissioned || isGarbage) {
        const reason = isRateLimit ? 'Rate Limited' : isDecommissioned ? 'Model Retired' : 'Validation Failed';
        console.warn(`[AI] Groq/${model} failed (${reason}), trying next fallback...`);
        if (isRateLimit) await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      throw err;
    }
  }

  throw new Error('All LLM providers exhausted (Gemini + Groq)');
}

// Groq-primary path for non-critical calls (faster, saves Gemini tokens)
async function callWithFallbackGroqFirst(prompt, validator = null) {
  // 1. Try Groq first (faster LPU inference)
  const ai = getAI();
  if (ai) {
    for (const model of GROQ_FALLBACK_MODELS) {
      try {
        console.log(`[AI-FAST] Trying Groq: ${model}`);
        const response = await ai.chat.completions.create({
          messages: [{ role: "user", content: prompt }],
          model,
          response_format: { type: "json_object" }
        });
        const text = response.choices[0].message.content;
        if (validator) validator(text);
        return text;
      } catch (err) {
        const isRateLimit = err.status === 429 || err.message?.includes('429') || err.message?.includes('rate');
        const isDecommissioned = err.message?.includes('decommissioned') || err.message?.includes('model_decommissioned');
        const isGarbage = err.message === 'GARBAGE_FEATURES';
        if (isRateLimit || isDecommissioned || isGarbage) {
          console.warn(`[AI-FAST] Groq/${model} failed, trying Gemini fallback...`);
          if (isRateLimit) await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        throw err;
      }
    }
  }

  // 2. Fallback to Gemini
  console.log('[AI-FAST] Groq unavailable, falling back to Gemini...');
  const text = await callGemini(prompt, true);
  if (validator) validator(text);
  return text;
}

export class AiService {
  static async extractFeatures(abstract) {
    if (!getAI() && !getGemini()) {
      logger.warn('No LLM providers available, using mock feature extraction.');
      return {
        domain: "Artificial Intelligence",
        keywords: ["machine learning", "neural networks", "data analysis", "prediction", "automation"],
        summary: "This is a mock summary because the GROQ_API_KEY is not configured."
      };
    }

    const prompt = `Classify this research abstract. Return ONLY JSON with these fields:
- "domain": exactly one of: "cs_ai", "nlp", "biology", "neuroscience", "medicine", "chemistry", "physics", "general_stem"
- "keywords": array of 5-8 multi-word technical phrases (2+ words each, no generic terms like "model" or "method")
- "summary": 1-2 sentence summary

Domain rules:
- Classify by SUBJECT MATTER, not methods used (ML applied to biology → biology, not cs_ai)
- nlp: language/text/speech tasks (translation, LMs, QA, summarization, parsing). Venue: ACL/EMNLP/NAACL
- cs_ai: ML theory, vision, RL, non-language architectures. Venue: NeurIPS/ICML/ICLR/CVPR
- Transformer for machine translation → nlp. Vision/general architecture → cs_ai

Abstract:
${abstract}`;

    try {
      const validator = (text) => {
        try {
          const parsed = JSON.parse(text);
          const GENERIC_KEYWORDS = ['research', 'academic', 'paper', 'analysis', 'study', 'method', 'approach', 'model', 'data', 'result', 'performance'];
          const VALID_DOMAINS = ['cs_ai', 'nlp', 'neuroscience', 'biology', 'medicine', 'chemistry', 'physics', 'general_stem'];
          const keywords = parsed.keywords || [];
          const genericCount = keywords.filter(k => GENERIC_KEYWORDS.includes(k.toLowerCase())).length;
          
          const tooShort = keywords.filter(k => k.length < 8).length;
          const majorityShort = tooShort > (keywords.length / 2);

          console.log('[AI] keyword lengths:', keywords.map(k => k.length));
          console.log('[AI] tooShort count:', tooShort, '| majority:', majorityShort);

          // Fail if more than half the keywords are generic, or fewer than 3 keywords returned
          const isGenericKeywords = keywords.length < 3 || (genericCount / keywords.length) > 0.5;
          const isInvalidDomain = !VALID_DOMAINS.includes(parsed.domain);
          
          if (isGenericKeywords || isInvalidDomain || majorityShort) {
            console.warn('[PIPELINE] Garbage features detected — domain:', parsed.domain, 'keywords:', parsed.keywords);
            throw new Error('GARBAGE_FEATURES');
          }
        } catch (e) {
          if (e.message === 'GARBAGE_FEATURES') throw e;
        }
      };

      let text = await callWithFallback(prompt, validator);
      
      if (!text) throw new Error('Empty response from LLM');
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (parseErr) {
        console.error('[AI] JSON parse failed:', parseErr.message);
        console.error('[AI] raw was:', text);
        throw new Error('LLM returned malformed JSON');
      }

      const validated = featureSchema.safeParse(parsed);
      if (!validated.success) {
        logger.error('AI feature extraction validation failed', { errors: validated.error.errors });
        return {
          domain: "Research",
          keywords: ["academic", "research", "paper", "analysis", "study"],
          summary: "Feature extraction failed to validate."
        };
      }

      const data = validated.data;
      
      // Fix 2: Contribution classifier for non-CS domains
      const nonCsDomains = ["neuroscience", "biology", "medicine", "chemistry"];
      if (nonCsDomains.includes(data.domain)) {
        logger.info(`[CONTRIB-SKIP] Non-CS domain detected — using neutral contribution vector`);
        data.contribution_vector = { architecture: 0.25, theory: 0.25, application: 0.25, benchmarking: 0.25 };
      }

      return data;
    } catch (error) {
      logger.error(`AI feature extraction failed: ${error.message}`);
      // If all LLM providers are exhausted, extract domain + keywords from the abstract using regex
      const isQuotaError = error.message?.includes('429') || error.message?.includes('quota') || error.message?.includes('rate');
      if (isQuotaError) {
        logger.warn('[AI] All LLM providers exhausted — extracting domain/keywords from abstract text');
        const text = abstract.toLowerCase();

        // Domain detection via keyword signatures
        let domain = 'general_stem';
        if (/\b(transformer|attention mechanism|language model|nlp|machine translation|bert|gpt|tokeniz|seq2seq|text classification|question answering|summarization)\b/.test(text)) domain = 'nlp';
        else if (/\b(neural network|deep learning|convolutional|image classification|reinforcement learning|computer vision|object detection|generative model)\b/.test(text)) domain = 'cs_ai';
        else if (/\b(neuron|synapse|hippocampus|cortex|neuroplasticity|brain|eeg|fmri|cognitive|neural circuit)\b/.test(text)) domain = 'neuroscience';
        else if (/\b(crispr|gene expression|protein folding|genomics|dna|rna|cell biology|molecular biology|evolution)\b/.test(text)) domain = 'biology';
        else if (/metabolomics|mass spectrometry|chromatography|spectroscopy|NMR|spectrometry|analytical chemistry/i.test(text)) domain = 'chemistry';
        else if (/\b(clinical trial|patient|disease|treatment|therapy|drug|cancer|diagnosis|medical|pharmaceutical|randomized)\b/.test(text)) domain = 'medicine';
        else if (/\b(synthesis|catalysis|reaction|molecule|compound|polymer|spectroscopy|chromatography|organic|inorganic)\b/.test(text)) domain = 'chemistry';
        else if (/\b(quantum|particle|thermodynamics|electromagnetic|astrophysics|optics|condensed matter|mechanics)\b/.test(text)) domain = 'physics';

        // Extract keywords using embedding-based KeyBERT approach (local, no API needed)
        let keywords;
        try {
          keywords = await extractKeywordsWithEmbeddings(abstract, (t) => EmbeddingService.getEmbedding(t));
          logger.info(`[AI] Embedding-based keywords: ${keywords.join(', ')}`);
        } catch (embErr) {
          logger.warn(`[AI] Embedding keyword extraction failed, using n-gram fallback: ${embErr.message}`);
          keywords = extractKeywordsLocal(abstract);
        }

        return {
          domain,
          keywords: keywords.length >= 3 ? keywords : ['research', 'scientific', 'methodology', 'analysis', 'results', 'study', 'approach'],
          summary: `[Quota fallback] ${abstract.split(/[.!?]/)[0].trim()}.`,
          _isQuotaFallback: true
        };
      }
      throw new Error(`Failed to extract features using AI: ${error.message}`);
    }
  }

  static async recommendJournals(abstract, extractedFeatures) {
    if (!getAI() && !getGemini()) return [];

    const prompt = `Recommend 5 real academic journals/conferences for this paper. Return ONLY a JSON array of 5 objects with: "name" (official name), "scope" (1 sentence), "domain", "keywords" (5-8 terms).

Domain: ${extractedFeatures.domain}
Keywords: ${extractedFeatures.keywords.join(', ')}
Abstract: ${abstract.slice(0, 500)}`;

    try {
      let text = await callWithFallbackGroqFirst(prompt);
      
      const parsed = JSON.parse(text);
      // LLM sometimes wraps in a root object if asked for a list, handle both
      const list = Array.isArray(parsed) ? parsed : (parsed.journals || parsed.recommendations || []);

      const validated = z.array(recommendedJournalSchema).safeParse(list);
      return validated.success ? validated.data : [];
    } catch (error) {
      logger.error(`AI journal recommendation failed: ${error.message}`);
      return [];
    }
  }

  static async enrichJournals(candidateJournals, abstract, extractedFeatures) {
    if ((!getAI() && !getGemini()) || !candidateJournals || candidateJournals.length === 0) return candidateJournals;

    const journalNames = candidateJournals.map(c => c.name).join(', ');

    const prompt = `For each journal, provide scope/domain/keywords. Return ONLY a JSON array of objects with: "name" (exact match), "scope" (1 sentence), "domain", "keywords" (5-8 terms).

Journals: ${journalNames}`;

    try {
      let text = await callWithFallbackGroqFirst(prompt);
      
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : (parsed.journals || parsed.enrichedJournals || []);

      const validated = z.array(recommendedJournalSchema).safeParse(list);
      return validated.success ? validated.data : candidateJournals;
    } catch (error) {
      logger.error(`AI journal enrichment failed: ${error.message}`);
      return candidateJournals;
    }
  }

  static async generateExplanations(abstract, extractedFeatures, topJournals) {
    if (!getAI() && !getGemini()) return topJournals.map(j => ({ ...j, explanation: { fitReason: "Match based on scope.", risks: [], suggestions: [] } }));

    const prompt = `For each journal, explain paper fit briefly. Return JSON: {"explanations": [{fitReason: "1 sentence", risks: ["1-2 items"], suggestions: ["1-2 items"]}]} in same order.

Paper topic: ${extractedFeatures.keywords.slice(0, 4).join(', ')}
Journals:
${topJournals.map((j, i) => `${i + 1}. ${j.name}`).join('\n')}`;

    try {
      let text = await callWithFallbackGroqFirst(prompt);
      
      const parsed = JSON.parse(text);

      // Look for the array in any common root key the LLM might have used
      const list = Array.isArray(parsed) ? parsed : (parsed.explanations || parsed.results || parsed.journals || Object.values(parsed).find(Array.isArray) || []);

      const validated = z.array(explanationSchema).safeParse(list);

      return topJournals.map((journal, index) => ({
        ...journal,
        explanation: (validated.success && validated.data[index]) ? validated.data[index] : {
          fitReason: "The paper aligns with the journal's focus area.",
          risks: ["Partial scope overlap."],
          suggestions: ["Review journal guidelines."]
        }
      }));
    } catch (error) {
      logger.error(`AI explanation generation failed: ${error.message}`);
      // Always return journals with a fallback explanation so the frontend never gets undefined
      return topJournals.map(journal => ({
        ...journal,
        explanation: journal.explanation || {
          fitReason: "The paper aligns with this venue's research focus area.",
          risks: ["AI explanation temporarily unavailable due to rate limits."],
          suggestions: ["Review the journal's official scope and recent publications."]
        }
      }));
    }
  }

  static async generateSearchQueries(abstract, domain) {
    if (!getAI() && !getGemini()) {
      // Use local keyword extraction for meaningful queries instead of generic terms
      const { generateLocalSearchQueries } = await import('../utils/keywordExtractor.js');
      const localQueries = generateLocalSearchQueries(abstract, domain);
      if (localQueries.length >= 2) {
        logger.info(`[AI] No AI available — using local keyword-based search queries: ${localQueries.join(' | ')}`);
        return localQueries;
      }
      return ["research paper", "study results", "academic findings"];
    }

    const prompt = `Generate 5 OpenAlex search queries (3-7 technical words each) for finding papers related to this abstract. Each query targets a different aspect: core method, problem, innovation, evaluation, broader field. No generic words (study, research, novel, approach). Return ONLY a JSON array of 5 strings.

Domain: ${domain}
Abstract: ${abstract.slice(0, 500)}`;

    try {
      let text = await callWithFallbackGroqFirst(prompt);
      
      const parsed = JSON.parse(text);
      
      const queries = Array.isArray(parsed) ? parsed : (parsed.queries || parsed.searchQueries || Object.values(parsed).find(Array.isArray) || []);
      
      if (Array.isArray(queries) && queries.length > 0) {
        return queries.slice(0, 5).map(String);
      }
      return ["research paper", "study results", "academic findings"];
    } catch (error) {
      logger.error(`AI search queries generation failed: ${error.message}`);
      // Fall back to local keyword-based queries
      const { generateLocalSearchQueries } = await import('../utils/keywordExtractor.js');
      const localQueries = generateLocalSearchQueries(abstract, domain);
      if (localQueries.length >= 2) {
        logger.info(`[AI] LLM failed — using local keyword-based search queries: ${localQueries.join(' | ')}`);
        return localQueries;
      }
      return ["research paper", "study results", "academic findings"];
    }
  }
}
