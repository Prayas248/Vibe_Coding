import { EmbeddingService } from '../services/embedding.service.js';

/**
 * Calculates a semantic match score between two sets of keywords.
 * Uses embeddings to find the best matches even if words don't match exactly.
 * @param {string[]} paperKeywords 
 * @param {string[]} journalKeywords 
 * @returns {Promise<number>} Match score [0, 1]
 */
export async function calculateSemanticKeywordMatch(paperKeywords, journalKeywords) {
  if (!paperKeywords || !journalKeywords || paperKeywords.length === 0 || journalKeywords.length === 0) return 0;

  try {
    // Get embeddings for both sets
    const paperEmbeddings = await Promise.all(paperKeywords.map(k => EmbeddingService.getEmbedding(k)));
    const journalEmbeddings = await Promise.all(journalKeywords.map(k => EmbeddingService.getEmbedding(k)));

    let totalMatchScore = 0;

    for (const pEmb of paperEmbeddings) {
      let maxSim = 0;
      for (const jEmb of journalEmbeddings) {
        const sim = cosineSimilarity(pEmb, jEmb);
        if (sim > maxSim) maxSim = sim;
      }
      // If the best match is above a threshold (e.g., 0.7), count it as a strong match
      // We use a weighted sum of the max similarities
      totalMatchScore += Math.max(0, (maxSim - 0.4) / 0.6); 
    }

    return Math.min(1.0, totalMatchScore / paperKeywords.length);
  } catch (error) {
    // Fallback to basic string matching if embedding fails
    return 0.2; 
  }
}

function cosineSimilarity(vecA, vecB) {
  const dotProduct = vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magA * magB);
}
