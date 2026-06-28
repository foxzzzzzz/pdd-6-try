/**
 * 售后/退款数据采集 — /sycm/goods_quality/detail
 */
import { BrowserManager } from '../browser';
import { MetricsSnapshot } from '@pdd-inspector/core';

export async function collectRefundMetrics(
  browser: BrowserManager,
  storeId: number,
): Promise<Partial<MetricsSnapshot>> {
  const page = browser.getPage();
  const metrics: Partial<MetricsSnapshot> = {};

  try {
    await browser.navigateWithRetry('https://mms.pinduoduo.com/sycm/goods_quality/detail');
    const pageText: string = await page.evaluate('document.body.innerText || ""');
    Object.assign(metrics, parseRefundMetricsText(pageText));

    await browser.takeScreenshot(storeId, 'refunds');
  } catch (err) {
    console.error(`Refund metrics error for ${storeId}:`, err);
  }
  return metrics;
}

export function parseRefundMetricsText(text: string): Partial<MetricsSnapshot> {
  const averageRefundDuration = extractNumber(text, '平均退款时长');
  const successfulRefundRate = extractPercentAsDecimal(text, '成功退款率');
  const disputeRefundRate = extractPercentAsDecimal(text, '纠纷退款率');

  return {
    refundDuration: averageRefundDuration,
    refundRate: successfulRefundRate,
    disputeRate: disputeRefundRate,
    disputeRefundCount: extractInteger(text, '纠纷退款数'),
    disputeRefundRate,
    interventionOrderCount: extractInteger(text, '介入订单数'),
    platformInterventionRate: extractPercentAsDecimal(text, '平台介入率'),
    qualityRefundRate: extractPercentAsDecimal(text, '品质退款率'),
    averageRefundDuration,
    successfulRefundOrderCount: extractInteger(text, '成功退款订单数'),
    successfulRefundAmount: extractNumber(text, '成功退款金额'),
    successfulRefundRate,
    returnRefundAutoDuration: extractNumber(text, '退货退款自主完结时长'),
    refundAutoDuration: extractNumber(text, '退款自主完结时长', '货'),
  };
}

function extractNumber(text: string, label: string, skipPrecededBy?: string): number | null {
  const idx = findLabelIndex(text, label, skipPrecededBy);
  if (idx === -1) return null;
  const sub = text.substring(idx + label.length, idx + label.length + 30);
  const m = sub.match(/(\d+\.?\d*)/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  // Skip years
  if (v === 2026 || v === 2025 || v === 2024) return null;
  if (m[1].length >= 4 && !m[1].includes('.')) return null;
  return v;
}

function extractInteger(text: string, label: string): number | null {
  const value = extractNumber(text, label);
  return value == null ? null : Math.trunc(value);
}

function extractPercentAsDecimal(text: string, label: string): number | null {
  const idx = findLabelIndex(text, label);
  if (idx === -1) return null;
  const sub = text.substring(idx + label.length, idx + label.length + 50);
  const m = sub.match(/(\d+\.?\d*)\s*%/);
  if (!m) return null;
  return parseFloat(m[1]) / 100;
}

function findLabelIndex(text: string, label: string, skipPrecededBy?: string): number {
  let idx = text.indexOf(label);
  while (idx !== -1) {
    if (!skipPrecededBy || text[idx - 1] !== skipPrecededBy) return idx;
    idx = text.indexOf(label, idx + label.length);
  }
  return -1;
}
