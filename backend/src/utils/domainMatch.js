export function calculateDomainMatch(extractedDomain, journalDomain, journalKeywords = [], journalName = '') {
  if (!extractedDomain || !journalDomain) return 0.5; // Unknown → neutral, not penalizing
  
  const ext = extractedDomain.toLowerCase().trim();
  const jou = journalDomain.toLowerCase().trim();
  const jName = (journalName || '').toLowerCase();
  
  // Build a combined journal text from domain + all keywords for broader matching
  const journalText = [jou, ...(journalKeywords || []).map(k => k.toLowerCase())].join(' ');
  
  // Direct match or inclusion
  if (ext === jou) return 1.0;
  if (ext.includes(jou) || jou.includes(ext)) return 0.9;
  
  // Map our extracted domain acronyms to full names and related terms
  const DOMAIN_FAMILIES = {
    nlp: ['natural language processing', 'computational linguistics', 'language', 'linguistics', 
          'machine translation', 'text', 'speech', 'information retrieval', 'artificial intelligence',
          'computer science', 'computing', 'deep learning', 'neural network', 'transformer',
          'attention', 'sequence', 'encoder', 'decoder', 'nlp', 'machine learning',
          'computation', 'learning systems', 'intelligent systems', 'pattern recognition'],
    cs_ai: ['artificial intelligence', 'machine learning', 'computer science', 'computing',
            'deep learning', 'neural network', 'computer vision', 'reinforcement learning',
            'informatics', 'information systems', 'pattern recognition', 'data mining',
            'computation', 'learning systems', 'intelligent systems', 'signal processing'],
    neuroscience: ['neuroscience', 'brain', 'neural', 'neuron', 'cognitive', 'cortex', 
                   'hippocampus', 'synaptic', 'neuroimaging', 'psychiatry'],
    biology: ['biology', 'cell', 'molecular', 'gene', 'genomics', 'protein', 'evolution',
              'ecology', 'biochemistry', 'genetics', 'microbiology'],
    medicine: ['medicine', 'clinical', 'medical', 'health', 'disease', 'patient',
               'therapy', 'pharmacology', 'surgery', 'oncology', 'cardiology'],
    chemistry: ['chemistry', 'chemical', 'catalysis', 'synthesis', 'molecular', 'analytical',
                'organic', 'inorganic', 'spectroscopy', 'polymer'],
    physics: ['physics', 'quantum', 'particle', 'thermodynamics', 'astrophysics',
              'optics', 'condensed matter', 'electromagnetic', 'mechanics']
  };

  const extFamily = DOMAIN_FAMILIES[ext] || [ext];
  // Counter-check: if journal topics/keywords clearly belong to a different domain, cap the score
  // Prevents bioinformatics/medicine journals from matching CS/NLP just because they use ML keywords
  const OFF_DOMAIN_SIGNALS = {
    nlp: ['bioinformatics', 'biomedical', 'clinical', 'medical', 'oncology', 'cardiology', 'surgery',
          'ecology', 'geology', 'pharmacology', 'chemistry', 'physics', 'astronomy', 'agriculture',
          'medicine', 'biology', 'genomics', 'proteomics', 'animal', 'brain', 'neuron', 'cortex',
          'hippocampus', 'synaptic', 'cognitive neuroscience', 'dementia', 'optogenetics',
          'cell biology', 'molecular biology', 'plant', 'zoology', 'anatomy', 'physiology',
          'teaching', 'efl', 'esl', 'education', 'pedagogy', 'rehabilitation', 'eeg',
          'brain-computer', 'prosthetic', 'second language acquisition', 'voice disorder',
          'memory and language', 'psycholinguistics', 'language acquisition', 'language disorders'],
    cs_ai: ['bioinformatics', 'biomedical', 'clinical', 'medical', 'oncology', 'ecology',
            'geology', 'pharmacology', 'chemistry', 'physics', 'astronomy', 'agriculture',
            'medicine', 'biology', 'genomics', 'animal', 'brain', 'neuron', 'cortex',
            'hippocampus', 'synaptic', 'dementia', 'optogenetics', 'plant', 'zoology',
            'teaching', 'efl', 'esl', 'education', 'pedagogy', 'rehabilitation', 'eeg',
            'brain-computer', 'prosthetic'],
  };
  const offDomainTerms = OFF_DOMAIN_SIGNALS[ext] || [];
  // Check journal's primary topic, top keywords, AND journal name for off-domain signals
  // Use COUNT-based approach: require 2+ signals from topics/keywords to flag,
  // but a single match in the journal NAME is sufficient (e.g., "PLoS Biology")
  const topKeywords = (journalKeywords || []).slice(0, 5).map(k => k.toLowerCase()).join(' ');
  const nameHit = offDomainTerms.some(t => jName.includes(t));
  const topicHitCount = offDomainTerms.filter(t => jou.includes(t) || topKeywords.includes(t)).length;
  const isOffDomain = nameHit || topicHitCount >= 2;
  
  // Check if journal domain text matches any term in the paper's domain family
  if (extFamily.some(term => jou.includes(term))) return isOffDomain ? 0.40 : 0.85;
  
  // Check if any of the journal's full keywords match the paper's domain family
  if (extFamily.some(term => journalText.includes(term))) return isOffDomain ? 0.35 : 0.80;
  
  // NLP and CS_AI are closely related — cross-check both families against journal text
  if (ext === 'nlp' || ext === 'cs_ai') {
    const bothFamilies = [...DOMAIN_FAMILIES.nlp, ...DOMAIN_FAMILIES.cs_ai];
    if (bothFamilies.some(t => journalText.includes(t))) return isOffDomain ? 0.40 : 0.75;
  }
  
  // Check cross-domain relatedness (bio ↔ medicine, etc.)
  const RELATED_DOMAINS = {
    biology: ['medicine', 'neuroscience', 'chemistry'],
    medicine: ['biology', 'neuroscience', 'chemistry'],
    neuroscience: ['biology', 'medicine'],
    chemistry: ['biology', 'physics', 'medicine'],
    physics: ['chemistry']
  };
  
  const related = RELATED_DOMAINS[ext] || [];
  for (const relDomain of related) {
    if (DOMAIN_FAMILIES[relDomain]?.some(t => journalText.includes(t))) return 0.6;
  }
  
  return 0.3; // Unrelated domain — moderate penalty, not catastrophic
}
