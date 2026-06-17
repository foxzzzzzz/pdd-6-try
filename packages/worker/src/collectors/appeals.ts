/**
 * 申诉数据采集
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
    await page.waitForTimeout(3000);

    const data = await page.evaluate(function () {
      var text = document.body.innerText || '';
      var totalMatch = text.match(/共有\s*(\d+)\s*条/);
      var passed = (text.match(/全部通过/g) || []).length;
      var rejected = (text.match(/全部驳回/g) || []).length;
      return {
        total: totalMatch ? totalMatch[1] : '0',
        passed: String(passed),
        rejected: String(rejected),
      };
    });

    metrics.appealCount = parseInt(data.total, 10);
    const total = parseInt(data.total, 10);
    metrics.appealSuccessRate = total > 0 ? parseInt(data.passed) / total : null;

    await browser.takeScreenshot(storeId, 'appeals');
  } catch (err) {
    console.error(`Appeal metrics error for ${storeId}:`, err);
  }

  return metrics;
}
