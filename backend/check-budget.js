// check-budget.js
// Utility to check OpenAlex, Groq, and Gemini API limits simultaneously

import 'dotenv/config';

async function checkOpenAlex() {
  try {
    const response = await fetch('https://api.openalex.org/works?per_page=1', {
      method: 'HEAD',
      headers: { 'User-Agent': 'VibeApp/1.0' }
    });

    const limit = response.headers.get('x-ratelimit-limit');
    const remaining = response.headers.get('x-ratelimit-remaining');

    if (limit === null || remaining === null) {
      return { service: 'OpenAlex', status: '⚠️  UNKNOWN', detail: 'Rate limit headers missing' };
    }

    const used = parseInt(limit) - parseInt(remaining);
    const remainingVal = parseInt(remaining);
    const pct = ((remainingVal / parseInt(limit)) * 100).toFixed(1);

    let status;
    if (remainingVal <= 0) status = '❌ EXHAUSTED';
    else if (remainingVal < 500) status = '⚠️  LOW';
    else status = '✅ HEALTHY';

    return {
      service: 'OpenAlex',
      status,
      detail: `${remaining}/${limit} remaining (${pct}%) — used ${used} today`
    };
  } catch (err) {
    return { service: 'OpenAlex', status: '❌ ERROR', detail: err.message };
  }
}

async function checkGroq() {
  const key = process.env.GROQ_API_KEY;
  if (!key) return { service: 'Groq', status: '⚠️  NO KEY', detail: 'GROQ_API_KEY not set in .env' };

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 1
      })
    });

    const limitReq = response.headers.get('x-ratelimit-limit-requests');
    const remainReq = response.headers.get('x-ratelimit-remaining-requests');
    const limitTok = response.headers.get('x-ratelimit-limit-tokens');
    const remainTok = response.headers.get('x-ratelimit-remaining-tokens');
    const resetReq = response.headers.get('x-ratelimit-reset-requests');
    const resetTok = response.headers.get('x-ratelimit-reset-tokens');

    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      return {
        service: 'Groq',
        status: '❌ RATE LIMITED',
        detail: `429 — retry after ${retryAfter || 'unknown'}s | Limits: ${remainReq ?? '?'}/${limitReq ?? '?'} req, ${remainTok ?? '?'}/${limitTok ?? '?'} tok`
      };
    }

    if (!response.ok) {
      const body = await response.text();
      return { service: 'Groq', status: '❌ ERROR', detail: `HTTP ${response.status}: ${body.slice(0, 120)}` };
    }

    let status;
    const remReq = parseInt(remainReq);
    if (remReq <= 0) status = '❌ EXHAUSTED';
    else if (remReq < 5) status = '⚠️  LOW';
    else status = '✅ HEALTHY';

    return {
      service: 'Groq',
      status,
      detail: `Requests: ${remainReq}/${limitReq} | Tokens: ${remainTok}/${limitTok} | Resets: req ${resetReq || 'n/a'}, tok ${resetTok || 'n/a'}`
    };
  } catch (err) {
    return { service: 'Groq', status: '❌ ERROR', detail: err.message };
  }
}

async function checkGemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { service: 'Gemini', status: '⚠️  NO KEY', detail: 'GEMINI_API_KEY not set in .env' };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Say hi' }] }],
          generationConfig: { maxOutputTokens: 20 }
        })
      }
    );

    if (response.status === 429) {
      const body = await response.json().catch(() => ({}));
      const msg = body?.error?.message || 'Quota exceeded';
      return { service: 'Gemini', status: '❌ RATE LIMITED', detail: `429 — ${msg.slice(0, 150)}` };
    }

    if (!response.ok) {
      const body = await response.text();
      return { service: 'Gemini', status: '❌ ERROR', detail: `HTTP ${response.status}: ${body.slice(0, 150)}` };
    }

    const data = await response.json();
    const hasCandidate = data?.candidates?.length > 0;

    return {
      service: 'Gemini',
      status: '✅ HEALTHY',
      detail: `gemini-2.5-flash responding (model: ${data?.modelVersion || 'unknown'})`
    };
  } catch (err) {
    return { service: 'Gemini', status: '❌ ERROR', detail: err.message };
  }
}

// Run all checks in parallel
console.log('\n╔══════════════════════════════════════════╗');
console.log('║       API Budget & Status Checker        ║');
console.log('╚══════════════════════════════════════════╝\n');

const results = await Promise.all([checkOpenAlex(), checkGroq(), checkGemini()]);

for (const r of results) {
  console.log(`┌─ ${r.service}`);
  console.log(`│  Status: ${r.status}`);
  console.log(`│  ${r.detail}`);
  console.log('└──────────────────────────────────────────');
}

const healthy = results.filter(r => r.status.includes('✅')).length;
console.log(`\nSummary: ${healthy}/3 services healthy\n`);
