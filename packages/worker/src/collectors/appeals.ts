/**
 * 申诉数据采集 — /orders/appeals
 */
import { BrowserManager } from '../browser';
import { MetricsSnapshot } from '@pdd-inspector/core';

export async function collectAppealMetrics(
  browser: BrowserManager,
  storeId: number,
): Promise<Partial<MetricsSnapshot>> {
  const page = browser.getPage();
  const metrics: Partial<MetricsSnapshot> = {};

  try {
    await browser.navigateWithRetry('https://mms.pinduoduo.com/orders/appeals?msfrom=mms_sidenav');
    const pageText: string = await page.evaluate('document.body.innerText || ""');

    const totalMatch = pageText.match(/共有\s*(\d+)\s*条/);
    metrics.appealCount = totalMatch ? parseInt(totalMatch[1]) : null;

    const passed = (pageText.match(/全部通过/g) || []).length;
    const rejected = (pageText.match(/全部驳回/g) || []).length;
    const total = passed + rejected;
    metrics.appealSuccessRate = total > 0 ? passed / total : null;

    await browser.takeScreenshot(storeId, 'appeals');
  } catch (err) {
    console.error(`Appeal metrics error for ${storeId}:`, err);
  }
  return metrics;
}
