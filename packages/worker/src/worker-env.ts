export function parseApprovalFlag(workerValue: string | undefined, legacyValue: string | undefined, fallback: boolean): boolean {
  const value = workerValue ?? legacyValue;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}
