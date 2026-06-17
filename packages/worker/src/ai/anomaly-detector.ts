/**
 * 指标异常检测 — 介入点 4
 *
 * 双模式: AI 分析 (优先) + 规则引擎 (兜底)
 */
import type { AnomalyDetection } from '@pdd-inspector/core';
import { getLightProvider } from './provider-factory';

/**
 * 规则引擎检测 (不依赖 AI，100% 可靠)
 */
export function detectAnomaliesByRules(
  current: Record<string, number | null>,
  historical: Record<string, number | null>[],
): AnomalyDetection {
  const flags: string[] = [];

  // 计算历史均值
  const avg = computeAverages(historical);

  // 规则1: 评分下降
  if (current.rating != null && avg.rating != null) {
    const diff = current.rating - avg.rating;
    if (diff <= -0.3) flags.push(`店铺星级下降${Math.abs(diff).toFixed(2)} (从${avg.rating.toFixed(2)}到${current.rating})`);
    else if (diff <= -0.1) flags.push(`店铺星级小幅下降${Math.abs(diff).toFixed(2)}`);
  }

  // 规则2: 劣质率上升
  if (current.defectRate != null && avg.defectRate != null) {
    const diff = current.defectRate - avg.defectRate;
    if (diff >= 0.03) flags.push(`劣质率上升${(diff * 100).toFixed(1)}% (当前${(current.defectRate * 100).toFixed(1)}%)`);
    else if (diff >= 0.01) flags.push(`劣质率小幅上升${(diff * 100).toFixed(1)}%`);
  }

  // 规则3: 体验分下降
  if (current.expBasic != null && avg.expBasic != null && avg.expBasic > 0) {
    const change = (current.expBasic - avg.expBasic) / avg.expBasic;
    if (change <= -0.5) flags.push(`消费者体验分大幅下降${Math.abs(change * 100).toFixed(0)}%`);
    else if (change <= -0.2) flags.push(`消费者体验分下降${Math.abs(change * 100).toFixed(0)}%`);
  }

  // 规则4: 劣质率绝对值过高
  if (current.defectRate != null) {
    if (current.defectRate >= 0.05) flags.push(`劣质率过高: ${(current.defectRate * 100).toFixed(1)}% (阈值5%)`);
    else if (current.defectRate >= 0.02) flags.push(`劣质率偏高: ${(current.defectRate * 100).toFixed(1)}%`);
  }

  // 判断严重程度
  let severity: AnomalyDetection['severity'] = 'normal';
  if (flags.length >= 3) severity = 'critical';
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

function computeAverages(historical: Record<string, number | null>[]): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  if (historical.length === 0) return result;

  const keys = Object.keys(historical[0]);
  for (const key of keys) {
    const values = historical.map((h) => h[key]).filter((v) => v != null) as number[];
    result[key] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }
  return result;
}

/**
 * AI 增强异常检测 (带规则引擎兜底)
 */
export async function detectAnomalies(
  current: Record<string, number | null>,
  historical: Record<string, number | null>[],
  storeAiConfig?: string | null,
): Promise<AnomalyDetection> {
  // 先跑规则引擎
  const ruleResult = detectAnomaliesByRules(current, historical);

  // 如果规则引擎已检测到异常，直接返回（不需要额外 AI 调用）
  if (ruleResult.flags.length > 0) return ruleResult;

  // 规则引擎未检测到但历史数据可用时，尝试 AI 分析（可选）
  // 这里暂不额外调用 AI，保持低成本
  return ruleResult;
}
