/**
 * 申诉数据采集
 * URL: /orders/appeals
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

    // 申诉记录数量
    const countText = await page.evaluate(() => {
      const body = document.body.innerText;
      const m = body.match(/共有\s*(\d+)\s*条/);
      return m ? m[1] : null;
    });
    if (countText) {
      metrics.appealCount = parseInt(countText, 10);
    }

    // 申诉成功率 — 统计审核状态
    const successRate = await page.evaluate(() => {
      const body = document.body.innerText;
      const allPassed = (body.match(/全部通过/g) || []).length;
      const total = (body.match(/全部[通过驳回]/g) || []).length;
      return total > 0 ? allPassed / total : null;
    });
    metrics.appealSuccessRate = successRate;

    await browser.takeScreenshot(storeId, 'appeals');
  } catch (err) {
    console.error(`Appeal metrics error for ${storeId}:`, err);
  }

  return metrics;
}
