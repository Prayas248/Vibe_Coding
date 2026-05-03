import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import logger from '../config/logger.js';

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

async function callGemini(prompt, isJson = true) {
  const genAI = getGemini();
  if (!genAI) throw new Error('Gemini not available');

  const models = ["gemini-2.0-flash", "gemini-2.0-flash-lite"];
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
        console.warn(`[AI] Gemini/${modelName} rate limited, waiting 3s before trying next...`);
        await new Promise(r => setTimeout(r, 3000));
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
  'llama-3.1-70b-versatile',
  'mixtral-8x7b-32768',
  'qwen-qwq-32b'
];

async function callGroqWithFallback(ai, prompt, validator = null) {
  for (const model of GROQ_FALLBACK_MODELS) {
    try {
      console.log(`[AI] Attempting Groq: ${model}`);
      const response = await ai.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: model,
        response_format: { type: "json_object" }
      });
      const text = response.choices[0].message.content;
      if (validator) {
        validator(text);
      }
      return text;
    } catch (err) {
      const isRateLimit = err.status === 429 || err.message?.includes('429') || err.message?.includes('rate');
      const isDecommissioned = err.message?.includes('decommissioned') || err.message?.includes('model_decommissioned');
      const isGarbage = err.message === 'GARBAGE_FEATURES';

      if (isRateLimit || isDecommissioned || isGarbage) {
        const reason = isRateLimit ? 'Rate Limited' : isDecommissioned ? 'Model Retired' : 'Validation Failed';
        console.warn(`[AI] Groq/${model} failed (${reason}), trying next fallback...`);
        // Brief wait on rate limit to let the per-minute window partially reset
        if (isRateLimit) await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      throw err;
    }
  }
  console.warn('[AI] ALL GROQ MODELS EXHAUSTED — Initiating Gemini emergency fallback');
  return callGemini(prompt, true);
}

export class AiService {
  static async extractFeatures(abstract) {
    const ai = getAI();
    if (!ai) {
      logger.warn('AI not initialized, using mock feature extraction.');
      return {
        domain: "Artificial Intelligence",
        keywords: ["machine learning", "neural networks", "data analysis", "prediction", "automation"],
        summary: "This is a mock summary because the GROQ_API_KEY is not configured."
      };
    }

    const prompt = `
Analyze the following research paper abstract holistically to identify its primary research discipline.
Return exactly and ONLY a JSON object with the following fields:
- "domain": The primary research domain. You MUST choose exactly one from this list: 
  "cs_ai", "nlp", "biology", "neuroscience", "medicine", "chemistry", "physics", "general_stem".

Reasoning Rules:
1. Identify the primary discipline: What conference or journal would researchers in this field submit to?
2. Subject Matter vs. Methods: Classify by the subject matter being studied, not the methods used.
3. ML/Stats as a Tool: A paper using ML to study metabolism → chemistry or biology, not cs_ai.
4. NLP vs CS_AI boundary — this is CRITICAL:
   - "nlp": Any paper whose primary contribution is about LANGUAGE, TEXT, or SPEECH.
     This includes: machine translation, language models, attention mechanisms for sequence transduction,
     text generation, question answering, summarization, parsing, sentiment, NLP benchmarks.
     Papers submitted to ACL, EMNLP, NAACL, COLING → nlp.
   - "cs_ai": Core AI/ML theory or non-language tasks.
     This includes: computer vision, image classification, reinforcement learning, graph neural networks,
     generative image models, autonomous systems.
     Papers submitted to NeurIPS, ICML, ICLR, CVPR → cs_ai.
   - If a paper proposes a TRANSFORMER ARCHITECTURE used for MACHINE TRANSLATION or LANGUAGE tasks → nlp.
   - If a paper proposes a vision or general ML architecture unrelated to language → cs_ai.

Domain Guidelines:
- "cs_ai": Core AI/ML theory, computer vision, image understanding, RL, general model architectures not primarily about language.
- "nlp": Natural language processing, computational linguistics, machine translation, language modeling, text tasks.
- "neuroscience": Brain research and nervous system studies.
- "biology": Life sciences, genetics, molecular biology, genomics.
- "medicine": Clinical research, trials, patient care, pharmacology.
- "chemistry": Physical chemistry, analytical chemistry, metabolomics, chemical synthesis.
- "physics": Physical sciences, quantum mechanics, astrophysics.
- "general_stem": Highly interdisciplinary spanning multiple core STEM fields.

Examples — commit these to memory:
- "Transformer, attention mechanism, multi-head attention, encoder-decoder, machine translation, sequence transduction" → nlp
- "BERT, GPT, language model, text classification, question answering" → nlp
- "Convolutional network, image classification, object detection, CIFAR, ImageNet" → cs_ai
- "Reinforcement learning, reward function, policy gradient, game playing" → cs_ai
- "Metabolomics, mass spectrometry, LC-MS, acylcarnitines" → chemistry
- "CRISPR, gene expression, protein folding" → biology
- "Synaptic plasticity, neurons, hippocampus" → neuroscience
- "Randomized controlled trial, clinical outcomes, patient cohort" → medicine

- "keywords": An array of 5 to 8 specific technical keywords from the paper.
  IMPORTANT: Keywords must be multi-word technical phrases specific to this paper's methodology.
  Never return single generic words like "model", "method", "analysis", "study", "paper", "best", "attention".
  Good examples: "scaled dot-product attention", "sequence transduction", "byte-pair encoding"
  Bad examples: "model", "attention", "best", "method"
  Each keyword must be at least 2 words and domain-specific.
- "summary": A short 1-2 sentence summary of the abstract.

Abstract:
${abstract}
`;

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

      let text = await callGroqWithFallback(ai, prompt, validator);
      
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

        // Extract keywords: grab meaningful capitalized or technical words, filter stop words
        const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was', 'were', 'has', 'have', 'been', 'our', 'we', 'in', 'on', 'of', 'to', 'a', 'an', 'is', 'it', 'its', 'by', 'as', 'at', 'be', 'can', 'may', 'also', 'using', 'used', 'based', 'which', 'these', 'their', 'than', 'such', 'more', 'show', 'than', 'into', 'not', 'between', 'while', 'both', 'through', 'each']);
        const rawWords = abstract.match(/\b[a-zA-Z]{4,}\b/g) || [];
        const freq = {};
        rawWords.forEach(w => { const lw = w.toLowerCase(); if (!STOP_WORDS.has(lw)) freq[lw] = (freq[lw] || 0) + 1; });
        const keywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([w]) => w);

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
    const ai = getAI();
    if (!ai) return [];

