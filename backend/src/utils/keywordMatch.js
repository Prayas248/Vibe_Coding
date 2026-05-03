export function calculateKeywordMatch(extractedKeywords, journalKeywords) {
  if (!extractedKeywords || !journalKeywords || extractedKeywords.length === 0 || journalKeywords.length === 0) return 0;
  
  const extractedLower = extractedKeywords.map(k => k.toLowerCase());
  const journalLower = journalKeywords.map(k => k.toLowerCase());
  
  let matchCount = 0;
  for (const ext of extractedLower) {
    for (const jou of journalLower) {
      if (jou.includes(ext) || ext.includes(jou)) {
        matchCount++;
        break; // Count each extracted keyword match only once
      }
    }
  }
  
  return Math.min(1.0, matchCount / extractedKeywords.length);
}
