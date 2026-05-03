/**
 * Local keyword extraction utility for research abstracts.
 * Extracts meaningful keywords using frequency analysis and stopword filtering.
 */

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'if', 'in', 'into', 'is', 'it',
  'no', 'not', 'of', 'on', 'or', 'such', 'that', 'the', 'their', 'then', 'there', 'these',
  'they', 'this', 'to', 'was', 'will', 'with', 'from', 'have', 'been', 'were', 'which', 'when',
  'where', 'who', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some',
  'than', 'too', 'very', 'can', 'should', 'would', 'could', 'about', 'above', 'after', 'again',
  'against', 'below', 'between', 'down', 'during', 'once', 'only', 'out', 'over', 'under',
  'further', 'here', 'just', 'now', 'while', 'using', 'used', 'paper', 'research', 'study',
  'based', 'proposed', 'results', 'analysis', 'method', 'methods', 'model', 'models', 'system',
  'data', 'approach', 'performance', 'using', 'also', 'provide', 'presents', 'presented'
]);

/**
 * Extracts 5-8 meaningful keywords from an abstract.
 * @param {string} text 
 * @returns {string[]}
 */
export function extractKeywordsLocal(text) {
  if (!text) return [];

  // 1. Lowercase and remove punctuation/special characters
  const cleanText = text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');

  // 2. Tokenize into words
  const words = cleanText.split(/\s+/);

  // 3. Filter out stopwords, short words, and irrelevant terms
  const filteredWords = words.filter(word => {
    return word.length >= 4 && !STOPWORDS.has(word) && isNaN(word);
  });

  // 4. Count word frequencies
  const frequencies = {};
  for (const word of filteredWords) {
    frequencies[word] = (frequencies[word] || 0) + 1;
  }

  // Sort unigrams for fallback use
  const sortedUnigrams = Object.entries(frequencies).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0].length - a[0].length;
  }).map(entry => entry[0]);

  // 5. Extract bigrams and trigrams from the ORIGINAL word order (preserving adjacency)
  const bigrams = {};
  const trigrams = {};
  const allWords = cleanText.split(/\s+/).filter(w => w.length >= 3);
  
  for (let i = 0; i < allWords.length - 1; i++) {
    const w1 = allWords[i], w2 = allWords[i + 1];
    // Only form n-grams where at least one word passes our quality filter
    const w1Good = !STOPWORDS.has(w1) && w1.length >= 4;
    const w2Good = !STOPWORDS.has(w2) && w2.length >= 4;
    
    if (w1Good && w2Good) {
      const bi = `${w1} ${w2}`;
      bigrams[bi] = (bigrams[bi] || 0) + 1;
    }
    
    if (i < allWords.length - 2) {
      const w3 = allWords[i + 2];
      const w3Good = !STOPWORDS.has(w3) && w3.length >= 4;
      // For trigrams: require all 3 words to be meaningful
      if (w1Good && w2Good && w3Good) {
        const tri = `${w1} ${w2} ${w3}`;
        trigrams[tri] = (trigrams[tri] || 0) + 1;
      }
    }
  }

  // 6. Score n-grams: prefer phrases where words have high individual frequency (more representative)
  const scored = [];

  // Trigrams: score by word frequency sum + repetition
  Object.entries(trigrams)
    .forEach(([phrase, count]) => {
      const words = phrase.split(' ');
      const freqSum = words.reduce((s, w) => s + (frequencies[w] || 0), 0);
      scored.push({ phrase, score: count * 3 + freqSum * 0.5 + phrase.length * 0.02 });
    });

  // Bigrams: same approach
  Object.entries(bigrams)
    .forEach(([phrase, count]) => {
      const words = phrase.split(' ');
      const freqSum = words.reduce((s, w) => s + (frequencies[w] || 0), 0);
      scored.push({ phrase, score: count * 2 + freqSum * 0.4 + phrase.length * 0.01 });
    });

  // Add top unigrams as fallback (only high-frequency domain terms)
  Object.entries(frequencies)
    .filter(([word, count]) => count >= 2 && word.length >= 6)
    .forEach(([phrase, count]) => scored.push({ phrase, score: count * 0.8 }));

  // 7. Sort by score, deduplicate (remove phrases that overlap with better selections)
  scored.sort((a, b) => b.score - a.score);

  const selected = [];
  for (const item of scored) {
    if (selected.length >= 10) break;
    // Skip if this phrase shares >50% of words with an already-selected phrase
    const itemWords = new Set(item.phrase.split(' '));
    const isRedundant = selected.some(s => {
      const sWords = new Set(s.split(' '));
      const overlap = [...itemWords].filter(w => sWords.has(w)).length;
      return overlap >= Math.min(itemWords.size, sWords.size) * 0.6;
    });
    if (!isRedundant) {
      selected.push(item.phrase);
    }
  }

  return selected.length >= 3 ? selected : sortedUnigrams.slice(0, 8);
}

