import { buildReportSummary } from '../report-summary';

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

console.log('\nTesting report summary aggregation');

const weekly = buildReportSummary('2026-06-12 ~ 2026-06-18', [
  {
    storeId: 1,
    storeName: 'A',
    severity: 'normal',
    inspections: 3,
    latestRating: 4.6,
    latestExpBasic: 2.1,
    latestDefectRate: 0.001,
    issueCount: 0,
    latestInspectionSummary: 'A normal',
  },
  {
    storeId: 2,
    storeName: 'B',
    severity: 'warning',
    inspections: 2,
    latestRating: 4.1,
    latestExpBasic: 1.5,
    latestDefectRate: 0.03,
    issueCount: 2,
    latestInspectionSummary: 'B rating dropped',
  },
]);

assert('overview includes period coverage', weekly.overview.includes('2026-06-12 ~ 2026-06-18') && weekly.overview.includes('2家店'));
assert('attention stores use inspection summary reason', weekly.attentionStores[0]?.reason === 'B rating dropped');
assert('recommendations are human readable', weekly.recommendations.some((item) => item.includes('B')));
assert('template source is explicit', weekly.source === 'template');

const totalTests = passed + failed;
console.log(`Result: ${passed}/${totalTests} passed`);

if (failed > 0) process.exit(1);
