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
    await page.waitForTimeout(3000);

    const pageText: string = await page.evaluate('document.body.innerText || ""');
    Object.assign(metrics, parseRefundMetricsText(pageText));

    await browser.takeScreenshot(storeId, 'refunds');
  } catch (err) {
    console.error(`Refund metrics error for ${storeId}:`, err);
  }
  return metrics;
}

export function parseRefundMetricsText(text: string): Partial<MetricsSnapshot> {
  return {
    refundDuration: extractNumber(text, '平均退款时长'),
    refundRate: extractPercentAsDecimal(text, '成功退款率'),
    disputeRate: extractPercentAsDecimal(text, '纠纷退款率'),
  };
}

function extractNumber(text: string, label: string): number | null {
  const idx = text.indexOf(label);
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

function extractPercentAsDecimal(text: string, label: string): number | null {
  const idx = text.indexOf(label);
  if (idx === -1) return null;
  const sub = text.substring(idx + label.length, idx + label.length + 50);
  const m = sub.match(/(\d+\.?\d*)\s*%/);
  if (!m) return null;
  return parseFloat(m[1]) / 100;
}