/**
 * Generates diverse search queries from an abstract for OpenAlex.
 * Uses extracted n-grams to create 4-5 targeted queries.
 * @param {string} text
 * @param {string} domain - detected domain (optional)
 * @returns {string[]}
 */
export function generateLocalSearchQueries(text, domain = '') {
  if (!text) return [];

  const keywords = extractKeywordsLocal(text);
  if (keywords.length === 0) return [];

  const queries = [];

  // Query 1: Best single keyword phrase (already multi-word from n-gram extraction)
  if (keywords[0]) {
    queries.push(keywords[0]);
  }

  // Query 2: Second best keyword phrase
  if (keywords[1]) {
    queries.push(keywords[1]);
  }

  // Query 3: First sentence key terms (natural language search works well on OpenAlex)
  const firstSentence = text.split(/[.!?]/).find(s => s.trim().length > 30);
  if (firstSentence) {
    const cleanSentence = firstSentence.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
    const words = cleanSentence.split(/\s+/).filter(w => w.length >= 4 && !STOPWORDS.has(w));
    if (words.length >= 3) {
      queries.push(words.slice(0, 5).join(' '));
    }
  }

  // Query 4: Domain-specific + top keyword
  if (domain && keywords.length >= 1) {
    const domainTerms = {
      'cs_ai': 'machine learning',
      'nlp': 'natural language processing',
      'neuroscience': 'neuroscience brain',
      'biology': 'molecular biology',
      'medicine': 'clinical medical',
      'chemistry': 'chemistry chemical',
      'physics': 'physics',
      'general_stem': 'science'
    };
    const domainPrefix = domainTerms[domain] || '';
    if (domainPrefix) {
      // Use just the first word or two from the top keyword to keep query short
      const keyTerms = keywords[0].split(' ').slice(0, 2).join(' ');
      queries.push(`${domainPrefix} ${keyTerms}`);
    }
  }

  // Query 5: Third keyword for breadth (different aspect)
  if (keywords.length >= 3) {
    queries.push(keywords[2]);
  }

  return queries.filter(q => q && q.trim().length > 5).slice(0, 5);
}

/**
 * KeyBERT-style keyword extraction using the local embedding model.
 * Extracts candidate n-grams, embeds them + the full abstract,
 * and ranks candidates by cosine similarity to the abstract embedding.
 * @param {string} text - The abstract text
 * @param {Function} getEmbedding - Async function that returns embedding vector for a string
 * @returns {Promise<string[]>} Top 8-10 keywords ranked by semantic relevance
 */
export async function extractKeywordsWithEmbeddings(text, getEmbedding) {
  if (!text || !getEmbedding) return extractKeywordsLocal(text);

  const cleanText = text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
  const allWords = cleanText.split(/\s+/).filter(w => w.length >= 3);

  // Generate candidate phrases: bigrams and trigrams
  const candidates = new Set();

  for (let i = 0; i < allWords.length - 1; i++) {
    const w1 = allWords[i], w2 = allWords[i + 1];
    const w1Good = !STOPWORDS.has(w1) && w1.length >= 4;
    const w2Good = !STOPWORDS.has(w2) && w2.length >= 4;

    if (w1Good && w2Good) {
      candidates.add(`${w1} ${w2}`);
    }

    if (i < allWords.length - 2) {
      const w3 = allWords[i + 2];
      const w3Good = !STOPWORDS.has(w3) && w3.length >= 4;
      if (w1Good && w2Good && w3Good) {
        candidates.add(`${w1} ${w2} ${w3}`);
      }
    }
  }

  // Also add high-frequency unigrams as candidates
  const freq = {};
  allWords.filter(w => !STOPWORDS.has(w) && w.length >= 5).forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  Object.entries(freq).filter(([, c]) => c >= 2).forEach(([w]) => candidates.add(w));

  if (candidates.size === 0) return extractKeywordsLocal(text);

  // Embed the full abstract
  const abstractEmbedding = await getEmbedding(text.substring(0, 512));

  // Embed all candidates in parallel
  const candidateArr = Array.from(candidates);
  const candidateEmbeddings = await Promise.all(
    candidateArr.map(c => getEmbedding(c))
  );

  // Cosine similarity
  function cosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
    }
    return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  // Score and rank
  const scored = candidateArr.map((phrase, i) => ({
    phrase,
    score: cosine(abstractEmbedding, candidateEmbeddings[i])
  })).sort((a, b) => b.score - a.score);

  // Deduplicate: skip phrases that share >50% words with a higher-ranked selection
  const selected = [];
  for (const item of scored) {
    if (selected.length >= 10) break;
    const itemWords = new Set(item.phrase.split(' '));
    const isRedundant = selected.some(s => {
      const sWords = new Set(s.split(' '));
      const overlap = [...itemWords].filter(w => sWords.has(w)).length;
      return overlap >= Math.min(itemWords.size, sWords.size) * 0.6;
    });
    if (!isRedundant) selected.push(item.phrase);
  }

  return selected.length >= 3 ? selected : extractKeywordsLocal(text);
}
