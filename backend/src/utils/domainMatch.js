export function calculateDomainMatch(extractedDomain, journalDomain) {
  if (!extractedDomain || !journalDomain) return 0;
  
  const ext = extractedDomain.toLowerCase().trim();
  const jou = journalDomain.toLowerCase().trim();
  
  // Direct match or inclusion
  if (ext === jou) return 1.0;
  if (ext.includes(jou) || jou.includes(ext)) return 0.9;
  
  // Map our extracted domain acronyms to full names
  const extMapped = ext === 'nlp' ? 'natural language processing' : 
                    ext === 'cs_ai' ? 'artificial intelligence' : ext;

  if (extMapped === jou) return 1.0;
  if (extMapped.includes(jou) || jou.includes(extMapped)) return 0.9;
  
  // Common academic domain mapping (AI/NLP/CV -> Computer Science)
  const csSubfields = ['artificial intelligence', 'natural language processing', 'computer vision', 'machine learning', 'robotics', 'nlp', 'cs_ai'];
  const csJournals = ['computer science', 'computing', 'informatics', 'information systems', 'information technology', 'artificial intelligence'];
  
  const isExtCS = csSubfields.some(s => extMapped.includes(s)) || extMapped.includes('computer science');
  const isJouCS = csJournals.some(s => jou.includes(s)) || jou.includes('artificial intelligence');
  
  if (isExtCS && isJouCS) return 0.7; // Related CS domains
  
  return 0.2; // Baseline for academic overlap
}
