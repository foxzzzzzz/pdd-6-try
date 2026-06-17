import { mergeInspectionMetrics } from '../inspection-summary';

let passed = 0;
let failed = 0;

function assert(description: string, condition: boolean, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✅ ${description}`);
  } else {
    failed++;
    console.log(`  ❌ ${description}: ${detail}`);
  }
}

console.log('\n📋 测试: 巡店列表指标摘要');

const inspections = [
  { id: 1, storeId: 10, date: '2026-06-17', status: 'completed' },
  { id: 2, storeId: 11, date: '2026-06-17', status: 'pending' },
];

const metrics = [
  { id: 101, inspectionId: 1, rating: 4.6, defectRate: 0.02, severity: 'warning' },
];

const merged = mergeInspectionMetrics(inspections, metrics);

assert('巡店记录携带对应指标', merged[0].metrics?.rating === 4.6);
assert('巡店记录从指标继承 severity', merged[0].severity === 'warning');
assert('无指标记录默认 normal', merged[1].severity === 'normal');
assert('无指标记录 metrics 为 null', merged[1].metrics === null);

const totalTests = passed + failed;
console.log(`结果: ${passed}/${totalTests} 通过`);

if (failed > 0) process.exit(1);
