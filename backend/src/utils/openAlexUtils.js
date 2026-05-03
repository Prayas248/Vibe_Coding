/**
 * Reconstructs an abstract from OpenAlex's inverted index format.
 * OpenAlex returns abstracts as: { "The": [0, 5], "dog": [1], "barked": [2], ... }
 * @param {Object} invertedIndex 
 * @returns {string} The reconstructed abstract
 */
export function reconstructAbstract(invertedIndex) {
  if (!invertedIndex) return "";
  
  const entries = Object.entries(invertedIndex);
  const words = [];
  
  for (const [word, positions] of entries) {
    for (const pos of positions) {
      words[pos] = word;
    }
  }
  
  return words.join(' ').trim();
}
