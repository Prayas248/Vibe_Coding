// check-budget.js
// Utility to check OpenAlex API rate limit status

async function checkOpenAlexBudget() {
  console.log('\n--- Checking OpenAlex API Status ---');
  
  try {
    // HEAD request to minimize bandwidth and processing
    const response = await fetch('https://api.openalex.org/works?per_page=1', {
      method: 'HEAD',
      headers: { 'User-Agent': 'VibeApp/1.0' }
    });

    const limit = response.headers.get('x-ratelimit-limit');
    const remaining = response.headers.get('x-ratelimit-remaining');
    
    if (limit === null || remaining === null) {
      console.warn('⚠️ Could not find rate limit headers. OpenAlex may be operating without limits or headers have changed.');
      return;
    }

    const used = parseInt(limit) - parseInt(remaining);

    console.log(`Daily Limit:  ${limit} requests`);
    console.log(`Used today:   ${used}`);
    console.log(`Remaining:    ${remaining}`);
    
    const remainingVal = parseInt(remaining);
    if (remainingVal <= 0) {
      console.log('\n❌ STATUS: BUDGET EXHAUSTED');
      console.log('The pipeline will use static Fallback Mode (Curated Elite Venues) until the limit resets.');
    } else if (remainingVal < 500) {
      console.log('\n⚠️ STATUS: LOW BUDGET');
      console.log('Consider reducing search queries or waiting for a reset.');
    } else {
      console.log('\n✅ STATUS: HEALTHY');
      console.log('OpenAlex is fully available for dynamic venue discovery.');
    }
    console.log('------------------------------------\n');

  } catch (error) {
    console.error('\n❌ CONNECTION ERROR:', error.message);
    console.log('Check your internet connection or if the OpenAlex API is down.\n');
  }
}

checkOpenAlexBudget();
