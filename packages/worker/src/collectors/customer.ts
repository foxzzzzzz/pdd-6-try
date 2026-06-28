/**
 * 客服数据采集 - /sycm/goods_quality/customer
 */
import { BrowserManager } from '../browser';
import { MetricsSnapshot } from '@pdd-inspector/core';

export async function collectCustomerMetrics(
  browser: BrowserManager,
  storeId: number,
): Promise<Partial<MetricsSnapshot>> {
  const page = browser.getPage();
  const metrics: Partial<MetricsSnapshot> = {};

  try {
    await browser.navigateWithRetry('https://mms.pinduoduo.com/sycm/goods_quality/customer');
    const pageText: string = await page.evaluate('document.body.innerText || ""');
    Object.assign(metrics, parseCustomerMetricsText(pageText));

    await browser.takeScreenshot(storeId, 'customer');
  } catch (err) {
    console.error(`Customer metrics error for ${storeId}:`, err);
  }
  return metrics;
}

export function parseCustomerMetricsText(text: string): Partial<MetricsSnapshot> {
  return {
    customerThreeMinuteReplyRate: extractPercentAsDecimal(text, '3分钟人工回复率'),
    customerAvgResponseMinutes: extractNumber(text, '平均人工响应时长'),
  };
}

function extractNumber(text: string, label: string): number | null {
  const idx = text.indexOf(label);
  if (idx === -1) return null;
  const sub = text.substring(idx + label.length, idx + label.length + 80);
  const m = sub.match(/(\d+\.?\d*)/);
  return m ? parseFloat(m[1]) : null;
}

function extractPercentAsDecimal(text: string, label: string): number | null {
  const idx = text.indexOf(label);
  if (idx === -1) return null;
  const sub = text.substring(idx + label.length, idx + label.length + 80);
  const m = sub.match(/(\d+\.?\d*)\s*%/);
  return m ? parseFloat(m[1]) / 100 : null;
}
