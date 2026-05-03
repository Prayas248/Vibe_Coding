/**
 * Curated list of elite venues mapped by domain for hybrid candidate generation.
 * Metadata derived from OpenAlex and venue reputation standards.
 */
export const ELITE_VENUES = {
  cs_ai: [
    { id: 'S4210174169', name: 'NeurIPS', reputation: 0.98, venue_type: 'conference' },
    { id: 'S4210183183', name: 'ICML', reputation: 0.97, venue_type: 'conference' },
    { id: 'S4210178385', name: 'ICLR', reputation: 0.96, venue_type: 'conference' },
    { id: 'S4210166299', name: 'ACL', reputation: 0.96, venue_type: 'conference' },
    { id: 'S4210175510', name: 'EMNLP', reputation: 0.95, venue_type: 'conference' },
    { id: 'S4210178491', name: 'AAAI', reputation: 0.94, venue_type: 'conference' },
    { id: 'S4210178370', name: 'CVPR', reputation: 0.97, venue_type: 'conference' }
  ],
  nlp: [
    { id: 'S4210166299', name: 'ACL', reputation: 0.96, venue_type: 'conference' },
    { id: 'S4210175510', name: 'EMNLP', reputation: 0.95, venue_type: 'conference' },
    { id: 'S4210172602', name: 'NAACL', reputation: 0.94, venue_type: 'conference' },
    { id: 'S147132961', name: 'TACL', reputation: 0.93, venue_type: 'journal' },
    { id: 'S4210212351', name: 'COLING', reputation: 0.90, venue_type: 'conference' }
  ],
  biology: [
    { id: 'S137050573', name: 'Nature', reputation: 0.99, venue_type: 'journal' },
    { id: 'S181057866', name: 'Cell', reputation: 0.99, venue_type: 'journal' },
    { id: 'S117978696', name: 'PLOS Biology', reputation: 0.94, venue_type: 'journal' },
    { id: 'S104193375', name: 'eLife', reputation: 0.93, venue_type: 'journal' },
    { id: 'S174092440', name: 'Molecular Cell', reputation: 0.95, venue_type: 'journal' }
  ],
  neuroscience: [
    { id: 'S2298632',   name: 'Nature Neuroscience',     reputation: 0.98, venue_type: 'journal' },
    { id: 'S45757444',  name: 'Neuron',                   reputation: 0.97, venue_type: 'journal' },
    { id: 'S5555990',   name: 'Journal of Neuroscience',  reputation: 0.95, venue_type: 'journal' },
    { id: 'S118357697', name: 'Brain',                   reputation: 0.96, venue_type: 'journal' },
    { id: 'S117898428', name: 'Cerebral Cortex',         reputation: 0.92, venue_type: 'journal' },
    { id: 'S137773608', name: 'Nature',                   reputation: 0.99, venue_type: 'journal' },
    { id: 'S3880285',   name: 'Science',                  reputation: 0.99, venue_type: 'journal' },
    { id: 'S125754415', name: 'PNAS',                     reputation: 0.97, venue_type: 'journal' },
  ],
  medicine: [
    { id: 'S178652433', name: 'NEJM', reputation: 0.99, venue_type: 'journal' },
    { id: 'S186714077', name: 'The Lancet', reputation: 0.99, venue_type: 'journal' },
    { id: 'S129995116', name: 'JAMA', reputation: 0.99, venue_type: 'journal' },
    { id: 'S185123019', name: 'BMJ', reputation: 0.98, venue_type: 'journal' },
    { id: 'S137785534', name: 'Nature Medicine', reputation: 0.98, venue_type: 'journal' }
  ],
  chemistry: [
    { id: 'S124671488', name: 'JACS', reputation: 0.98, venue_type: 'journal' },
    { id: 'S67393510', name: 'Angewandte Chemie', reputation: 0.98, venue_type: 'journal' },
    { id: 'S158141445', name: 'Nature Chemistry', reputation: 0.98, venue_type: 'journal' },
    { id: 'S196720546', name: 'Chemical Science', reputation: 0.94, venue_type: 'journal' }
  ],
  physics: [
    { id: 'S173516035', name: 'Physical Review Letters', reputation: 0.98, venue_type: 'journal' },
    { id: 'S117215354', name: 'Nature Physics', reputation: 0.98, venue_type: 'journal' },
    { id: 'S176579225', name: 'Science', reputation: 0.99, venue_type: 'journal' }
  ],
  general_stem: [
    { id: 'S137773608', name: 'Nature',  reputation: 0.99, venue_type: 'journal' },
    { id: 'S3880285',   name: 'Science', reputation: 0.99, venue_type: 'journal' },
    { id: 'S125754415', name: 'PNAS',    reputation: 0.97, venue_type: 'journal' },
  ]
};
