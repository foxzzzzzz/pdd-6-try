import { buildDailyReport, buildMonthlyReport, buildWeeklyReport } from '../report-service';

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

console.log('\nTesting report service aggregation');

const stores = [
  { id: 1, name: 'Store A' },
  { id: 2, name: 'Store B' },
];

const inspections = [
  {
    id: 1,
    storeId: 1,
    date: '2026-06-18',
    status: 'completed',
    duration: 20,
    completionRate: 1,
    summary: 'older summary',
    createdAt: '2026-06-18 08:00:00',
  },
  {
    id: 2,
    storeId: 1,
    date: '2026-06-18',
    status: 'completed',
    duration: 25,
    completionRate: 1,
    summary: 'latest summary',
    createdAt: '2026-06-18 09:00:00',
  },
  {
    id: 3,
    storeId: 2,
    date: '2026-06-18',
    status: 'failed',
    duration: 10,
    completionRate: 0.2,
    summary: 'login failed',
    createdAt: '2026-06-18 09:30:00',
  },
];

const metrics = [
  { id: 1, storeId: 1, inspectionId: 1, date: '2026-06-18', rating: 4.2, defectRate: 0.02, expBasic: 1.7, severity: 'warning', createdAt: '2026-06-18 08:01:00' },
  { id: 2, storeId: 1, inspectionId: 2, date: '2026-06-18', rating: 4.6, defectRate: 0.01, expBasic: 2.1, severity: 'normal', createdAt: '2026-06-18 09:01:00' },
  { id: 3, storeId: 1, inspectionId: 4, date: '2026-06-17', rating: 4.4, defectRate: 0.03, expBasic: 1.9, severity: 'warning', createdAt: '2026-06-17 09:00:00' },
  { id: 4, storeId: 1, inspectionId: 5, date: '2026-06-11', rating: 4.1, defectRate: 0.04, expBasic: 1.8, severity: 'warning', createdAt: '2026-06-11 09:00:00' },
  { id: 5, storeId: 1, inspectionId: 6, date: '2026-06-04', rating: 4.0, defectRate: 0.05, expBasic: 1.6, severity: 'warning', createdAt: '2026-06-04 09:00:00' },
];

const issues = [
  { id: 1, storeId: 1, createdAt: '2026-06-18 10:00:00', rectificationStatus: 'pending' },
  { id: 2, storeId: 1, createdAt: '2026-06-19 10:00:00', rectificationStatus: 'pending' },
  { id: 3, storeId: 1, createdAt: '2026-06-17 10:00:00', rectificationStatus: 'closed' },
];

const daily = buildDailyReport({ date: '2026-06-18', stores, inspections, metrics, issues });
assert('daily includes failed inspection without metrics', daily.stores.some((store) => store.storeId === 2 && store.status === 'failed'));
assert('daily chooses latest same-day inspection summary', daily.stores.find((store) => store.storeId === 1)?.latestInspectionSummary === 'latest summary');
assert('daily excludes future issues', daily.stores.find((store) => store.storeId === 1)?.issueCount === 1);

const weekly = buildWeeklyReport({ today: '2026-06-18', stores, inspections, metrics, issues });
assert('weekly uses stable numeric latest defect rate', typeof weekly.stores.find((store) => store.storeId === 1)?.latestDefectRate === 'number');
assert('weekly excludes metrics older than 7 days', weekly.stores.find((store) => store.storeId === 1)?.inspections === 3);

const monthly = buildMonthlyReport({ today: '2026-06-18', stores, inspections, metrics, issues });
assert('monthly groups trend by calendar week', monthly.stores.find((store) => store.storeId === 1)?.weeklyTrend?.length === 3);
assert('monthly exposes generated summary in summary.generated', Boolean(monthly.summary.generated?.overview));

const totalTests = passed + failed;
console.log(`Result: ${passed}/${totalTests} passed`);

if (failed > 0) process.exit(1);
