const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';
const SQLITE_UTC_PATTERN = /^(20\d{2}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)$/;

export function nowIsoUtc(): string {
  return new Date().toISOString();
}

export function todayShanghaiDate(now = new Date()): string {
  return formatDateInTimeZone(now, SHANGHAI_TIME_ZONE);
}

export function parseAuditTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalized = value.match(SQLITE_UTC_PATTERN) ? value.replace(' ', 'T') + 'Z' : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function auditDateKeyShanghai(value: string | null | undefined): string | null {
  const date = parseAuditTimestamp(value);
  return date ? formatDateInTimeZone(date, SHANGHAI_TIME_ZONE) : null;
}

function formatDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
