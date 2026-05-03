import { JournalSearchService } from './src/services/journal-search.service.js';

async function runTest() {
  const journalId = 'S133202952'; // Nature Neuroscience
  const venueName = 'Nature Neuroscience';
  
  console.log('Testing ELITE-CENTROID with:', journalId);
  try {
    const result = await JournalSearchService.getJournalRepresentation(journalId, venueName);
    console.log('Result keywords:', result?.keywords);
  } catch (err) {
    console.error('Test failed:', err);
  }
}

runTest();
