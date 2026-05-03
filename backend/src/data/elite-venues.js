/**
 * Curated list of elite venues mapped by domain for hybrid candidate generation.
 * Metadata derived from OpenAlex and venue reputation standards.
 * IDs verified against OpenAlex API on 2026-05-03.
 */
export const ELITE_VENUES = {
  cs_ai: [
    { id: 'S4306420609', name: 'NeurIPS', reputation: 0.98, venue_type: 'conference' },
    { id: 'S4306419644', name: 'ICML', reputation: 0.97, venue_type: 'conference' },
    { id: 'S4306419637', name: 'ICLR', reputation: 0.96, venue_type: 'conference' },
    { id: 'S4306420508', name: 'ACL', reputation: 0.96, venue_type: 'conference' },
    { id: 'S4306418267', name: 'EMNLP', reputation: 0.95, venue_type: 'conference' },
    { id: 'S4210191458', name: 'AAAI', reputation: 0.94, venue_type: 'conference' },
    { id: 'S4363607701', name: 'CVPR', reputation: 0.97, venue_type: 'conference' },
    { id: 'S118988714', name: 'JMLR', reputation: 0.95, venue_type: 'journal' },
    { id: 'S139930977', name: 'JAIR', reputation: 0.92, venue_type: 'journal' },
    { id: 'S199944782', name: 'IEEE TPAMI', reputation: 0.96, venue_type: 'journal' },
  ],
  nlp: [
    { id: 'S4306420508', name: 'ACL', reputation: 0.96, venue_type: 'conference' },
    { id: 'S4306418267', name: 'EMNLP', reputation: 0.95, venue_type: 'conference' },
    { id: 'S4306420633', name: 'NAACL', reputation: 0.94, venue_type: 'conference' },
    { id: 'S2729999759', name: 'TACL', reputation: 0.93, venue_type: 'journal' },
    { id: 'S4306419219', name: 'COLING', reputation: 0.90, venue_type: 'conference' },
    { id: 'S155526855', name: 'Computational Linguistics', reputation: 0.93, venue_type: 'journal' },
    { id: 'S4306420609', name: 'NeurIPS', reputation: 0.98, venue_type: 'conference' },
    { id: 'S4306419644', name: 'ICML', reputation: 0.97, venue_type: 'conference' },
    { id: 'S4306419637', name: 'ICLR', reputation: 0.96, venue_type: 'conference' },
  ],
  biology: [
    { id: 'S137773608', name: 'Nature', reputation: 0.99, venue_type: 'journal' },
    { id: 'S110447773', name: 'Cell', reputation: 0.99, venue_type: 'journal' },
    { id: 'S154343897', name: 'PLOS Biology', reputation: 0.94, venue_type: 'journal' },
    { id: 'S1336409049', name: 'eLife', reputation: 0.93, venue_type: 'journal' },
    { id: 'S156208185', name: 'Molecular Cell', reputation: 0.95, venue_type: 'journal' },
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
    { id: 'S62468778', name: 'NEJM', reputation: 0.99, venue_type: 'journal' },
    { id: 'S49861241', name: 'The Lancet', reputation: 0.99, venue_type: 'journal' },
    { id: 'S4306400883', name: 'JAMA', reputation: 0.99, venue_type: 'journal' },
    { id: 'S192814187', name: 'BMJ', reputation: 0.98, venue_type: 'journal' },
    { id: 'S203256638', name: 'Nature Medicine', reputation: 0.98, venue_type: 'journal' },
  ],
  chemistry: [
    { id: 'S111155417', name: 'JACS', reputation: 0.98, venue_type: 'journal' },
    { id: 'S67393510', name: 'Angewandte Chemie', reputation: 0.98, venue_type: 'journal' },
    { id: 'S202193212', name: 'Nature Chemistry', reputation: 0.98, venue_type: 'journal' },
    { id: 'S184645833', name: 'Chemical Science', reputation: 0.94, venue_type: 'journal' },
  ],
  physics: [
    { id: 'S24807848', name: 'Physical Review Letters', reputation: 0.98, venue_type: 'journal' },
    { id: 'S156274416', name: 'Nature Physics', reputation: 0.98, venue_type: 'journal' },
    { id: 'S3880285', name: 'Science', reputation: 0.99, venue_type: 'journal' },
  ],
  general_stem: [
    { id: 'S137773608', name: 'Nature',  reputation: 0.99, venue_type: 'journal' },
    { id: 'S3880285',   name: 'Science', reputation: 0.99, venue_type: 'journal' },
    { id: 'S125754415', name: 'PNAS',    reputation: 0.97, venue_type: 'journal' },
  ]
};
