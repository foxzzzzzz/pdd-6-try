const SQLITE_UTC_PATTERN = /^(20\d{2}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)$/;

export function parseAuditTimestamp(value?: string | null): Date | null {
  if (!value) return null;
  const normalized = value.match(SQLITE_UTC_PATTERN) ? value.replace(' ', 'T') + 'Z' : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatAuditTime(value?: string | null): string {
  const date = parseAuditTimestamp(value);
  if (!date) return '-';
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

export function formatPlatformLocalTime(value?: string | null): string {
  return value || '?';
}

export function todayShanghaiDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
