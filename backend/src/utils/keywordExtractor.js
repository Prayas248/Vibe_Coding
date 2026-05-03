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

  // 5. Sort by frequency and length (longer words often more specific)
  const sortedWords = Object.entries(frequencies).sort((a, b) => {
    // Primary sort: frequency
    if (b[1] !== a[1]) return b[1] - a[1];
    // Secondary sort: length (prefer specific technical terms)
    return b[0].length - a[0].length;
  });

  // 6. Return top 5-8 keywords
  return sortedWords.slice(0, 8).map(entry => entry[0]);
}