    const prompt = `
You are an expert academic advisor. Based on the abstract and features, recommend the 5 best REAL-WORLD academic journals or conferences for this paper.

Paper Abstract: ${abstract}
Paper Domain: ${extractedFeatures.domain}
Paper Keywords: ${extractedFeatures.keywords.join(', ')}

Return exactly and ONLY a JSON array of 5 objects. Each object must have:
- "name": The official name of the journal/conference.
- "scope": A 1-sentence description of its official scope.
- "domain": The primary research domain.
- "keywords": An array of 5-8 relevant keywords for the journal.
`;

    try {
      let text = await callGroqWithFallback(ai, prompt);
      
      const parsed = JSON.parse(text);
      // Groq sometimes wraps in a root object if asked for a list, handle both
      const list = Array.isArray(parsed) ? parsed : (parsed.journals || parsed.recommendations || []);

      const validated = z.array(recommendedJournalSchema).safeParse(list);
      return validated.success ? validated.data : [];
    } catch (error) {
      logger.error(`AI journal recommendation failed: ${error.message}`);
      return [];
    }
  }

  static async enrichJournals(candidateJournals, abstract, extractedFeatures) {
    const ai = getAI();
    if (!ai || !candidateJournals || candidateJournals.length === 0) return candidateJournals;

    const journalNames = candidateJournals.map(c => c.name).join(', ');

    const prompt = `
You are an expert academic advisor. I have found potential journals for a research paper using the OpenAlex API.
Please provide the official scope, domain, and 5-8 keywords for EACH of these journals so we can accurately score them.

Paper Abstract: ${abstract}
Journals to enrich: ${journalNames}

Return exactly and ONLY a JSON array of objects. Each object must have:
- "name": The official name of the journal (match exactly from the list provided).
- "scope": A 1-sentence description of its official scope.
- "domain": The primary research domain.
- "keywords": An array of 5-8 relevant keywords for the journal.
`;

    try {
      let text = await callGroqWithFallback(ai, prompt);
      
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
    const ai = getAI();
    if (!ai) return topJournals.map(j => ({ ...j, explanation: { fitReason: "Match based on scope.", risks: [], suggestions: [] } }));

    const prompt = `
You are an expert academic advisor. For EACH of the ${topJournals.length} journals, explain the fit, identify risks, and give suggestions.

Paper Abstract: ${abstract}
Journals selected:
${topJournals.map((j, i) => `${i + 1}. ${j.name} (Scope: ${j.scope})`).join('\n')}

Return exactly and ONLY a JSON object with a single key "explanations", which must be an array of objects. The array must be in the same order as the journals provided.
Each object in the array must have:
- "fitReason": A 1-sentence explanation of why the paper fits this journal.
- "risks": An array of 1-2 strings, describing potential risks.
- "suggestions": An array of 1-2 strings, giving actionable suggestions.
`;

    try {
      let text = await callGroqWithFallback(ai, prompt);
      
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
      return topJournals;
    }
  }

  static async generateSearchQueries(abstract, domain) {
    const ai = getAI();
    if (!ai) {
      return ["research paper", "study results", "academic findings"]; // Fallback if no AI
    }

    const prompt = `
You are an academic search expert. Given this abstract and domain, generate exactly 3 search queries optimized for finding related academic papers in OpenAlex.

Rules:
- Each query should be 3-5 words maximum
- Use specific technical terminology from the abstract
- Avoid generic words like "study", "research", "analysis", "methods", "results"
- Each query should target a different aspect of the paper
- Return ONLY a JSON array of 3 strings, nothing else

Domain: ${domain}
Abstract: ${abstract}

Example output for a neuroscience paper:
["chromatin remodeling neuronal plasticity", "epigenetic regulation brain memory", "histone modification synaptic function"]

Example output for an NLP paper:
["transformer attention mechanism translation", "multilingual sequence transduction", "neural machine translation BLEU"]
`;

    try {
      let text = await callGroqWithFallback(ai, prompt);
      
      const parsed = JSON.parse(text);
      
      const queries = Array.isArray(parsed) ? parsed : (parsed.queries || parsed.searchQueries || Object.values(parsed).find(Array.isArray) || []);
      
      if (Array.isArray(queries) && queries.length > 0) {
        return queries.slice(0, 3).map(String);
      }
      return ["research paper", "study results", "academic findings"];
    } catch (error) {
      logger.error(`AI search queries generation failed: ${error.message}`);
      return ["research paper", "study results", "academic findings"];
    }
  }
}
