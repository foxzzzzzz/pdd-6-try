/**
 * 售后/退款数据采集 — /aftersales/aftersale_list
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
    await browser.navigateWithRetry('https://mms.pinduoduo.com/aftersales/aftersale_list?msfrom=mms_sidenav');
    await page.waitForTimeout(3000);

    const pageText: string = await page.evaluate('document.body.innerText || ""');

    metrics.refundDuration = extractNumber(pageText, '待商家处理');
    metrics.disputeRate = extractNumber(pageText, '纠纷退款');

    await browser.takeScreenshot(storeId, 'refunds');
  } catch (err) {
    console.error(`Refund metrics error for ${storeId}:`, err);
  }
  return metrics;
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
