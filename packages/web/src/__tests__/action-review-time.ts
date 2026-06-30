import { formatReviewDisplayTime } from '../pages/ActionReview';

function assert(name: string, condition: boolean) {
  if (!condition) {
    console.error(`FAIL ${name}`);
    process.exitCode = 1;
    return;
  }
  console.log(`OK ${name}`);
}

assert(
  'uses platform review time when present',
  formatReviewDisplayTime({ reviewCreatedAt: '2026-06-29 12:56:16', createdAt: '2026-06-29 06:46:32' }).includes('2026'),
);

assert(
  'does not fall back to action created time when review time is missing',
  formatReviewDisplayTime({ reviewCreatedAt: null, createdAt: '2026-06-29 06:46:32' }) === '?',
);
