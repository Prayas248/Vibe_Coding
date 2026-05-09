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

// Heavy endpoint: 30 analyses per hour per user, with a burst capacity of 10.
// Shield + bot detection because PDF upload is the most abuse-prone surface.
export const arcjetAnalyze = baseClient([
  shield({ mode: 'LIVE' }),
  detectBot({
    mode: 'LIVE',
    allow: ['CATEGORY:SEARCH_ENGINE'],
  }),
  tokenBucket({
    mode: 'LIVE',
    refillRate: 30,
    interval: 3600,
    capacity: 10,
  }),
]);

// Lightweight read endpoints: 200 requests per minute per user.
// No bot rule — these are normal app reads; bot detection would be noisy.
export const arcjetHistory = baseClient([
  shield({ mode: 'LIVE' }),
  slidingWindow({
    mode: 'LIVE',
    interval: 60,
    max: 200,
  }),
]);
