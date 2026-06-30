import { sortActionCandidates } from '../routes/action-candidates';

let passed = 0;
let failed = 0;

function assert(description: string, condition: boolean, detail = '') {
  if (condition) {
    passed++;
    console.log(`  OK ${description}`);
  } else {
    failed++;
    console.log(`  FAIL ${description}: ${detail}`);
  }
}

console.log('\nTesting action candidate sorting');

const sorted = sortActionCandidates([
  { id: 1, kind: 'review', reviewCreatedAt: '2026-06-28 09:10:06', createdAt: '2026-06-30T07:00:02.000Z' },
  { id: 2, kind: 'review', reviewCreatedAt: '2026-06-30 07:52:05', createdAt: '2026-06-30T07:00:01.000Z' },
  { id: 3, kind: 'review', reviewCreatedAt: '2026-06-29 22:24:28', createdAt: '2026-06-30T07:00:03.000Z' },
  { id: 4, kind: 'review', reviewCreatedAt: null, createdAt: '2026-07-01T00:00:00.000Z' },
  { id: 5, kind: 'review', storeId: 7, actionType: 'reply', sourceId: 'same-review', reviewCreatedAt: '2026-06-30 09:49:58', createdAt: '2026-06-30T07:00:00.000Z' },
  { id: 6, kind: 'review', storeId: 7, actionType: 'reply', sourceId: 'same-review', reviewCreatedAt: '2026-06-30 09:49:58', createdAt: '2026-06-30T07:30:00.000Z' },
] as any[]);

assert('review candidates sort by review time newest first', sorted.map((row) => row.id).join(',') === '6,2,3,1,4');
assert('duplicate review candidates keep only the newest row', sorted.filter((row) => row.sourceId === 'same-review').length === 1);

const totalTests = passed + failed;
console.log(`Result: ${passed}/${totalTests} passed`);

if (failed > 0) process.exit(1);
