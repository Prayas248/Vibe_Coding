import arcjet, { shield, detectBot, tokenBucket, slidingWindow } from '@arcjet/node';

const ARCJET_KEY = process.env.ARCJET_KEY;

export const arcjetEnabled = Boolean(ARCJET_KEY);

if (!arcjetEnabled) {
  console.warn('[ARCJET] ARCJET_KEY is missing — protection middleware will fail open.');
}

const baseClient = (rules) =>
  arcjet({
    key: ARCJET_KEY ?? 'no-key-fail-open',
    characteristics: ['userId'],
    rules,
  });

// Heavy endpoint: 5 full analyses per hour per user.
// Shield + bot detection because PDF upload is the most abuse-prone surface.
export const arcjetAnalyze = baseClient([
  shield({ mode: 'LIVE' }),
  detectBot({
    mode: 'LIVE',
    allow: ['CATEGORY:SEARCH_ENGINE'],
  }),
  tokenBucket({
    mode: 'LIVE',
    refillRate: 5,
    interval: 3600,
    capacity: 5,
  }),
]);

// Lightweight read endpoints: 60 requests per minute per user.
// No bot rule — these are normal app reads; bot detection would be noisy.
export const arcjetHistory = baseClient([
  shield({ mode: 'LIVE' }),
  slidingWindow({
    mode: 'LIVE',
    interval: 60,
    max: 60,
  }),
]);
