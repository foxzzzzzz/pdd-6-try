import type { ActionJobData, StoreStatus } from '@pdd-inspector/core';

export type RiskControlKind = 'login' | 'security' | 'rate_limit' | 'permission';

export interface RiskControlSignal {
  kind: RiskControlKind;
  keyword: string;
}

const DEFAULT_ACTION_DELAY_MS: Record<ActionJobData['actionType'], [number, number]> = {
  reply: [8000, 20000],
  report: [20000, 60000],
  hide: [20000, 60000],
};

const RISK_KEYWORDS: Array<{ kind: RiskControlKind; keywords: string[] }> = [
  { kind: 'login', keywords: ['login required', '登录', '扫码', '二维码', '重新登录'] },
  { kind: 'security', keywords: ['安全验证', '验证码', '滑块', '短信验证', '账号安全', 'captcha', 'verify'] },
  { kind: 'rate_limit', keywords: ['操作频繁', '频繁', '稍后再试', 'too frequent', 'rate limit'] },
  { kind: 'permission', keywords: ['权限不足', '无权限', 'permission denied', 'forbidden'] },
];

export function clampActionConcurrency(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.min(1, Math.floor(value)) : 1;
}

export function resolveActionDelayMs(
  actionType: ActionJobData['actionType'],
  overrideRange?: string,
  randomValue = Math.random(),
): number {
  const [min, max] = parseDelayRange(overrideRange) || DEFAULT_ACTION_DELAY_MS[actionType];
  const boundedRandom = Math.max(0, Math.min(1, randomValue));
  return Math.round(min + (max - min) * boundedRandom);
}

export function detectRiskControlSignal(message: string | null | undefined): RiskControlSignal | null {
  const normalized = (message || '').toLowerCase();
  if (!normalized) return null;
  for (const item of RISK_KEYWORDS) {
    const keyword = item.keywords.find((candidate) => normalized.includes(candidate.toLowerCase()));
    if (keyword) return { kind: item.kind, keyword };
  }
  return null;
}

export function decideStoreStatusForRiskSignal(kind: RiskControlKind): StoreStatus {
  return kind === 'login' ? 'pending_login' : 'paused';
}

function parseDelayRange(value: string | undefined): [number, number] | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) return null;
  const min = parseInt(match[1], 10);
  const max = parseInt(match[2], 10);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) return null;
  return [min, max];
}
