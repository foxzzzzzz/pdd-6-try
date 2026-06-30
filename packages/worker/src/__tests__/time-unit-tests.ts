import { auditDateKeyShanghai, todayShanghaiDate } from '@pdd-inspector/core';

function assert(name: string, condition: boolean) {
  if (!condition) {
    console.error(`❌ ${name}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✅ ${name}`);
}

console.log('\nTime semantics');

assert(
  'Shanghai business date does not use previous UTC date after local midnight',
  todayShanghaiDate(new Date('2026-06-28T16:30:00.000Z')) === '2026-06-29',
);

assert(
  'SQLite UTC audit timestamp maps to Shanghai date',
  auditDateKeyShanghai('2026-06-29 16:30:00') === '2026-06-30',
);

assert(
  'ISO UTC audit timestamp maps to Shanghai date',
  auditDateKeyShanghai('2026-06-29T16:30:00.000Z') === '2026-06-30',
);
