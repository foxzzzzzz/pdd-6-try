import type { AnomalyDetection, PilotUnmetItem } from '@pdd-inspector/core';

export function detectAnomaliesByRules(
  current: Record<string, unknown>,
  historical: Record<string, unknown>[],
): AnomalyDetection {
  const flags: string[] = [];
  const avg = computeAverages(historical);

  const rating = asNumber(current.rating);
  if (rating != null && avg.rating != null) {
    const diff = rating - avg.rating;
    if (diff <= -0.3) flags.push(`店铺星级下降${Math.abs(diff).toFixed(2)} (从${avg.rating.toFixed(2)}到${rating})`);
    else if (diff <= -0.1) flags.push(`店铺星级小幅下降${Math.abs(diff).toFixed(2)}`);
  }

  const defectRate = asNumber(current.defectRate);
  if (defectRate != null && avg.defectRate != null) {
    const diff = defectRate - avg.defectRate;
    if (diff >= 0.03) flags.push(`劣质率上升${(diff * 100).toFixed(1)}% (当前${(defectRate * 100).toFixed(1)}%)`);
    else if (diff >= 0.01) flags.push(`劣质率小幅上升${(diff * 100).toFixed(1)}%`);
  }

  const expBasic = asNumber(current.expBasic);
  if (expBasic != null && avg.expBasic != null && avg.expBasic > 0) {
    const change = (expBasic - avg.expBasic) / avg.expBasic;
    if (change <= -0.5) flags.push(`消费者体验分大幅下降${Math.abs(change * 100).toFixed(0)}%`);
    else if (change <= -0.2) flags.push(`消费者体验分下降${Math.abs(change * 100).toFixed(0)}%`);
  }

  if (defectRate != null) {
    if (defectRate >= 0.05) flags.push(`劣质率过高 ${(defectRate * 100).toFixed(1)}% (阈值5%)`);
    else if (defectRate >= 0.02) flags.push(`劣质率偏高 ${(defectRate * 100).toFixed(1)}%`);
  }

  const pilotUnmetItems = parsePilotUnmetItems(current.pilotUnmetItems);
  for (const item of pilotUnmetItems) {
    flags.push(`领航员未达标：${item.dimension}/${item.metric} 当前${item.currentValue}${item.nextLevelStandard ? `，${item.nextLevelStandard}` : ''}`);
  }

  let severity: AnomalyDetection['severity'] = 'normal';
  if (flags.length >= 3 || pilotUnmetItems.length >= 3) severity = 'critical';
  else if (flags.length >= 1) severity = 'warning';

  return {
    isAnomaly: flags.length > 0,
    severity,
    flags,
    description: flags.length > 0
      ? `检测到${flags.length}个异常指标: ${flags.join('; ')}`
      : '所有指标正常，无异常波动',
  };
}

function computeAverages(historical: Record<string, unknown>[]): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  if (historical.length === 0) return result;

  const keys = Object.keys(historical[0]);
  for (const key of keys) {
    const values = historical.map((h) => asNumber(h[key])).filter((v): v is number => v != null);
    result[key] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }
  return result;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parsePilotUnmetItems(value: unknown): PilotUnmetItem[] {
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isPilotUnmetItem) : [];
  } catch {
    return [];
  }
}

function isPilotUnmetItem(value: unknown): value is PilotUnmetItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<PilotUnmetItem>;
  return typeof item.dimension === 'string'
    && typeof item.metric === 'string'
    && typeof item.currentValue === 'string'
    && item.isMet === false;
}

export async function detectAnomalies(
  current: Record<string, unknown>,
  historical: Record<string, unknown>[],
  storeAiConfig?: string | null,
): Promise<AnomalyDetection> {
  void storeAiConfig;
  return detectAnomaliesByRules(current, historical);
}
