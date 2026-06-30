import { formatAuditTime, formatPlatformLocalTime } from '../time';

function assert(name: string, condition: boolean) {
  if (!condition) {
    console.error(`❌ ${name}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✅ ${name}`);
}

assert(
  'formats SQLite UTC audit timestamp as Shanghai time',
  formatAuditTime('2026-06-29 06:46:32').includes('14:46:32'),
);

assert(
  'formats ISO UTC audit timestamp as Shanghai time',
  formatAuditTime('2026-06-29T06:46:32.000Z').includes('14:46:32'),
);

assert(
  'keeps platform local time unchanged',
  formatPlatformLocalTime('2026-06-29 08:26:45') === '2026-06-29 08:26:45',
);
